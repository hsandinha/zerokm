"use client";

import React from 'react';
import { CircleCheck, FileText, Percent, UserPlus } from 'lucide-react';
import { ReportData } from './types';
import { StatCard, StatGrid } from '@/components/ui/Page';

interface Props {
  report: ReportData | null;
  loading: boolean;
}

/** Radar comercial: leads criados, propostas, vendas e conversão no período. */
export default function RadarCards({ report, loading }: Props) {
  const r = !loading && report ? report : null;
  const perdidas = r?.radar.vendasPerdidas ?? 0;
  return (
    <StatGrid>
      <StatCard label="Leads criados" icon={<UserPlus size={18} />} value={r ? r.radar.leadsCriados : '-'} caption="Entradas no funil no período" />
      <StatCard label="Propostas enviadas" icon={<FileText size={18} />} value={r ? r.radar.propostasEnviadas : '-'} caption={r ? `${r.conversao.leadParaProposta}% dos leads criados` : 'No período'} />
      <StatCard label="Vendas ganhas" icon={<CircleCheck size={18} />} tone="positive" value={r ? r.radar.vendasGanhas : '-'} caption={r ? `${r.conversao.propostaParaVenda}% das propostas` : 'No período'} />
      <StatCard
        label="Conversão geral"
        icon={<Percent size={18} />}
        value={r ? `${r.conversao.geral}%` : '-'}
        progress={r ? r.conversao.geral : 0}
        caption={r ? `${perdidas} ${perdidas === 1 ? 'venda perdida' : 'vendas perdidas'}` : 'No período'}
      />
    </StatGrid>
  );
}
