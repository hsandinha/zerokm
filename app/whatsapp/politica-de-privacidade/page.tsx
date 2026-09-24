import type { Metadata } from "next";

// Identificação do controlador e canal de contato do titular (art. 18 da LGPD).
const CONTROLADOR = "CNV — Comércio Nacional de Veículos";
const CNPJ = "64.467.246/0001-50";
const ENDERECO =
  "Rua Pais Leme, 215, conj. 1713 — Pinheiros, São Paulo/SP, CEP 05424-150";
const EMAIL_CONTATO = "cnv0kmsp@gmail.com";

const ATUALIZADO_EM = "29 de julho de 2026";

export const metadata: Metadata = {
  title: "Política de Privacidade — CNV WhatsApp",
  description:
    "Como a CNV coleta, usa e protege os dados pessoais tratados no atendimento por WhatsApp.",
};

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-ink-900">{titulo}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export default function PoliticaDePrivacidade() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <header className="space-y-2">
        <p className="brand-kicker text-brand-700">CNV · WhatsApp</p>
        <h1 className="text-3xl font-bold text-ink-900">Política de Privacidade</h1>
        <p className="text-sm text-muted">Última atualização: {ATUALIZADO_EM}</p>
      </header>

      <div className="mt-10 space-y-9">
        <Secao titulo="1. Quem é o controlador">
          <p>
            O controlador dos dados pessoais tratados nesta plataforma é{" "}
            <strong className="text-ink-800">{CONTROLADOR}</strong>, inscrita no CNPJ{" "}
            {CNPJ}, com sede em {ENDERECO}.
          </p>
          <p>
            Esta política descreve como tratamos dados pessoais no atendimento
            automatizado e humano realizado pelo WhatsApp da CNV, no número
            +55 31 7168-0453, e está em conformidade com a Lei nº 13.709/2018
            (Lei Geral de Proteção de Dados — LGPD).
          </p>
        </Secao>

        <Secao titulo="2. Quais dados coletamos">
          <p>Ao conversar com o WhatsApp da CNV, tratamos:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-ink-800">Dados de contato:</strong> o número de
              telefone e o nome de exibição do seu perfil do WhatsApp.
            </li>
            <li>
              <strong className="text-ink-800">Conteúdo das mensagens:</strong> textos,
              imagens, áudios, vídeos, documentos e reações que você envia, além das
              respostas que enviamos.
            </li>
            <li>
              <strong className="text-ink-800">Dados de cadastro:</strong> nome completo,
              e-mail e CPF ou CNPJ, quando você opta por criar uma conta na plataforma
              CNV 0KM.
            </li>
            <li>
              <strong className="text-ink-800">Dados de assinatura:</strong> plano
              escolhido, situação do pagamento e identificadores da transação.
            </li>
          </ul>
          <p>
            Não coletamos dados de cartão de crédito. O pagamento acontece inteiramente
            no ambiente do Mercado Pago.
          </p>
        </Secao>

        <Secao titulo="3. Para que usamos">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Responder às suas dúvidas sobre a plataforma e os planos da CNV;</li>
            <li>Criar e manter a sua conta na plataforma CNV 0KM;</li>
            <li>Gerar cobranças e processar a sua assinatura;</li>
            <li>Transferir o atendimento para um atendente humano quando necessário;</li>
            <li>
              Enviar comunicações comerciais por WhatsApp sobre produtos e serviços da
              CNV, sempre com possibilidade de descadastro;
            </li>
            <li>Cumprir obrigações legais e regulatórias.</li>
          </ul>
        </Secao>

        <Secao titulo="4. Base legal">
          <p>
            Tratamos os seus dados com base na execução de contrato ou de procedimentos
            preliminares a seu pedido (art. 7º, V), no cumprimento de obrigação legal
            (art. 7º, II), no legítimo interesse para prevenção a fraudes e melhoria do
            atendimento (art. 7º, IX) e no seu consentimento, quando aplicável — em
            especial para comunicações de marketing (art. 7º, I).
          </p>
        </Secao>

        <Secao titulo="5. Inteligência artificial no atendimento">
          <p>
            O primeiro atendimento é feito por um assistente de inteligência artificial.
            O conteúdo das suas mensagens é enviado ao modelo de linguagem do Google
            (Gemini) para gerar a resposta. Esse processamento é automatizado.
          </p>
          <p>
            Você pode, a qualquer momento, pedir para falar com um atendente humano — é
            só solicitar na conversa. Você também tem direito a solicitar a revisão de
            decisões tomadas exclusivamente por tratamento automatizado (art. 20 da
            LGPD).
          </p>
        </Secao>

        <Secao titulo="6. Com quem compartilhamos">
          <p>
            Não vendemos dados pessoais. Compartilhamos apenas com operadores
            necessários para a prestação do serviço:
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-ink-800">Meta Platforms</strong> — transporte das
              mensagens pela WhatsApp Business Cloud API;
            </li>
            <li>
              <strong className="text-ink-800">Google</strong> — geração das respostas
              (Gemini) e autenticação de contas (Firebase);
            </li>
            <li>
              <strong className="text-ink-800">Mercado Pago</strong> — processamento dos
              pagamentos;
            </li>
            <li>
              <strong className="text-ink-800">MongoDB Atlas</strong> — armazenamento do
              histórico de conversas e cadastros;
            </li>
            <li>
              <strong className="text-ink-800">Vercel</strong> — hospedagem da
              aplicação;
            </li>
            <li>
              Autoridades públicas, quando houver requisição legal ou ordem judicial.
            </li>
          </ul>
          <p>
            Alguns desses fornecedores operam servidores fora do Brasil. Nesses casos, a
            transferência internacional ocorre com as salvaguardas previstas no art. 33
            da LGPD.
          </p>
        </Secao>

        <Secao titulo="7. Por quanto tempo guardamos">
          <p>
            O histórico de conversas é mantido enquanto durar o relacionamento comercial
            e por até 5 anos após o último contato, prazo compatível com a prescrição do
            Código de Defesa do Consumidor. Dados de cadastro e de pagamento seguem os
            prazos fiscais e contábeis aplicáveis. Encerrados esses prazos, os dados são
            eliminados ou anonimizados.
          </p>
        </Secao>

        <Secao titulo="8. Segurança">
          <p>
            Todo o tráfego trafega por conexões cifradas (TLS). Credenciais de acesso a
            serviços externos são armazenadas cifradas com AES-256-GCM. O acesso ao
            painel de atendimento é restrito a administradores autenticados da CNV.
          </p>
        </Secao>

        <Secao titulo="9. Os seus direitos">
          <p>
            A LGPD garante a você, a qualquer momento e gratuitamente: confirmação da
            existência de tratamento; acesso aos dados; correção de dados incompletos,
            inexatos ou desatualizados; anonimização, bloqueio ou eliminação de dados
            desnecessários ou tratados em desconformidade; portabilidade; informação
            sobre com quem compartilhamos; e revogação do consentimento.
          </p>
          <p>
            Para exercer qualquer desses direitos, escreva para{" "}
            <strong className="text-ink-800">{EMAIL_CONTATO}</strong>. Responderemos no
            prazo legal.
          </p>
        </Secao>

        <Secao titulo="10. Como parar de receber mensagens">
          <p>
            Para deixar de receber comunicações da CNV no WhatsApp, responda{" "}
            <strong className="text-ink-800">PARAR</strong> na própria conversa, ou
            escreva para {EMAIL_CONTATO}. O descadastro não afeta as mensagens
            necessárias à execução de um contrato já em vigor.
          </p>
        </Secao>

        <Secao titulo="11. Alterações desta política">
          <p>
            Podemos atualizar esta política para refletir mudanças legais ou no serviço.
            A data de última atualização no topo desta página indica a versão vigente.
          </p>
        </Secao>
      </div>

      <footer className="mt-12 border-t border-white/10 pt-6 text-xs text-muted">
        <p>
          {CONTROLADOR} · <a className="text-brand-700" href="https://www.cnv0km.com.br">cnv0km.com.br</a>
        </p>
      </footer>
    </main>
  );
}
