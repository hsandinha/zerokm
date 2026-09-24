// Gravação da audiência: transforma AudienceRow em empresa (`wa_targets`) e,
// quando há telefone, em contato (`wa_contacts`).
//
// É idempotente: reimportar a mesma lista atualiza, não duplica. E é aqui que
// moram as travas que protegem o número do WhatsApp:
//
//   - CNPJ e CPF são validados por dígito verificador (erro de digitação não
//     vira alvo);
//   - telefone é canonizado para +55DDD9XXXXXXXX e fixo não entra em disparo;
//   - quem JÁ é cliente da CNV entra suprimido — nunca oferecer o produto a
//     quem já paga por ele;
//   - quem pediu opt-out continua fora, mesmo voltando na planilha.

import dbConnect from "@/lib/mongodb";
import { WaContact } from "@wa/models/wa";
import { WaImport, WaImportRow, WaTarget } from "@wa/models/base";
import { isValidCnpj, isValidCpf, onlyDigits } from "@wa/lib/documento";
import { parsePhoneBr } from "@wa/lib/phone";
import { isAlreadyCustomer, upsertPartner } from "@wa/lib/enrichment";
import type { AudienceRow, IngestResult } from "./types";

export type IngestInput = { line: number; raw: Record<string, unknown>; row: AudienceRow };

/** Uma linha só serve se der para achar a empresa OU falar com alguém. */
function validate(row: AudienceRow): string | null {
  const cnpj = onlyDigits(row.cnpj);
  const phone = parsePhoneBr(row.phone);

  if (!cnpj && !phone.valid) return "linha sem CNPJ e sem telefone válido";
  if (cnpj && !isValidCnpj(cnpj)) return `CNPJ inválido (${row.cnpj})`;
  if (row.phone && !phone.valid) return `telefone inválido: ${phone.reason}`;
  if (row.partnerTaxId && !isValidCpf(row.partnerTaxId)) {
    return `CPF do sócio inválido (${row.partnerTaxId})`;
  }
  return null;
}

export async function ingestRows(
  importId: string,
  input: IngestInput[],
  opts: { source?: "csv" | "cnpja" | "manual" } = {},
): Promise<IngestResult> {
  await dbConnect();
  const source = opts.source ?? "csv";
  const result: IngestResult = {
    rowsTotal: input.length,
    rowsOk: 0,
    rowsError: 0,
    targetsUpserted: 0,
    contactsUpserted: 0,
    alreadyCustomers: 0,
    errors: [],
  };

  // A mesma empresa (ou o mesmo telefone) pode aparecer várias vezes no
  // arquivo; a primeira ocorrência é a que vale.
  const seenCnpj = new Set<string>();
  const seenPhone = new Set<string>();

  for (const item of input) {
    const problem = validate(item.row);
    if (problem) {
      result.rowsError++;
      result.errors.push({ line: item.line, error: problem });
      await WaImportRow.create({
        importId,
        line: item.line,
        raw: item.raw,
        status: "error",
        error: problem,
      });
      continue;
    }

    try {
      const cnpj = onlyDigits(item.row.cnpj);
      const parsed = parsePhoneBr(item.row.phone);
      const phone = parsed.valid ? parsed.e164 : null;

      // ── Sócio, quando a lista trouxe ────────────────────────
      let partnerId: string | null = null;
      if (item.row.partnerTaxId || item.row.partnerName) {
        const partner = await upsertPartner({
          document: onlyDigits(item.row.partnerTaxId) || `sem-cpf:${item.row.partnerName}`,
          name: item.row.partnerName ?? "(sem nome)",
          kind: "PF",
        });
        partnerId = partner.id;
      }

      // ── Empresa ─────────────────────────────────────────────
      let targetId: string | null = null;
      if (cnpj && !seenCnpj.has(cnpj)) {
        seenCnpj.add(cnpj);
        const customer = await isAlreadyCustomer(cnpj);
        if (customer) result.alreadyCustomers++;

        const target = await WaTarget.findOneAndUpdate(
          { cnpj },
          {
            $setOnInsert: {
              cnpj,
              source,
              status: customer ? "suppressed" : phone ? "ready" : "new",
              suppressedReason: customer ? "já é cliente da CNV" : undefined,
            },
            $set: {
              ...(item.row.company ? { legalName: item.row.company } : {}),
              ...(item.row.city ? { city: item.row.city } : {}),
              ...(item.row.state ? { state: item.row.state.toUpperCase().slice(0, 2) } : {}),
              ...(item.row.cnae ? { cnae: item.row.cnae } : {}),
              ...(item.row.email ? { email: item.row.email.toLowerCase() } : {}),
              ...(item.row.contactName ? { contactName: item.row.contactName } : {}),
              ...(phone ? { phone, phoneSource: source === "cnpja" ? "cnpja" : "csv" } : {}),
              ...(partnerId ? { partnerId } : {}),
              importId,
              raw: item.raw,
            },
          },
          { new: true, upsert: true },
        );
        targetId = String(target._id);
        result.targetsUpserted++;

        // Empresa que ganhou telefone sai de "new" e entra na fila.
        if (phone && target.status === "new") {
          target.status = "ready";
          await target.save();
        }
      } else if (cnpj) {
        const existing = await WaTarget.findOne({ cnpj }).select("_id").lean();
        targetId = existing ? String(existing._id) : null;
      }

      // ── Contato ─────────────────────────────────────────────
      // Só celular vira contato: fixo entra na base da empresa, mas não recebe
      // WhatsApp — mandar para fixo é falha garantida no disparo.
      if (phone && parsed.kind === "movel" && !seenPhone.has(phone)) {
        seenPhone.add(phone);
        await WaContact.findOneAndUpdate(
          { phone },
          {
            $setOnInsert: { phone, source: source === "cnpja" ? "cnpja" : "csv" },
            $set: {
              ...(item.row.contactName ? { name: item.row.contactName } : {}),
              ...(item.row.company ? { company: item.row.company } : {}),
              ...(item.row.city ? { city: item.row.city } : {}),
              ...(item.row.state ? { state: item.row.state.toUpperCase().slice(0, 2) } : {}),
              ...(item.row.email ? { email: item.row.email.toLowerCase() } : {}),
              ...(cnpj ? { document: cnpj } : {}),
              ...(targetId ? { targetId } : {}),
            },
          },
          { new: true, upsert: true },
        );
        result.contactsUpserted++;
      }

      result.rowsOk++;
      await WaImportRow.create({
        importId,
        line: item.line,
        raw: item.raw,
        status: "ok",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.rowsError++;
      result.errors.push({ line: item.line, error: message });
      await WaImportRow.create({
        importId,
        line: item.line,
        raw: item.raw,
        status: "error",
        error: message.slice(0, 300),
      });
    }
  }

  // Os contadores ACUMULAM: o arquivo chega em lotes (o browser fatia porque
  // 30 mil linhas de uma vez estouram o limite de body da Vercel), e cada lote
  // soma ao registro da importação.
  await WaImport.updateOne(
    { _id: importId },
    {
      $inc: {
        rowsTotal: result.rowsTotal,
        rowsOk: result.rowsOk,
        rowsError: result.rowsError,
      },
    },
  );

  return result;
}

/** Fecha o registro depois do último lote. */
export async function finishImport(importId: string, error?: string): Promise<void> {
  await dbConnect();
  await WaImport.updateOne(
    { _id: importId },
    { status: error ? "failed" : "done", ...(error ? { error: error.slice(0, 300) } : {}) },
  );
}
