// Cadastro criado pela IA — replica o fluxo de POST /api/cadastro/cliente da
// zerokm: Firebase Auth guarda a senha, o Mongo guarda o perfil, e todo novo
// usuário nasce `gratis` com teste grátis de 24h (o "trial" que a IA oferece).
// A senha é temporária e forcePasswordChange=true obriga a troca no 1º login.

import { randomBytes } from "crypto";
import { adminAuth } from "@/lib/firebase-admin";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { WaContact } from "@wa/models/wa";
import { validateCNPJ, validateCPF } from "@wa/lib/documento";

export const FREE_TRIAL_DURATION_MS = 24 * 60 * 60 * 1000;

function createFreeTrialWindow(now = new Date()) {
  return {
    freeTrialStartedAt: now,
    freeTrialExpiresAt: new Date(now.getTime() + FREE_TRIAL_DURATION_MS),
  };
}

function cleanDigits(v: string) {
  return v.replace(/\D/g, "");
}

/** Senha temporária legível (sem caracteres ambíguos como 0/O, 1/l). */
export function generateTempPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(10);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

// Cada rótulo do domínio precisa ter conteúdo e o TLD ao menos dois
// caracteres. `includes("@")` deixava passar "fulano@gmail com" — espaço no
// lugar do ponto, erro frequente de quem digita no WhatsApp. O endereço passava
// daqui, o Firebase recusava com auth/invalid-email e o cliente ouvia que a
// conta dele já existia.
const EMAIL_REGEX = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)*\.[^\s@.]{2,}$/;

/** Motivo da falha, para o atendimento responder sem depender de interpretação.
 *
 *  `infra` é diferente de todo o resto: o dado do cliente estava certo e o que
 *  falhou foi do nosso lado (credencial do Firebase, banco fora). Pedir para a
 *  pessoa repetir nome e e-mail nesse caso é perder o lead duas vezes — foi o
 *  que aconteceu em 4 e 5 de agosto. */
export type RegisterErrorCode =
  | "invalid_name"
  | "invalid_email"
  | "invalid_document"
  | "email_taken"
  | "document_taken"
  | "infra"
  | "failed";

export type RegisterResult =
  | { ok: true; firebaseUid: string; userId: string; tempPassword: string; trialExpiresAt: Date }
  | {
      ok: false;
      code: RegisterErrorCode;
      error: string;
      /** Mensagem técnica do erro original — vai para o log e para a nota
       *  interna da conversa, NUNCA para o cliente. */
      detail?: string;
    };

