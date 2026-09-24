# Estudo de evolução visual da CNV

Data: 24/09/2026. Escopo: auditoria do código de interface e proposta de evolução. As telas autenticadas não foram inspecionadas visualmente no navegador; efeitos de layout são hipóteses fundamentadas no código, a validar com dados reais. Não foram realizadas entrevistas nem medições de uso. Nenhuma interface foi alterada neste estudo.

## Diagnóstico

A CNV já possui elementos aproveitáveis: identidade azul e âmbar, variáveis de tema, componentes de consulta, filtros, alternativas de visualização e navegação móvel. O problema principal é a falta de um sistema consistente entre as áreas. Premium, para este produto, deve significar clareza, precisão e confiança para comparar veículos e negociar.

| Evidência no projeto | Consequência provável | Recomendação |
| --- | --- | --- |
| `app/dashboard/layout.tsx` apenas retorna os filhos; admin possui sidebar e operador usa abas próprias | Estrutura e navegação variam entre áreas, aumentando o custo de manutenção | Criar uma estrutura compartilhada, com navegação adequada às permissões e à complexidade de cada perfil |
| `app/dashboard/cliente/page.tsx` reserva 180 px de altura para o banner no cabeçalho | Publicidade ganha destaque antes da tarefa principal e consome área útil | Cabeçalho de 64–72 px; publicidade em uma faixa secundária, com posicionamento validado com o negócio |
| `VehicleConsultation.module.css`: células com `padding: 0.18rem`, `line-height: 1.05`, bordas em todas as direções e títulos em caixa alta | Consulta visualmente comprimida, com aparência de planilha e pouca hierarquia | Divisórias horizontais discretas, cabeçalhos em caixa normal, densidade confortável e opção compacta |
| `VehicleActionsHeader.tsx` e menu de administração usam emojis; o menu também utiliza `MdFilterAlt` | Peso e linguagem dos ícones mudam conforme a ação e o sistema operacional | Uma única família de ícones, tamanhos e espessuras consistentes |
| `CatalogView.module.css` usa botão com gradiente e sombra intensa; consulta usa outra construção | A mesma importância de ação recebe aparências diferentes | Componentes de botão primário, secundário, discreto e destrutivo |
| `LoginForm.module.css` usa foco laranja em input e azul em select | Cores de interação sem significado comum | Um token de foco e padrões de campo compartilhados |
| `globals.css` declara Inter; não foi encontrado carregamento da fonte nas buscas em app/components/lib | A aparência pode depender da fonte de fallback disponível no dispositivo | Carregar a fonte explicitamente e verificar o resultado renderizado |
| `VehicleConsultation.tsx` usa `alert()` e `confirm()` | Feedback interrompe o fluxo e foge da identidade do produto | Mensagens junto aos campos, notificações e diálogos acessíveis conforme a gravidade |
| Tema global claro convive com fundos escuros fixos no catálogo | Alterar apenas as variáveis globais não garante um tema claro coerente | Migrar cores fixas para tokens semânticos e revisar os dois temas |
| `app/layout.tsx` define `maximumScale: 1`; estilos globais suprimem borda/sombra de campos inválidos | Riscos para zoom e identificação de erros | Permitir ampliação e criar erros explícitos, com texto e associação ao campo |

## Direção recomendada

**Uma plataforma automotiva de negócios, sóbria e precisa.** Preservar azul profundo e âmbar como assinatura, reduzir decoração e dar mais importância aos veículos, preços e ações úteis.

Proponho tema claro como primeira direção a prototipar para o ambiente de trabalho: fundo neutro, superfícies brancas e tipografia escura. O tema escuro permanece uma opção com a mesma hierarquia. Essa escolha é uma hipótese de design, não uma conclusão de pesquisa com usuários. A landing page pode manter uma apresentação escura mais expressiva, com identidade tipográfica e de controles compartilhada.

| Elemento | Especificação inicial proposta |
| --- | --- |
| Fundo claro | `#F5F6F8` |
| Superfície | `#FFFFFF` |
| Texto principal | `#17212B` |
| Texto secundário | `#596675` |
| Bordas discretas | `#E2E6EB` |
| Marca escura | `#102333` |
| Destaque âmbar | `#F6B73C`, com texto escuro; evitar texto branco sobre âmbar |
| Tipografia | Inter explicitamente carregada; pesos 400, 500 e 600 |
| Escala | 28–32 px para título de página; 18–20 px para seção; 14–16 px para dados; 12 px para metadados |
| Espaçamento | Escala 4, 8, 12, 16, 24 e 32 px |
| Cantos | 8 px em controles; 12 px em painéis; pílulas restritas a status e filtros |
| Controles | 40 px no desktop; alvo confortável de 44 px no toque |
| Tabelas | Linhas de aproximadamente 52 px no modo confortável e 40 px no compacto, com crescimento para conteúdo longo |
| Movimento | Transições breves de 120–180 ms; respeitar redução de movimento |

Esses valores são ponto de partida. Contraste deve ser verificado em cada combinação e estado antes da implementação final. Evitar sombras em cada bloco, gradientes generalizados, muitos contornos e cartões dentro de cartões.

## O que redesenhar

### 1. Consulta de veículos: tela piloto

Ordem visual proposta: cabeçalho compacto → título e quantidade de resultados → busca e filtros → resultados. Publicidade não deve interromper essa sequência principal.

Na tabela, priorizar veículo/versão, ano, cor, preço, localização e disponibilidade. Agrupar modelo e versão numa mesma célula; alinhar valores monetários à direita e usar algarismos tabulares. Manter status com texto e cor discreta. Permitir seleção de colunas para usuários intensivos; dados secundários e ações menos frequentes ficam nos detalhes.

