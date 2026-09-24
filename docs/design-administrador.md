# Padronização visual do administrador

Implementação da direção aprovada: navegação azul-marinho, área de trabalho clara, destaque âmbar e tipografia Inter. A pesquisa lateral de veículos mantém as quatro categorias, busca por modelo e lista de seleção. Na tabela administrativa, o preço aparece junto ao modelo.

## Estrutura

- `app/dashboard/admin/design-system.css`: tokens e regras visuais restritos a `data-admin-design`.
- `AdminThemeProvider`: preferência própria em `cnv-admin-theme`, com temas claro e escuro, sem alterar o tema global dos demais perfis.
- Componentes e módulos CSS: tabelas, formulários, botões, cartões, navegação e modais padronizados. O módulo WhatsApp recebe os mesmos tokens e preferência de tema.

## Validação

- Build de produção e verificação TypeScript concluídos.
- Testes de pesquisa lateral, ordem e cálculo de preços, tema, configurações, planos, CRM, Kanban, botões e exportação CSV executados com sucesso.
- Quinze abas administrativas verificadas no navegador em desktop e celular (390 px), com respostas de API de demonstração; sem transbordamento horizontal do documento ou erros de página no roteiro.
- Modais de margem, planos, concessionárias e cadastro de cliente revisados. Temas claro e escuro conferidos na consulta de veículos.
- Capturas disponíveis em `output/admin-design/`.

O roteiro visual usa dados simulados e não substitui a validação das integrações com dados reais. As páginas protegidas do WhatsApp foram compiladas, mas não exercitadas com uma sessão real de produção. O lint permanece bloqueado pela configuração/dependência `next/core-web-vitals` ausente no projeto. Não houve publicação em produção nesta etapa.
