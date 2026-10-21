/**
 * Cotação em PDF, no formato da proposta que a montadora entrega ao cliente.
 *
 * Gerada como documento HTML numa janela nova, impressa pelo próprio navegador
 * ("Salvar como PDF"). A alternativa seria jsPDF, mas a foto do veículo vem de
 * URL externa: num canvas ela esbarraria em CORS e a cotação sairia sem imagem.
 * Na impressão o navegador carrega a imagem normalmente.
 */

export interface CotacaoVeiculo {
    marca?: string;
    modelo: string;
    versao?: string;
    cor?: string;
    ano?: string;
    combustivel?: string;
    transmissao?: string;
    opcionais?: string;
    observacoes?: string;
    estado?: string;
    prazo?: number | null;
    imagemUrl?: string;
    /** Repasse: quilometragem já formatada ("48.500 km"). */
    km?: string;
}

export interface CotacaoParams {
    veiculo: CotacaoVeiculo;
    /** Preço já com a margem aplicada — o mesmo número que o cliente vê no grid. */
    preco: number;
    nomeCliente: string;
    /**
     * Logo do lojista (data URL ou https), cadastrada pela equipe no CRM.
     * Vai no canto superior esquerdo: o orçamento sai com a cara da loja.
     */
    logoUrl?: string | null;
}

