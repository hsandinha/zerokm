# Zero KM – Frontend (Fase 1)

Interface Next.js para a plataforma Zero KM, seguindo o manual funcional e visual compartilhado.

## Scripts

```bash
npm install
npm run dev
```

## Estrutura

- `app/` – páginas e layout App Router.
- `components/` – componentes reutilizáveis (cards, tabelas, filtros).
- `lib/data/` – camadas mock que simulam APIs até integração com backend.
- `lib/utils/` – helpers de formatação e cálculos.
- `lib/services/` – serviços de integração com Firebase.
- `docs/` – documentação técnica e guias de uso:
  - `architecture.md` – visão arquitetural e decisões de design
  - `IMPORTACAO_MASSIVA.md` – guia completo de importação CSV
  - `IMPORTACAO_REFERENCIA.md` – referência rápida de importação
  - `exemplo_modelos.csv` – arquivo exemplo para importar modelos
  - `exemplo_veiculos.csv` – arquivo exemplo para importar veículos

## Destaques da Fase 1

- Catálogo com filtros (modelo, cor, status, fornecedor), busca livre e realce de duplicidades, outliers e margens negativas.
- Painel com indicadores de estoque (semáforo), funil de vendas e alertas de inatividade.
- Tabela de transportadoras embutindo SLA, cobertura e custos.
- Base de fornecedores com contatos e indicadores de atividade.
- Páginas de auditoria e configurações com regras de margem, automações e roadmap de IA.
- **Integração com Firebase** para persistência de dados (veículos, marcas, modelos, cores, transportadoras).
- **Importação Massiva via CSV** para modelos e veículos com validação e tratamento de erros.
- **Autenticação com Google** via NextAuth para controle de acesso por perfil.

## 📊 Importação de Dados

O sistema suporta importação massiva de dados via arquivos CSV:

- **Modelos:** 2 colunas (Marca, Modelo)
- **Veículos:** 10 colunas (marca, modelo, versao, cor, preco, concessionaria, cidade, estado, vendedor, telefone)

Consulte `docs/IMPORTACAO_REFERENCIA.md` para referência rápida ou `docs/IMPORTACAO_MASSIVA.md` para o guia completo.

Arquivos de exemplo estão disponíveis em `docs/exemplo_*.csv`.

## Próximos passos recomendados
- Conectar as rotas a uma API (REST ou GraphQL) para buscar catálogos reais e persistir configurações.
- Implementar autenticação e perfis de acesso (admin, operador, consultor) com proteção de rotas.
- Substituir mocks de funil por dados analíticos reais e acoplar ferramenta de BI/telemetria.
- Mapear fluxo de auditoria com backend (armazenamento imutável + filtros por usuário/período).
- Preparar testes de integração (Playwright/React Testing Library) para validar filtros e regras de margem.
