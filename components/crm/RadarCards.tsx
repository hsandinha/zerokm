"use client";

import React from 'react';
import { ReportData } from './types';
import styles from './Kanban.module.css';

interface Props {
  report: ReportData | null;
  loading: boolean;
}

const card = (accent: string): React.CSSProperties => ({
  minWidth: '200px', flex: 1, background: '#FFFFFF', borderRadius: '12px', padding: '20px',
  border: '1px solid #E5E7EB', borderTop: `3px solid ${accent}`, boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  display: 'flex', flexDirection: 'column', gap: '8px',
});

const value: React.CSSProperties = { fontSize: '1.75rem', fontWeight: 700, color: '#111827', lineHeight: 1 };
const label: React.CSSProperties = { fontSize: '0.9375rem', color: '#6B7280', fontWeight: 500 };
const hint: React.CSSProperties = { fontSize: '0.75rem', color: '#9CA3AF' };

/** Radar Comercial: leads criados, propostas enviadas e vendas ganhas no período. */
export default function RadarCards({ report, loading }: Props) {
  if (loading || !report) {
    return (
      <div className={styles.statsRow}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{ ...card('#E5E7EB'), height: '116px', opacity: 0.5 }} />
        ))}
      </div>
    );
  }

  const { radar, conversao } = report;

  return (
    <div className={styles.statsRow}>
      <div style={card('#3B82F6')}>
        <span style={value}>{radar.leadsCriados}</span>
        <span style={label}>Leads criados</span>
        <span style={hint}>Entradas no funil no período</span>
      </div>

      <div style={card('#FBBF24')}>
        <span style={value}>{radar.propostasEnviadas}</span>
        <span style={label}>Propostas enviadas</span>
        <span style={hint}>{conversao.leadParaProposta}% dos leads criados</span>
      </div>

      <div style={card('#10B981')}>
        <span style={value}>{radar.vendasGanhas}</span>
        <span style={label}>Vendas ganhas</span>
        <span style={hint}>{conversao.propostaParaVenda}% das propostas</span>
      </div>

      <div style={{ minWidth: '200px', background: '#111827', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span style={{ ...value, color: '#FFFFFF' }}>{conversao.geral}%</span>
        <span style={{ ...label, color: '#9CA3AF' }}>Conversão geral</span>
        <span style={{ ...hint, color: '#6B7280' }}>{radar.vendasPerdidas} venda(s) perdida(s)</span>
      </div>
    </div>
  );
}
