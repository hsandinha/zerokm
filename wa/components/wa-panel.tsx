"use client";

// De quem é o painel que está aberto: o do CNV (a Vera) ou o de uma loja.
// Os componentes da central, do funil e dos contatos são os mesmos nos dois;
// isto diz para onde os links apontam e quais nomes de etapa mostrar.

import { createContext, useContext } from "react";

export type WaPanel = {
  /** Raiz das páginas do painel. */
  base: string;
  /** true = painel de uma loja (concessionária/lojista). */
  store: boolean;
};

const CNV: WaPanel = { base: "/dashboard/admin/whatsapp", store: false };
export const STORE_PANEL: WaPanel = { base: "/dashboard/atendimento", store: true };

const WaPanelContext = createContext<WaPanel>(CNV);

export function WaPanelProvider({ value, children }: { value: WaPanel; children: React.ReactNode }) {
  return <WaPanelContext.Provider value={value}>{children}</WaPanelContext.Provider>;
}

export function useWaPanel(): WaPanel {
  return useContext(WaPanelContext);
}
