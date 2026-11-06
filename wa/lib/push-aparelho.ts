// Inscrição de push deste navegador (lado do cliente). A moldura liga e
// desliga pelo sino (wa/components/equipe-status.tsx); o botão de sair chama
// desligarAvisosDoAparelho antes de encerrar a sessão, para o aparelho não
// seguir recebendo conversa da loja depois que a pessoa saiu dele.

export const SW_URL = "/sw-push.js";
export const SW_ESCOPO = "/dashboard/";

export async function inscricaoAtual(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration(SW_ESCOPO);
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/**
 * Tira a inscrição deste aparelho no servidor e no navegador. Precisa rodar
 * com a sessão ainda aberta (a rota confere quem é). Nunca lança e nunca
 * segura o sair por mais de 3 segundos; sem inscrição, não faz nada.
 */
export async function desligarAvisosDoAparelho(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const tarefa = (async () => {
    const sub = await inscricaoAtual();
    if (!sub) return;
    await fetch("/api/wa/push", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  })().catch(() => {});
  await Promise.race([tarefa, new Promise((r) => setTimeout(r, 3000))]);
}