Manter acesso visível à ação principal de contato ou negociação, conforme o perfil. Ações em lote aparecem quando há seleção. Uma lateral de detalhes pode preservar a posição na consulta ao mostrar opcionais, origem e informações adicionais, respeitando as permissões existentes.

Busca deve permanecer evidente. Filtros aplicados precisam aparecer como etiquetas removíveis, com opção de limpar. Preservar busca, filtros e posição ao fechar os detalhes. Não substituir a tabela por uma grade de fotos como único modo: comparação de preços é uma tarefa central. Fotografias, se disponíveis e confiáveis, podem enriquecer detalhes e a visualização em grade.

### 2. Navegação por perfil

Uma mesma linguagem não exige o mesmo número de menus. Cliente pode ter navegação curta; administração precisa de grupos. Proposta a validar: Comercial (veículos, catálogo, CRM/leads), Operação (concessionárias, frete, tabelas), Gestão (equipe, planos, cobranças) e Sistema (configurações, integrações, banners).

Mostrar apenas itens autorizados; preservar separações funcionais até confirmar diferenças entre veículos, estoque e catálogo. Reduzir abreviações como “Estoque Cons.”. Usar título, descrição curta e ação principal em posições previsíveis.

### 3. Formulários e feedback

Unificar campo, rótulo, ajuda, erro e estado desabilitado. Agrupar dados do veículo, valores e contato. Diferenciar salvar, cancelar e excluir por importância; mostrar progresso durante envio e resultado claro após conclusão. Confirmações destrutivas devem identificar o objeto afetado e controlar foco e teclado.

### 4. Mobile

Desenhar uma apresentação própria da consulta: lista com modelo, versão, preço, localização, disponibilidade e ação principal. Filtros podem abrir num painel; detalhes em tela dedicada. Preservar ordenação e contexto ao voltar. Revisar a barra inferior existente para não cobrir conteúdo e aumentar a legibilidade dos rótulos, hoje definidos em 0.6rem.

### 5. Login e landing page

Aplicar a mesma tipografia, botões e cores de interação. No login, destacar o formulário e reduzir competição visual. Na landing page, mostrar o produto em uso, benefícios concretos e provas reais verificadas. Avaliar peso e movimento do vídeo existente; nunca inventar números, depoimentos ou logotipos de clientes para parecer premium.

## O que precisamos produzir

1. Inventário de telas e estados por perfil, com capturas desktop/mobile e dados representativos, incluindo textos longos.
2. Protótipo da consulta e seus detalhes em desktop/mobile, cobrindo vazio, carregamento, erro, seleção e acesso restrito.
3. Sistema de tokens para cores, tipografia, espaçamento, bordas, foco e camadas; especificações para os dois temas.
4. Componentes compartilhados: estrutura de página, navegação, botões, campos, filtros, tabela, status, modal, painel lateral e notificações.
5. Migração gradual das telas para esses componentes, com verificação das permissões e regras existentes.
6. Validação com representantes de cliente, operação e administração, usando tarefas reais de busca, comparação e contato.

Não há necessidade demonstrada de trocar Next.js, React ou CSS Modules. A base atual permite executar esse trabalho. Uma biblioteca acessível de componentes pode ajudar, mas sua adoção deve ser decidida após verificar encaixe técnico; instalar uma biblioteca por si só não resolve hierarquia e identidade.

## Sequência de execução

| Etapa | Entrega | Critério para avançar |
| --- | --- | --- |
| P0 — evidências e direção | Capturas, inventário e protótipo da consulta | Hierarquia, densidade e tarefas validadas nos perfis principais |
| P1 — fundação | Tokens, tipografia, estrutura e controles | Componentes consistentes nos dois temas e operáveis por teclado |
| P1 — consulta | Busca, filtros, resultados, detalhes e mobile | Comparar e contatar sem perder contexto; regras por perfil preservadas |
| P2 — demais operações | Admin, estoque, CRM, financeiro e formulários | Reutilização dos padrões sem regressão dos fluxos |
| P3 — apresentação | Login, landing page e acabamento | Coerência de marca e desempenho verificado |

O esforço deve ser estimado após o inventário e a tela piloto. O risco maior é subestimar estados por perfil, permissões e tabelas densas; uma troca global de CSS sem migração controlada tende a deixar exceções.

## Como saber se melhorou

- Comparar tempo, erros e sucesso nas mesmas tarefas antes/depois: encontrar veículo, restringir por preço/local, comparar opções e iniciar contato.
- Verificar larguras de 360, 390, 768, 1280 e 1440 px, zoom e textos longos; não permitir corte de ações ou rolagem horizontal da página inteira.
- Inspecionar foco, teclado, leitura dos campos e diálogos, contraste e redução de movimento. Meta: WCAG 2.2 AA; alvos de 44 px no toque são uma escolha de conforto, acima do mínimo AA de 24 px sujeito às exceções da norma.
- Cobrir estados de carregamento, erro, vazio, sucesso, seleção e permissão insuficiente.
- Medir desempenho antes/depois e evitar regressão com fontes, fotografias, vídeo e animações.

Não há métricas atuais suficientes para prometer aumento de conversão. A primeira entrega deve provar qualidade visual e facilidade de execução na consulta de veículos.

## Referências consultadas

- [IBM Carbon — Data table](https://carbondesignsystem.com/components/data-table/usage/): referência para organização de tabelas, barra de ferramentas, seleção e ações. Usar princípios, sem copiar sua identidade visual.
- [W3C — WCAG 2.2](https://www.w3.org/TR/WCAG22/): referência para contraste, foco, redimensionamento e alvos de interação. A conformidade exige testes; este estudo não é uma certificação.

**Decisão recomendada:** começar pela consulta de veículos e extrair dela o sistema visual que orientará o restante da CNV.
