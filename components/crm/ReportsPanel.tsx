"use client";

import React from 'react';
import { ReportData } from './types';

interface Props {
  report: ReportData | null;
  loading: boolean;
}

const section: React.CSSProperties = {
  background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '12px',
  padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', marginBottom: '20px',
};

const title: React.CSSProperties = { fontSize: '1rem', fontWeight: 700, color: '#111827', margin: '0 0 4px' };
const subtitle: React.CSSProperties = { fontSize: '0.8125rem', color: '#6B7280', margin: '0 0 16px' };
const th: React.CSSProperties = { textAlign: 'left', fontSize: '0.75rem', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '8px 12px', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '10px 12px', color: '#111827', fontSize: '0.875rem', borderTop: '1px solid #F3F4F6', whiteSpace: 'nowrap' };
const empty: React.CSSProperties = { color: '#9CA3AF', fontSize: '0.875rem', fontStyle: 'italic', margin: 0 };

export default function ReportsPanel({ report, loading }: Props) {
  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#6B7280' }}>Calculando relatórios…</div>;
  }
  if (!report) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#6B7280' }}>Não foi possível carregar os relatórios.</div>;
  }

  const maxEntradas = Math.max(1, ...report.porEtapa.map(e => e.entradas));

  return (
    <div>
      <div style={section}>
        <h3 style={title}>Conversão por etapa</h3>
        <p style={subtitle}>
          Quantos leads <strong>passaram</strong> por cada etapa no período — não quantos estão parados nela hoje.
        </p>

        {report.porEtapa.length === 0 ? (
          <p style={empty}>Nenhuma fase cadastrada.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {report.porEtapa.map(stage => (
              <div key={stage.id} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ width: '180px', flexShrink: 0, fontSize: '0.875rem', color: '#374151', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {stage.name}
                </span>
                <div style={{ flex: 1, background: '#F3F4F6', borderRadius: '6px', height: '24px', position: 'relative', minWidth: '60px' }}>
                  <div style={{ width: `${(stage.entradas / maxEntradas) * 100}%`, background: stage.color || '#3B82F6', height: '100%', borderRadius: '6px', transition: 'width 0.3s ease' }} />
                </div>
                <span style={{ width: '150px', flexShrink: 0, textAlign: 'right', fontSize: '0.8125rem', color: '#6B7280' }}>
                  <strong style={{ color: '#111827' }}>{stage.entradas}</strong> entradas • {stage.conversao}% • {stage.atuais} agora
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={section}>
        <h3 style={title}>Conversão por origem</h3>
        <p style={subtitle}>Performance de cada campanha, da entrada até a venda.</p>

        {report.porOrigem.length === 0 ? (
          <p style={empty}>Nenhum lead no período.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Origem</th>
                  <th style={{ ...th, textAlign: 'right' }}>Leads</th>
                  <th style={{ ...th, textAlign: 'right' }}>Propostas</th>
                  <th style={{ ...th, textAlign: 'right' }}>Vendas</th>
                  <th style={{ ...th, textAlign: 'right' }}>Conversão</th>
                </tr>
              </thead>
              <tbody>
                {report.porOrigem.map(row => (
                  <tr key={row.tag}>
                    <td style={td}>{row.tag}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{row.criados}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{row.propostas}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{row.ganhas}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{row.conversao}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={section}>
        <h3 style={title}>Motivos de perda</h3>
        <p style={subtitle}>Onde o funil está vazando.</p>

        {report.motivosPerda.length === 0 ? (
          <p style={empty}>Nenhuma venda perdida registrada no período.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {report.motivosPerda.map(motivo => (
              <div key={motivo.reason} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ width: '180px', flexShrink: 0, fontSize: '0.875rem', color: '#374151', fontWeight: 500 }}>{motivo.label}</span>
                <div style={{ flex: 1, background: '#F3F4F6', borderRadius: '6px', height: '20px', minWidth: '60px' }}>
                  <div style={{ width: `${motivo.percentual}%`, background: '#EF4444', height: '100%', borderRadius: '6px' }} />
                </div>
                <span style={{ width: '110px', flexShrink: 0, textAlign: 'right', fontSize: '0.8125rem', color: '#6B7280' }}>
                  <strong style={{ color: '#111827' }}>{motivo.total}</strong> • {motivo.percentual}%
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
