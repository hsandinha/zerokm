# Cadastro assistido FIPE e CSV

O catálogo oferece busca hierárquica por categoria, marca, modelo/versão e ano/combustível, além de consulta direta por código FIPE. Listas filtram localmente por texto sem acentos, com navegação por teclado. As consultas passam por `/api/catalog/fipe`, com as mesmas permissões do catálogo, timeout de 8 segundos e cache de 24 horas. O token opcional `FIPE_API_TOKEN` é usado somente no servidor.

Selecionar um resultado não grava nem altera o formulário. “Aplicar ao cadastro” preenche os dados identificados; o usuário revisa e salva depois. A descrição original fica em `descricaoFipe`, separada do nome de exibição `modelo`. A opção FIPE Zero km não é convertida em ano 32000 no cadastro: é necessário informar o ano real. Preço, fotos, cor, câmbio e opcionais não são inferidos.

## CSV / Google Sheets

Os arquivos antigos continuam funcionando. Para enriquecimento, marque **Consultar FIPE na prévia** e forneça `codigoFipe`, `tipoVeiculo` e `anoModelo` (ou `ano`, como `26/27`). Informe combustível quando houver mais de uma alternativa. Mantenha o código como texto, inclusive os zeros iniciais.

Exemplo de cabeçalho e linha:

```csv
codigoFipe;tipoVeiculo;anoModelo;combustivel;marca;modelo;cor;preco
002111-3;carro;2026;Flex;;;Preto;150000
```

A consulta completa campos vazios e registra a descrição FIPE. Campos existentes não são sobrescritos. Sem código, não há associação automática por semelhança de nome. Código incompatível, ano ausente, marca divergente ou serviço indisponível aparecem como avisos por linha. Linhas com dados obrigatórios ausentes continuam inválidas. A prévia apresenta todas as situações; a confirmação importa somente as novas. Avisos FIPE não impedem cadastro manual de uma linha completa.

Consultas repetidas são compartilhadas no lote. Há teto de 40 requisições externas por prévia e concorrência de duas linhas. Isso não é uma carga completa da base: para um CSV grande com muitos códigos diferentes, divida o arquivo ou importe os dados existentes e vincule depois. Não contratamos planos nem fazemos varredura da base do fornecedor.

O catálogo atual distingue também cor, fabricação, câmbio e opcionais. A deduplicação da importação mantém essa estrutura e acrescenta a identidade por código FIPE, sem fundir ofertas diferentes apenas por compartilharem o código.

Documentação do fornecedor: https://fipe.api.br/docs/api/fipe e https://fipe.api.br/docs/api/busca-por-codigo-fipe.
