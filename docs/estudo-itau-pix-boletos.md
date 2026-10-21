# Itaú: Pix e boleto direto no banco

Estudo para a demanda "Principal" do Márcio (05/10/2026): receber pelo Itaú, com Pix pelo WhatsApp e boletos. Nada foi ligado ainda. A integração depende de contratos e credenciais que só o Itaú entrega ao CNV.

## Como o CNV cobra hoje

- Mercado Pago para cartão recorrente, Pix e boleto (`app/api/checkout/*`, `lib/mercadopago.ts`).
- A Vera manda o Pix copia e cola no WhatsApp por `wa/lib/payments.ts` (`createPixPayment`).
- Confirmação pelo webhook `app/api/webhooks/mercadopago` e pela sincronização da tela Cobranças.
- A renovação da assinatura já está isolada em `lib/services/assinaturaPagamento.ts` (`aplicarPagamentoNaAssinatura`), que é idempotente e serve para qualquer banco. A baixa manual do Lote 5 também.

Ou seja: trocar ou somar o Itaú é trocar quem gera a cobrança e quem avisa do pagamento. O que acontece depois do pagamento já está pronto.

## O que o Itaú oferece

| Produto | Para que serve no CNV | Observações |
| --- | --- | --- |
| Pix cobrança por API ("Recebimentos Pix", padrão Bacen: `cob` e `cobv`) | Vera manda QR e copia e cola no WhatsApp; tela de pagamento do site | Tarifa por Pix liquidado, negociada com o gerente. Valor de R$ 0,01 a R$ 10 milhões. |
| Boleto com Pix (Bolecode), carteira 109 | Boleto que também paga por QR Pix, com baixa automática | Cancelamento por API em até 24h do registro. Mudar valor exige cancelar e emitir outro. O Itaú valida o CEP do pagador. |
| Pix Automático (Bacen) | Mensalidade que cai sozinha, sem cartão | O cliente autoriza uma vez (push no app do banco, QR Code ou iniciação de pagamento via Open Finance). Agendamento 2 dias antes do débito, até 3 tentativas em 7 dias, cancelamento pelo app do cliente. Contratação com o officer Cash do Itaú, com análise prévia. Há API e CNAB. |

O "open finance" do pedido se encaixa no Pix Automático: a autorização da recorrência pode ser feita por iniciação de pagamento. Para o lojista, o fluxo fica: a Vera manda o link ou QR de autorização no WhatsApp, ele aprova no app do banco dele e as próximas mensalidades são debitadas sem nova ação.

## Como ligar no CNV

1. **Camada de provedor.** Criar `lib/pagamentos/` com uma interface única (`criarPix`, `criarBoleto`, `consultar`, `cancelar`) e duas implementações: Mercado Pago (o código atual, movido) e Itaú. Uma variável de ambiente escolhe o provedor do Pix e do boleto (`PAGAMENTOS_PIX=itau`, `PAGAMENTOS_BOLETO=itau`). Cartão continua no Mercado Pago.
2. **Modelo `Payment`.** Somar `provedor` (`mercadopago` ou `itau`), `txid`, `nossoNumero`, `linhaDigitavel` e `pixCopiaECola`. Os pagamentos antigos ficam como `mercadopago`.
3. **Autenticação Itaú.** OAuth2 `client_credentials` com mTLS. Em produção o gerente envia o Client ID e um token temporário por e-mail; com ele o CNV gera a chave privada, pede o certificado e recebe o Client Secret. Chave e certificado vão para variáveis de ambiente da Vercel (base64). O token de acesso fica em cache até expirar.
4. **Aviso de pagamento.** O padrão do Bacen usa mTLS também no webhook do recebedor, e a Vercel não valida certificado de quem chama. Por isso o webhook (`app/api/webhooks/itau`) só serve de gatilho: o CNV consulta a cobrança na API do Itaú antes de dar baixa, como já faz com o Mercado Pago. Um cron de conciliação a cada 15 minutos cobre aviso perdido. Confirmar com o Itaú se aceita webhook sem mTLS.
5. **Vera.** `createPixPayment` passa a chamar o provedor configurado. O texto da mensagem não muda.
6. **Tela Cobranças.** Mostra o provedor de cada cobrança e o link do boleto ou do Pix. A baixa manual continua igual.

## O que pedir ao Itaú (checklist para o Márcio)

- Conta PJ do CNV com chave Pix no CNPJ.
- Contratar: Pix recebimentos por API; cobrança carteira 109 com Bolecode; numa segunda etapa, Pix Automático como recebedor.
- Acesso ao portal de desenvolvedor (sandbox) e, para produção, Client ID e token temporário.
- Tabela de tarifas: Pix liquidado, boleto emitido e liquidado, Pix Automático.
- Resposta sobre o webhook sem mTLS e sobre a validade do certificado.
- O cadastro no bankline só pode ser feito por representante legal.

## Etapas sugeridas

| Etapa | Entrega | Estimativa de desenvolvimento, depois das credenciais |
| --- | --- | --- |
| 1 | Pix Itaú na Vera e na tela de pagamento, com webhook e conciliação | cerca de 1 semana |
| 2 | Boleto com Pix (Bolecode) no lugar do boleto do Mercado Pago | cerca de 1 semana |
| 3 | Pix Automático para os planos mensais | 1 a 2 semanas, depende da aprovação do Itaú |

## Riscos e cuidados

- Duas fontes de pagamento no mesmo período: a tela Cobranças precisa juntar as duas para a equipe não perder baixa.
- Certificado com validade: guardar a data e avisar antes de vencer.
- Tarifas diferentes das do Mercado Pago: comparar antes de migrar tudo.
- CEP inválido do cliente bloqueia o Bolecode: validar no cadastro.

## Fontes

- [Pix Automático no Itaú BBA](https://www.itau.com.br/itaubba-pt/pix/pix-automatico)
- [Omie: integração com o Itaú Pix via API](https://ajuda.omie.com.br/pt-BR/articles/6817569-configurando-a-integracao-com-o-itau-pix-via-api)
- [Omie: integração com o Itaú Bolecode via API](https://ajuda.omie.com.br/pt-BR/articles/7225464-configurando-a-integracao-com-o-itau-bolecode-via-api)
- [Projeto ACBr: credenciais do PSP Itaú (sandbox, token temporário e certificado)](https://www.projetoacbr.com.br/forum/topic/68320-acbrpixcd-como-solicitar-credenciais-e-configurar-psps-no-componente/)
