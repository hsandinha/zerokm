// Service worker SÓ dos avisos (push) do atendimento: mostra o aviso e, no
// clique, abre a conversa. Não guarda páginas em cache, não intercepta
// requisições e não há manifest: o painel não é um app instalável (decisão
// do dono). No iPhone o Safari só entrega push para site adicionado à Tela de
// Início; no Android e no computador funciona com o navegador comum.
//
// Quem está com o painel na frente não recebe o aviso: o servidor já não
// manda (wa/lib/push.ts, pelo sinal de foco da moldura). Aqui todo push vira
// notificação, porque a inscrição é `userVisibleOnly` e o navegador cancela
// (Safari) ou troca por um aviso genérico (Chrome) o push que não mostra nada.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  // Ler o payload nunca pode derrubar o handler: sem aviso, o navegador
  // cancela a inscrição do aparelho.
  let dados = {};
  if (event.data) {
    try {
      dados = event.data.json() || {};
    } catch (e) {
      try {
        dados = { body: event.data.text() };
      } catch (e2) {
        dados = {};
      }
    }
  }
  if (typeof dados !== "object" || dados === null) dados = {};
  const titulo = dados.title || "Atendimento";
  const opcoes = {
    body: dados.body || "",
    tag: dados.tag || undefined,
    // Mesma tag troca o aviso anterior da conversa; `renotify` faz o aparelho
    // avisar de novo em vez de trocar a linha em silêncio.
    renotify: Boolean(dados.tag),
    data: { url: dados.url || "/dashboard/atendimento/central" },
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    lang: "pt-BR",
    timestamp: Date.now(),
  };
  event.waitUntil(
    self.registration
      .showNotification(titulo, opcoes)
      .catch(() => self.registration.showNotification(titulo, { body: opcoes.body }))
      .catch(() => self.registration.showNotification("Atendimento")),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) || "/dashboard/atendimento/central";
  const url = new URL(destino, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const janelas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Painel já aberto: usa a mesma aba e vai direto para a conversa.
      const aberta = janelas.find((c) => new URL(c.url).origin === self.location.origin);
      if (aberta) {
        await aberta.focus();
        if ("navigate" in aberta) {
          try {
            await aberta.navigate(url);
            return;
          } catch (e) {
            // Aba fora do escopo do service worker: abre uma nova.
          }
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
