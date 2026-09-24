// URL pública do app.
//
// `NEXT_PUBLIC_SITE_URL` sozinha não serve: basta alguém copiar o .env.local
// para a Vercel — como aconteceu — e o valor `http://localhost:3000` vai para
// produção, quebrando o webhook da Meta e os links de recuperação de senha.
//
// A fonte mais confiável é o host que ATENDEU a requisição. A variável de
// ambiente vira só o último recurso, e nunca vence um host público.

import type { NextRequest } from "next/server";

function ehLocal(url: string): boolean {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(url);
}

function limpar(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Base pública (sem barra no fim), na melhor fonte disponível. */
export function siteUrl(req?: NextRequest | Request): string {
  const candidatos: string[] = [];

  if (req) {
    const headers = req.headers;
    const host = headers.get("x-forwarded-host") ?? headers.get("host");
    const proto = headers.get("x-forwarded-proto") ?? "https";
    if (host) candidatos.push(`${proto}://${host}`);
    // `nextUrl` só existe no NextRequest.
    const nextUrl = (req as NextRequest).nextUrl;
    if (nextUrl?.origin) candidatos.push(nextUrl.origin);
  }

  // A Vercel expõe o domínio de produção mesmo em preview.
  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelProd) candidatos.push(`https://${vercelProd}`);
  const vercel = process.env.VERCEL_URL;
  if (vercel) candidatos.push(`https://${vercel}`);

  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) candidatos.push(env);

  // Primeiro candidato público vence; localhost só se não houver outro.
  const publico = candidatos.find((c) => c && !ehLocal(c));
  return limpar(publico ?? candidatos[0] ?? "http://localhost:3000");
}

export function isLocalUrl(url: string): boolean {
  return ehLocal(url);
}
