# RENAVE: o que muda e o que o CNV pode oferecer

Estudo para a mensagem do Márcio sobre a obrigação do RENAVE e a ideia de levar o RENAVE para dentro da plataforma. Nada foi implementado; abaixo estão a regra, o impacto nos clientes do CNV e uma proposta em etapas.

## A regra

- **Resolução Contran nº 1.026/2026**, assinada em 26/06/2026 e publicada no fim de junho/início de julho de 2026. Institui o RENAVE (Registro Nacional de Veículos em Estoque) em todo o país para quem compra e vende veículo novo ou usado.
- **Veículo 0km já era obrigatório** desde 2022: sem o registro de entrada no estoque, o veículo novo não registra, não licencia e não emplaca (art. 7º, §2º).
- **Prazo de adequação** de 90 dias, até o fim de setembro de 2026. A Circular Senatran nº 2/2026 escalonou a operação de outubro a 20/11/2026: concessionárias e lojistas indicaram a integradora no Credencia de 9 a 20/10; depois vêm consignados (até 30/10), intermediação financeira (até 10/11), comunicação de venda e assinaturas (9 a 13/11) e transferência integrada (16 a 20/11). A partir de 20/11 começa o controle de garantias de veículos vendidos fora da regra.
- **Sobre "janeiro de 2027"**: nas fontes consultadas, a única data de 2027 é o prazo para as integradoras obterem a certificação ISO/IEC 27001 (270 dias, por volta de março de 2027). Vale confirmar de onde veio a data citada.
- **Acesso** só por uma integradora autorizada pela Senatran, com adesão no sistema Credencia e certificado digital e-CNPJ (ICP-Brasil). O CNAE principal precisa ser de comércio de veículos.
- **O que se registra**: entrada em estoque (compra, veículo novo, transferência entre lojas), saída na venda (comprador, data, valor e NF-e), consignação com contrato eletrônico e ATPV-e no caso dos usados.
- **Penalidade**: infração gravíssima (CTB, art. 330, §5º), aplicada pelo estado; reincidência pode cancelar a adesão, com 180 dias de impedimento.

## O que isso significa para o CNV

1. **Todo cliente do CNV entra na regra.** O lojista que compra um 0km de uma concessionária pelo CNV gera dois registros: a saída no estoque da concessionária e a entrada no estoque da revenda (transferência entre estabelecimentos, art. 19). Quem não estiver em dia pode ter o veículo travado.
2. **O CNV não deve virar integradora.** A resolução proíbe que sejam integradoras os provedores de sistemas de gestão de concessionárias, entre outros (Anexo, item 1.3.2), e exige ISO 27001, auditoria de logs por 5 anos e autorização da Senatran. Custo e risco altos para pouco ganho.
3. **Os dados do RENAVE só servem para a escrituração** (art. 31). Não dá para usar esses dados para montar a vitrine, anúncio ou marketing.

## Proposta em etapas

| Etapa | O que o cliente vê | Esforço |
| --- | --- | --- |
| 0. Aviso | Um aviso geral (tela Avisos, já pronta no Lote 6) explicando a obrigação, o cronograma até 20/11 e o que o lojista precisa ter (integradora, e-CNPJ, CNAE). Urgente: a janela para indicar a integradora fechou em 20/10. | Nenhum desenvolvimento |
| 1. Ficha da compra | Ao fechar negócio no CNV, uma ficha com os dados que a concessionária e a revenda precisam lançar: chassi, NF-e, CNPJs, valor e data. Sai em PDF, junto do orçamento "Meu carro". | Pequeno |
| 2. Parceria com integradora | O CNV manda a ficha para uma integradora parceira por API. O lojista e a concessionária só conferem e assinam com o e-CNPJ dentro da integradora. O CNV pode ganhar por indicação. | Médio, depende da API da integradora |
| 3. Selo "RENAVE em dia" | Concessionárias e lojistas que mostram adesão ativa ganham selo na consulta, o que pesa na escolha de com quem negociar. | Pequeno, depois da etapa 2 |

## Decisões para o Márcio

- Seguir com a etapa 0 agora (só texto)?
- Escolher integradoras para conversar sobre API e parceria. Exemplos que aparecem nas buscas: Revenda Mais, Renavix e Renave.net (só exemplos, sem avaliação).
- Confirmar a origem da data de janeiro de 2027.

## Fontes

- [Resolução Contran nº 1.026/2026 (gov.br, PDF)](https://www.gov.br/transportes/pt-br/assuntos/transito/conteudo-contran/resolucoes/resolucao10262026c.pdf)
- [Circular Senatran nº 2/2026 (gov.br, PDF)](https://www.gov.br/transportes/pt-br/assuntos/transito/conteudo-contran/resolucoes/circular022026.pdf)
- [Revenda Mais: o que é o RENAVE (atualizado 2026)](https://revendamais.com.br/blog/o-que-e-renave-registro-nacional-de-veiculos-em-estoque/)
- [Renavix: Resolução 1.026/2026 e o prazo de 28/09/2026](https://www.renavix.com.br/resolucao-1026)
- [Vrum: RENAVE agora é obrigatório](https://www.vrum.com.br/mercado/2026/09/7506809-renave-agora-e-obrigatorio-o-que-muda-na-compra-e-venda-de-carros.html)
- [Mecânica Online: Renave para veículos inacabados e histórico do 0km](https://mecanicaonline.com.br/?p=175678)