/** Só aceita imagem embutida ou link https: nada de javascript: no src. */
function logoSegura(url?: string | null): string | null {
    if (!url) return null;
    const limpa = url.trim();
    if (/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(limpa)) return limpa;
    if (/^https:\/\//i.test(limpa)) return limpa;
    return null;
}

const brl = (valor: number) =>
    `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const escapar = (texto: string) =>
    texto.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

function frase(v: CotacaoVeiculo): string {
    const partes = [
        `SEU ${[v.marca, v.modelo].filter(Boolean).join(' ')} É O ${v.modelo}`,
        v.combustivel ? `${v.combustivel.toUpperCase()}` : '',
        v.transmissao ? `COM CÂMBIO ${v.transmissao.toUpperCase()}` : '',
        v.cor ? `NA COR ${v.cor.toUpperCase()}` : '',
    ].filter(Boolean);
    return `${partes.join(' ')}.`;
}

function secao(titulo: string, conteudo: string): string {
    if (!conteudo.trim()) return '';
    return `<section class="bloco"><h3>${escapar(titulo)}</h3><p>${escapar(conteudo)}</p></section>`;
}

export function montarCotacaoHtml({ veiculo, preco, nomeCliente, logoUrl }: CotacaoParams): string {
    const hoje = new Date().toLocaleDateString('pt-BR');
    const titulo = [veiculo.marca, veiculo.modelo].filter(Boolean).join(' ').toUpperCase();
    const logo = logoSegura(logoUrl);
    const prazoTexto = veiculo.prazo === 0
        ? 'PRONTA ENTREGA'
        : (typeof veiculo.prazo === 'number' && veiculo.prazo > 0 ? `${veiculo.prazo} DIAS` : null);

    return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>MEU CARRO</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #EFEDE7; color: #12100C;
         font-family: "Helvetica Neue", Arial, sans-serif; font-size: 12px; }
  .folha { max-width: 190mm; margin: 0 auto; padding: 8mm; }
  .topo { display: flex; justify-content: space-between; align-items: center; gap: 16px;
          font-size: 11px; letter-spacing: .04em; }
  .topoEsq { display: flex; align-items: center; gap: 14px; }
  .topoDir { text-align: right; }
  .logo { display: block; max-height: 56px; max-width: 200px; object-fit: contain; }
  .linha { border: 0; border-top: 1px solid #12100C; margin: 10px 0 22px; }
  .corpo { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
  .foto { width: 100%; height: 190px; object-fit: contain; }
  .semFoto { display: flex; align-items: center; justify-content: center; height: 190px;
             border: 1px dashed #A9A599; color: #6C6A62; font-size: 11px; }
  .frase { margin: 18px 0 10px; font-size: 13px; line-height: 1.45; letter-spacing: .02em; }
  .versao { margin: 0; font-size: 13px; font-weight: 700; }
  h2 { margin: 0 0 14px; font-size: 22px; letter-spacing: .01em; }
  .item { display: flex; justify-content: space-between; padding: 5px 0;
          font-size: 12px; letter-spacing: .03em; }
  .total { border-top: 1px solid #12100C; margin-top: 8px; padding-top: 8px; font-weight: 700; }
  .pagamento { margin-top: 22px; }
  .pagamento h3 { margin: 0; font-size: 17px; }
  .pagamento small { color: #56534A; letter-spacing: .04em; }
  .nota { margin-top: 6px; font-size: 10.5px; color: #56534A; line-height: 1.5; }
  .bloco { margin-top: 24px; border-top: 1px solid #12100C; padding-top: 12px; }
  .bloco h3 { margin: 0 0 4px; font-size: 13px; letter-spacing: .04em; }
  .bloco p { margin: 0; font-size: 11.5px; line-height: 1.5; }
  .rodape { margin-top: 26px; border-top: 1px solid #12100C; padding-top: 10px;
            font-size: 10.5px; color: #56534A; display: flex; justify-content: space-between; }
  @media print { body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head>
<body><div class="folha">
  <div class="topo">
    <div class="topoEsq">
      ${logo ? `<img class="logo" src="${escapar(logo)}" alt="Logo da loja">` : ''}
      <span>${hoje}</span>
    </div>
    <span class="topoDir">${escapar(titulo)}</span>
  </div>
  <hr class="linha">

  <div class="corpo">
    <div>
      ${veiculo.imagemUrl
        ? `<img class="foto" src="${escapar(veiculo.imagemUrl)}" alt="${escapar(veiculo.modelo)}">`
        : `<div class="semFoto">Foto não cadastrada para esta versão</div>`}
      <p class="frase">${escapar(frase(veiculo))}</p>
      <p class="versao">${escapar([veiculo.modelo, veiculo.ano].filter(Boolean).join(' '))}</p>
    </div>

    <div>
      <h2>MEU CARRO</h2>
      <div class="item"><span>PREÇO DO VEÍCULO</span><span>${brl(preco)}</span></div>
      <div class="item"><span>COR</span><span>${brl(0)}</span></div>
      <div class="item"><span>OPCIONAIS</span><span>${brl(0)}</span></div>
      <div class="item"><span>ACESSÓRIOS</span><span>${brl(0)}</span></div>
      <div class="item total"><span>TOTAL</span><span>${brl(preco)}</span></div>

      <div class="pagamento">
        <h3>PAGAMENTO</h3>
        <small>PAGAMENTO À VISTA</small>
        <div class="item total"><span></span><span>${brl(preco)}</span></div>
      </div>

      <p class="nota">Cotação emitida em ${hoje}. Valores sujeitos a confirmação e à disponibilidade do veículo.</p>
    </div>
  </div>

  ${secao('COR', veiculo.cor || '')}
  ${secao('VERSÃO, MOTOR E CÂMBIO', [veiculo.modelo, veiculo.combustivel, veiculo.transmissao, veiculo.ano].filter(Boolean).join(' · '))}
  ${secao('ITENS DE SÉRIE', veiculo.opcionais || '')}
  ${veiculo.km ? secao('QUILOMETRAGEM', veiculo.km) : ''}
  ${prazoTexto ? secao('PRAZO DE ENTREGA', prazoTexto) : ''}

  <div class="rodape">
    <span>CNV — Comércio Nacional de Veículos 0km</span>
    <span>${escapar(nomeCliente)}</span>
  </div>
</div>
<script>window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 350); });</script>
</body></html>`;
}

/**
 * Abre a cotação numa janela e dispara a impressão (o navegador salva em PDF).
 *
 * A janela abre na hora do clique (senão o bloqueador de pop-up barra) e o
 * documento é escrito quando a logo da loja termina de carregar.
 */
export function gerarCotacaoPdf(params: Omit<CotacaoParams, 'logoUrl'>, logo?: Promise<string | null>): boolean {
    const janela = window.open('', '_blank', 'width=900,height=1200');
    if (!janela) return false;   // bloqueador de pop-up
    const escrever = (logoUrl: string | null) => {
        janela.document.write(montarCotacaoHtml({ ...params, logoUrl }));
        janela.document.close();
    };
    if (!logo) {
        escrever(null);
        return true;
    }
    janela.document.write('<p style="font-family:Arial,sans-serif;padding:24px">Gerando o orçamento...</p>');
    logo.then(escrever, () => escrever(null));
    return true;
}