export async function registerClient(params: {
  nome: string;
  email: string;
  documento?: string; // CPF ou CNPJ
  telefone: string; // dígitos com DDI (vem do contato da conversa)
  contactId?: string; // WaContact a vincular
}): Promise<RegisterResult> {
  const nome = (params.nome ?? "").trim();
  const email = (params.email ?? "").toLowerCase().trim();

  if (!nome) {
    return { ok: false, code: "invalid_name", error: "Nome não informado" };
  }
  if (!EMAIL_REGEX.test(email)) {
    return { ok: false, code: "invalid_email", error: `E-mail inválido: "${params.email}"` };
  }
  // Contar dígitos não basta: 111.111.111-11 passava e a conta nascia com um
  // documento que o Mercado Pago recusa na hora de cobrar.
  const docClean = params.documento ? cleanDigits(params.documento) : "";
  if (docClean) {
    const documentoValido =
      (docClean.length === 11 && validateCPF(docClean)) ||
      (docClean.length === 14 && validateCNPJ(docClean));
    if (!documentoValido) {
      return {
        ok: false,
        code: "invalid_document",
        error: `Documento inválido: "${params.documento}"`,
      };
    }
  }

  await dbConnect();

  const existingEmail = await User.findOne({ email });
  if (existingEmail) {
    return { ok: false, code: "email_taken", error: "Este e-mail já está cadastrado" };
  }
  if (docClean) {
    const existingDoc = await User.findOne({ cpf: docClean });
    if (existingDoc) {
      return { ok: false, code: "document_taken", error: "Este CPF/CNPJ já está cadastrado" };
    }
  }

  const tempPassword = generateTempPassword();

  // A credencial pode ter sobrado de uma tentativa que falhou no Mongo. Como já
  // confirmamos acima que não há usuário aqui, ninguém consegue usar essa conta
  // — adotamos em vez de travar o e-mail para sempre.
  let firebaseUid: string;
  let adotado = false;
  try {
    const record = await adminAuth.createUser({
      email,
      password: tempPassword,
      displayName: nome,
      emailVerified: false,
      disabled: false,
    });
    firebaseUid = record.uid;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "auth/email-already-exists") {
      try {
        const orfao = await adminAuth.getUserByEmail(email);
        await adminAuth.updateUser(orfao.uid, { password: tempPassword, displayName: nome });
        firebaseUid = orfao.uid;
        adotado = true;
        console.warn(`[register] Credencial órfã adotada: ${email} (uid ${orfao.uid})`);
      } catch (adoptErr) {
        console.error("[register] Falha ao adotar credencial órfã:", adoptErr);
        return { ok: false, code: "email_taken", error: "Este e-mail já está cadastrado" };
      }
    } else if (code === "auth/invalid-email") {
      return { ok: false, code: "invalid_email", error: `E-mail inválido: "${params.email}"` };
    } else {
      // Credencial inválida, projeto errado, cota, rede: nada disso melhora se
      // o cliente digitar o e-mail de novo.
      const detail = `${code ?? "sem código"}: ${err instanceof Error ? err.message : String(err)}`;
      console.error("[register] Firebase createUser falhou:", detail);
      return {
        ok: false,
        code: "infra",
        error: "Não foi possível criar a conta no Firebase",
        detail,
      };
    }
  }

  const freeTrial = createFreeTrialWindow();

  let user;
  try {
    user = await User.create({
      firebaseUid,
      email,
      displayName: nome,
      phoneNumber: cleanDigits(params.telefone) || undefined,
      cpf: docClean || undefined,
      allowedProfiles: ["gratis"],
      defaultProfile: "gratis",
      forcePasswordChange: true,
      credits: 0,
      ...freeTrial,
    });
  } catch (err) {
    // Sem isto o e-mail fica preso: credencial no Firebase, perfil nenhum no
    // Mongo, e toda tentativa seguinte esbarra em "já cadastrado".
    if (!adotado) {
      await adminAuth.deleteUser(firebaseUid).catch((rollbackErr) => {
        console.error(`[register] Falha ao desfazer o uid ${firebaseUid}:`, rollbackErr);
      });
    }
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[register] User.create falhou:", detail);
    return {
      ok: false,
      code: "infra",
      error: "Não foi possível gravar o cadastro no banco",
      detail,
    };
  }

  if (params.contactId) {
    await WaContact.updateOne(
      { _id: params.contactId },
      { userId: user._id.toString(), firebaseUid, email, name: params.nome.trim(), document: docClean || undefined },
    ).catch(() => {});
  }

  return {
    ok: true,
    firebaseUid,
    userId: user._id.toString(),
    tempPassword,
    trialExpiresAt: freeTrial.freeTrialExpiresAt,
  };
}

/** Situação do contato no funil (injetada no prompt a cada rodada da IA). */
export async function getFunnelStatus(contact: {
  userId?: string;
  firebaseUid?: string;
  phone: string;
  email?: string;
}): Promise<{
  registered: boolean;
  user?: {
    displayName?: string;
    email: string;
    subscriptionActive: boolean;
    planId?: string;
    trialActive: boolean;
    trialExpiresAt?: Date;
  };
}> {
  await dbConnect();
  const digits = contact.phone.replace(/\D/g, "");
  const query: Record<string, unknown>[] = [];
  if (contact.firebaseUid) query.push({ firebaseUid: contact.firebaseUid });
  if (contact.email) query.push({ email: contact.email });
  if (digits) query.push({ phoneNumber: digits });
  // Números BR: o cadastro pode ter sido salvo sem o DDI 55
  if (digits.startsWith("55")) query.push({ phoneNumber: digits.slice(2) });

  const user = query.length > 0 ? await User.findOne({ $or: query }) : null;
  if (!user) return { registered: false };

  const now = Date.now();
  const subscriptionActive =
    user.subscription?.status === "active" &&
    (!user.subscription.expiresAt || new Date(user.subscription.expiresAt).getTime() > now);
  const trialActive =
    !!user.freeTrialExpiresAt && new Date(user.freeTrialExpiresAt).getTime() > now;

  return {
    registered: true,
    user: {
      displayName: user.displayName,
      email: user.email,
      subscriptionActive,
      planId: user.subscription?.planId,
      trialActive,
      trialExpiresAt: user.freeTrialExpiresAt,
    },
  };
}
