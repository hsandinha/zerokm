# Cadastro assistido FIPE e CSV

Os próprios campos do cadastro consultam a FIPE. Ao clicar ou digitar em **Marca**, aparece a lista de marcas da FIPE da categoria (carro, moto ou caminhão, conforme o Tipo), filtrada a cada caractere, sem diferenciar maiúsculas e acentos. Escolhida a marca, **Modelo** lista os modelos/versões dessa marca. Escolhido o modelo, surge **Ano-modelo / combustível FIPE**; ao selecionar, o sistema preenche código FIPE, combustível e ano-modelo. Digitar 7 dígitos em **Código FIPE** preenche marca e descrição e abre a mesma lista de anos para confirmação.

Texto livre continua valendo: se a marca ou o modelo não estiver na FIPE, basta continuar digitando. A marca escolhida é convertida para a grafia já cadastrada (Fiat → FIAT, GM - Chevrolet → CHEVROLET, VW - VolksWagen → VW, HONDA em motos → HONDA MOTOS), e o servidor também reaproveita marcas existentes sem diferenciar maiúsculas, evitando duplicidade. A descrição original fica em `descricaoFipe`; o nome de exibição `modelo` pode ser editado sem perder o vínculo. A opção FIPE Zero km não altera o ano digitado. Preço, fotos, cor, câmbio e opcionais não são inferidos. As consultas passam por `/api/catalog/fipe`, com as permissões do catálogo, timeout de 8 segundos e cache de 24 horas. O token opcional `FIPE_API_TOKEN` fica somente no servidor.

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
