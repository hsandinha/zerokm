import type { Vehicle } from '../services/vehicleService';
import { gerarCotacaoPdf } from './cotacaoPdf';
import { formatKm } from './repasse';

/**
 * Logo da loja do usuário logado, buscada uma vez por sessão da página. Quem
 * não tem logo (ou a equipe gerando para teste) recebe null e o orçamento sai
 * sem ela, como antes.
 */
let logoDaLoja: Promise<string | null> | null = null;
export function carregarLogoDaLoja(): Promise<string | null> {
    if (!logoDaLoja) {
        logoDaLoja = fetch('/api/user/logo')
            .then(res => (res.ok ? res.json() : null))
            .then(data => (typeof data?.logo === 'string' && data.logo ? data.logo : null))
            .catch(() => null);
    }
    return logoDaLoja;
}

/** Depois de a equipe trocar a logo, a próxima cotação busca de novo. */
export function esquecerLogoDaLoja() {
    logoDaLoja = null;
}

/**
 * Gera a cotação em PDF de um veículo da consulta. Compartilhado entre a
 * tabela e os cards para que os dois botões produzam o mesmo documento.
 * Retorna false quando o navegador bloqueia o pop-up.
 */
export function gerarCotacaoDoVeiculo(vehicle: Vehicle, preco: number, nomeCliente?: string): boolean {
    const isRepasse = vehicle.origem === 'repasse';
    return gerarCotacaoPdf({
        veiculo: {
            marca: vehicle.marca,
            modelo: vehicle.modelo,
            cor: vehicle.cor,
            ano: vehicle.ano,
            combustivel: vehicle.combustivel,
            transmissao: vehicle.transmissao,
            opcionais: vehicle.opcionais,
            // Observações não vão mais no orçamento (pedido do Márcio): são da
            // negociação com a concessionária, não do cliente final.
            km: isRepasse ? `Usado · ${formatKm(vehicle.km)}` : undefined,
            estado: vehicle.estado,
            prazo: vehicle.prazo,
            imagemUrl: vehicle.imagemUrl,
        },
        preco,
        nomeCliente: nomeCliente || 'Cliente',
    }, carregarLogoDaLoja());
}

/** Abre a cotação e avisa quando o pop-up foi bloqueado. */
export function abrirCotacaoDoVeiculo(vehicle: Vehicle, preco: number, nomeCliente?: string): void {
    if (!gerarCotacaoDoVeiculo(vehicle, preco, nomeCliente)) {
        alert('Libere os pop-ups deste site para gerar a cotação.');
    }
}
