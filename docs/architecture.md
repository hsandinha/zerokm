# Zero KM Platform – Frontend Architecture (Fase 1)

## Objetivos
- Reproduzir a experiência da mesa de operações (referência Correio de Veículos) com tabelas compactas e navegação rápida.
- Disponibilizar visão executiva com indicadores de estoque, atualizações e funil.
- Suportar configurações de margem por versão, logística e controle de acesso (UI e camadas prontas para integração futura).

## Stack
- **Next.js 14** (App Router) com renderização híbrida.
- **TypeScript** para tipagem dos domínios (veículos, transportadoras, usuários, concessões).
- **CSS Modules + Design Tokens** definidos em `styles/theme.css` para aplicar branding futuro sem refatorações.
- **Mock Service Layer** em `lib/data` simulando API REST futura; fácil substituição por chamadas reais.

## Estrutura de Pastas
- `app/layout.tsx` – layout global, cabeçalho e navegação lateral.
- `app/(dashboard)` – páginas agrupadas pelo shell primário.
  - `page.tsx` – visão geral com indicadores de estoque, funil e alertas de inatividade.
  - `catalogo/page.tsx` – mesa principal de consulta e filtros.
  - `logistica/page.tsx` – tabela de transportadoras e custos.
  - `fornecedores/page.tsx` – base de fornecedores e contatos.
  - `configuracoes/page.tsx` – parâmetros de margem, regras e auditoria.
  - `auditoria/page.tsx` – histórico de ações (mock).
- `components` – peças reutilizáveis (cards, tabelas dinâmicas, filtros, badges).
- `lib/data` – data mocks, funções de cálculo de margem, detecção de duplicatas e outliers.
- `lib/utils` – helpers (formatters, percentuais, datas).

## Modelagem
```ts
type Vehicle = {
  id: string;
  model: string;
  version: string;
  color: string;
  modelYear: string;
  status: 'A FATURAR' | 'PRONTA ENTREGA' | 'EM TRÂNSITO';
  supplierCode: string;
  sitePrice: number;
  salePrice: number;
  margin: number; // calculada
  lastUpdate: string;
  logisticsCompanyId?: string;
  flags: {
    duplicate?: boolean;
    outlier?: boolean;
  };
};
```

- Tabelas derivadas calculam **margem** (`sitePrice - salePrice`), classificações (verde/amarelo/vermelho) e *tooltips* de auditoria.
- Configurações como prazo de expiração de estoque e limites de outlier ficam em `lib/config/constants.ts`.

## UX Principles
- Layout responsivo focado em desktop (>=1280px) com grid denso e atalhos via teclado preparados.
- Filtros persistentes no catálogo, resultados em tabela com colunas ajustáveis.
- Alertas e badges para duplicidade/outliers replicando linguagem do operador (ex.: “Duplicado”, “Margem negativa”).
- Dashboards com cards e visualização de semáforo para SLA de atualização.

## Evolução
- Dados mock podem ser trocados por API GraphQL/REST sem alterar componentes (usar `async` data fetching no lado do servidor quando disponível).
- Integração futura com PWA prevista: manter componentes client-friendly e evitar dependências pesadas.
- Espaço para integração de IA via hooks em `lib/insights` (placeholder).

