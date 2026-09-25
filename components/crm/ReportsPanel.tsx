"use client";

import React from 'react';
import { ReportData } from './types';
import { EmptyState, SectionCard, pageStyles } from '@/components/ui/Page';
import styles from './Kanban.module.css';
import { BarChart3 } from 'lucide-react';

interface Props {
  report: ReportData | null;
  loading: boolean;
}

export default function ReportsPanel({ report, loading }: Props) {
  if (loading) return <SectionCard title="Relatórios"><p className={pageStyles.muted}>Calculando relatórios...</p></SectionCard>;
  if (!report) return <SectionCard title="Relatórios"><EmptyState icon={<BarChart3 size={20} />} title="Relatórios indisponíveis" description="Não foi possível calcular os números agora. Atualize a página." /></SectionCard>;

  const maxEntradas = Math.max(1, ...report.porEtapa.map(e => e.entradas));

  return (
    <>
      <SectionCard title="Conversão por etapa" description={<>Quantos leads <strong>passaram</strong> por cada etapa no período, não quantos estão parados nela hoje.</>}>
        {report.porEtapa.length === 0 ? <p className={pageStyles.muted}>Nenhuma fase cadastrada.</p> : report.porEtapa.map(stage => (
          <div key={stage.id} className={styles.barRow}>
            <span className={styles.barLabel} title={stage.name}>{stage.name}</span>
            <span className={styles.barTrack} aria-hidden="true">
              {/* Cor da fase definida pelo usuário. */}
              <span style={{ width: `${(stage.entradas / maxEntradas) * 100}%`, ...(stage.color ? { background: stage.color } : {}) }} />
            </span>
            <span className={styles.barValue}><strong>{stage.entradas}</strong> {stage.entradas === 1 ? 'entrada' : 'entradas'} · {stage.conversao}% · {stage.atuais} agora</span>
          </div>
        ))}
      </SectionCard>

      <SectionCard title="Conversão por origem" description="Desempenho de cada campanha, da entrada até a venda.">
        {report.porOrigem.length === 0 ? <p className={pageStyles.muted}>Nenhum lead no período.</p> : (
          <div className={pageStyles.tableWrap}>
            <table className={pageStyles.table}>
              <thead>
                <tr>
                  <th>Origem</th>
                  <th className={pageStyles.num}>Leads</th>
                  <th className={pageStyles.num}>Propostas</th>
                  <th className={pageStyles.num}>Vendas</th>
                  <th className={pageStyles.num}>Conversão</th>
                </tr>
              </thead>
              <tbody>
                {report.porOrigem.map(row => (
                  <tr key={row.tag}>
                    <td><strong>{row.tag}</strong></td>
                    <td className={pageStyles.num}>{row.criados}</td>
                    <td className={pageStyles.num}>{row.propostas}</td>
                    <td className={pageStyles.num}>{row.ganhas}</td>
                    <td className={pageStyles.num}><strong>{row.conversao}%</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Motivos de perda" description="Onde o funil está vazando.">
        {report.motivosPerda.length === 0 ? <p className={pageStyles.muted}>Nenhuma venda perdida no período.</p> : report.motivosPerda.map(m => (
          <div key={m.reason} className={styles.barRow}>
            <span className={styles.barLabel}>{m.label}</span>
            <span className={styles.barTrack} data-tone="negative" aria-hidden="true"><span style={{ width: `${m.percentual}%` }} /></span>
            <span className={styles.barValue}><strong>{m.total}</strong> · {m.percentual}%</span>
          </div>
        ))}
      </SectionCard>
    </>
  );
}
