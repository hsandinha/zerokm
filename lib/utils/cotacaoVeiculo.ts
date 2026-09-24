import type { Vehicle } from '../services/vehicleService';
import { gerarCotacaoPdf } from './cotacaoPdf';
import { formatKm } from './repasse';

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
            observacoes: isRepasse
                ? [`Usado: ${formatKm(vehicle.km)}`, vehicle.observacoes].filter(Boolean).join(' · ')
                : vehicle.observacoes,
            estado: vehicle.estado,
            prazo: vehicle.prazo,
            imagemUrl: vehicle.imagemUrl,
        },
        preco,
        nomeCliente: nomeCliente || 'Cliente',
    });
}

/** Abre a cotação e avisa quando o pop-up foi bloqueado. */
export function abrirCotacaoDoVeiculo(vehicle: Vehicle, preco: number, nomeCliente?: string): void {
    if (!gerarCotacaoDoVeiculo(vehicle, preco, nomeCliente)) {
        alert('Libere os pop-ups deste site para gerar a cotação.');
    }
}
