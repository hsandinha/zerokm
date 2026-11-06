// Relatório de Origens: de onde vieram as conversas do período e quantas
// viraram venda (etapa "ganho"). Função pura, conferida em teste: relatório
// errado é pior que relatório nenhum, porque dele saem decisões de verba.
//
// Quem conta: cada conversa entra UMA vez no período.
// - Chegou por anúncio dentro do período (origem.em): conta no anúncio, mesmo
//   que a conversa seja antiga (o cliente voltou pelo anúncio).
// - Senão, se nasceu no período: na campanha que a abriu, ou em "sem anúncio"
//   pelo canal.
// - Venda é a conversa que está em "ganho" hoje.

import { nomeDaOrigem, NOME_DO_CANAL_DA_ORIGEM } from "@wa/lib/origem";

export type ConversaDoRelatorio = {
  id: string;
  stage: string;
  createdAt: Date | string;
  campaignId?: string | null;
  /** Canal da conversa (whatsapp, instagram, messenger, sms). */
  canal: string;
  origem?: {
    idOrigem?: string | null;
    canal: string;
    titulo?: string | null;
    texto?: string | null;
    em: Date | string;
  } | null;
};

export type FonteDaLinha = "anuncio" | "campanha" | "direto";

export type LinhaDeOrigem = {
  chave: string;
  fonte: FonteDaLinha;
  nome: string;
  canal: string | null;
  idOrigem: string | null;
  conversas: number;
  vendas: number;
};

const NOME_DO_CANAL: Record<string, string> = { ...NOME_DO_CANAL_DA_ORIGEM, sms: "SMS" };
const ORDEM: Record<FonteDaLinha, number> = { anuncio: 0, campanha: 1, direto: 2 };

function dentro(d: Date | string | null | undefined, desde: number, ate: number): boolean {
  if (!d) return false;
  const t = new Date(d).getTime();
  return Number.isFinite(t) && t >= desde && t <= ate;
}

export function relatorioDeOrigens(p: {
  conversas: ConversaDoRelatorio[];
  anuncios?: Array<{ idOrigem: string; apelido?: string | null; titulo?: string | null; texto?: string | null }>;
  campanhas?: Array<{ id: string; name: string }>;
  desde: Date;
  ate: Date;
}): { linhas: LinhaDeOrigem[]; total: { conversas: number; vendas: number }; porAnuncio: { conversas: number; vendas: number } } {
  const desde = p.desde.getTime();
  const ate = p.ate.getTime();
  const catalogo = new Map((p.anuncios ?? []).map((a) => [a.idOrigem, a]));
  const campanha = new Map((p.campanhas ?? []).map((c) => [c.id, c.name]));
  const linhas = new Map<string, LinhaDeOrigem>();
  const vistas = new Set<string>();

  const linha = (chave: string, base: Omit<LinhaDeOrigem, "chave" | "conversas" | "vendas">) => {
    let l = linhas.get(chave);
    if (!l) {
      l = { chave, ...base, conversas: 0, vendas: 0 };
      linhas.set(chave, l);
    }
    return l;
  };

  for (const c of p.conversas) {
    if (vistas.has(c.id)) continue;
    vistas.add(c.id);
    let l: LinhaDeOrigem | null = null;
    if (c.origem && dentro(c.origem.em, desde, ate)) {
      const id = c.origem.idOrigem ?? null;
      const chave = id ? `anuncio:${id}` : `anuncio:sem-id:${(c.origem.texto || c.origem.titulo || "").slice(0, 60)}`;
      const cat = id ? catalogo.get(id) : undefined;
      l = linha(chave, {
        fonte: "anuncio",
        nome: nomeDaOrigem({ ...c.origem, apelido: cat?.apelido, idOrigem: id }),
        canal: c.origem.canal,
        idOrigem: id,
      });
    } else if (dentro(c.createdAt, desde, ate)) {
      if (c.campaignId) {
        l = linha(`campanha:${c.campaignId}`, {
          fonte: "campanha",
          nome: `Campanha: ${campanha.get(c.campaignId) ?? "sem nome"}`,
          canal: "whatsapp",
          idOrigem: null,
        });
      } else {
        l = linha(`direto:${c.canal}`, {
          fonte: "direto",
          nome: `Sem anúncio · ${NOME_DO_CANAL[c.canal] ?? c.canal}`,
          canal: c.canal,
          idOrigem: null,
        });
      }
    }
    if (!l) continue;
    l.conversas++;
    if (c.stage === "ganho") l.vendas++;
  }

  const lista = [...linhas.values()].sort(
    (a, b) => ORDEM[a.fonte] - ORDEM[b.fonte] || b.conversas - a.conversas || b.vendas - a.vendas || a.nome.localeCompare(b.nome, "pt-BR"),
  );
  const soma = (ls: LinhaDeOrigem[]) => ({
    conversas: ls.reduce((n, l) => n + l.conversas, 0),
    vendas: ls.reduce((n, l) => n + l.vendas, 0),
  });
  return { linhas: lista, total: soma(lista), porAnuncio: soma(lista.filter((l) => l.fonte === "anuncio")) };
}

/** Período da tela: os últimos N dias até agora (no máximo um ano). */
export function periodoDosUltimos(dias: number, agora = new Date()): { desde: Date; ate: Date } {
  const n = Math.min(Math.max(Math.floor(dias) || 30, 1), 365);
  return { desde: new Date(agora.getTime() - n * 86400_000), ate: agora };
}
