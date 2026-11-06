// Editar, trocar a situação, reordenar as fotos ou excluir um carro do
// estoque local do lojista.
//
// Trocar só a situação (reservou, vendeu, voltou a ficar disponível) é do dia
// a dia do vendedor: qualquer um da equipe pode, direto da lista. O resto da
// ficha, a ordem das fotos e a exclusão são do gestor, como o cadastro.

import { NextRequest, NextResponse } from "next/server";
import { parseRepasseFipe, validateRepasse } from "@/lib/utils/repasse";
import { carroDoLojista, lojistaDoEscopo, serializarCarroLocal } from "@wa/lib/estoque-local";
import { validarFichaLocal } from "@wa/lib/estoque-ficha";
import { apagarFotosEstoque } from "@wa/lib/foto-estoque";
import { scopeError } from "@wa/lib/scope";

type Params = { params: Promise<{ id: string }> };

function erro(err: unknown) {
  const { error, status } = scopeError(err);
  return NextResponse.json({ error }, { status });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  const soSituacao = Object.keys(body).length === 1 && "situacao" in body;

  let ctx;
  try {
    ctx = await lojistaDoEscopo(!soSituacao);
  } catch (err) {
    return erro(err);
  }
  const doc = await carroDoLojista(id, ctx.lojistaId);
  if (!doc) return NextResponse.json({ error: "Carro não encontrado" }, { status: 404 });

  const { status: _status, fotos: fotosPedidas, ...resto } = body;
  void _status;
  const base = validateRepasse(resto, true);
  const ficha = validarFichaLocal(resto, true);
  const errors = [...base.errors, ...ficha.errors];
  if (errors.length) return NextResponse.json({ error: errors.join(" "), errors }, { status: 400 });
  const fipe = parseRepasseFipe(resto);
  if (fipe.error) return NextResponse.json({ error: fipe.error }, { status: 400 });

  doc.set(base.data);
  doc.set(ficha.data);
  if (ficha.data.situacao && ficha.data.situacao !== (doc.situacao ?? "disponivel")) doc.situacaoEm = new Date();
  if (fipe.codigoFipe !== undefined) {
    doc.set({
      codigoFipe: fipe.codigoFipe || undefined,
      descricaoFipe: fipe.descricaoFipe || undefined,
      foraDoCatalogo: !fipe.codigoFipe,
    });
  }

  // Ordem das fotos (a primeira é a capa). Só vale reordenar ou tirar o que
  // já é deste carro; foto nova entra pela rota de fotos.
  let removidas: string[] = [];
  if (fotosPedidas !== undefined) {
    if (!Array.isArray(fotosPedidas)) return NextResponse.json({ error: "Lista de fotos inválida" }, { status: 400 });
    const atuais = (doc.fotos ?? []).map(String);
    const pedidas = [...new Set(fotosPedidas.map(String))].filter((f) => atuais.includes(f));
    removidas = atuais.filter((f) => !pedidas.includes(f));
    doc.set("fotos", pedidas);
  }

  await doc.save();
  if (removidas.length) await apagarFotosEstoque({ tenantId: ctx.tenantId, veiculoId: doc._id, ids: removidas });
  return NextResponse.json(serializarCarroLocal(doc));
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  let ctx;
  try {
    ctx = await lojistaDoEscopo(true);
  } catch (err) {
    return erro(err);
  }
  const doc = await carroDoLojista(id, ctx.lojistaId);
  if (!doc) return NextResponse.json({ error: "Carro não encontrado" }, { status: 404 });
  // Sai do cadastro e fica no histórico (igual ao repasse). As fotos vão
  // embora: não têm validade e ninguém mais as mostra.
  doc.ativo = false;
  doc.removidoEm = new Date();
  doc.set("fotos", undefined);
  await doc.save();
  await apagarFotosEstoque({ tenantId: ctx.tenantId, veiculoId: doc._id });
  return NextResponse.json({ ok: true });
}
