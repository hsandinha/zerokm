"use client";

import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Stage, Lead } from './types';
import { LEAD_STAGE_TYPE_LABELS } from '@/lib/utils/crmFunnel';
import LeadCard from './LeadCard';
import styles from './Kanban.module.css';

interface Props {
  stage: Stage;
  leads: Lead[];
  onOpenLead?: (leadId: string) => void;
}

export default function KanbanColumn({ stage, leads, onOpenLead }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <div className={styles.column} style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, background: 'transparent', borderRadius: '8px', border: '1px solid var(--admin-border, #e5e7eb)' }}>
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px', background: 'var(--color-surface)', borderTopLeftRadius: '8px', borderTopRightRadius: '8px', borderBottom: '1px solid var(--admin-border, #e5e7eb)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: stage.color || 'var(--admin-border, #e5e7eb)', flexShrink: 0 }} />
                <h3 style={{ color: 'var(--admin-text, #111827)', margin: 0, fontSize: '1rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stage.name}</h3>
            </div>
            <span style={{ background: 'var(--admin-panel, #f3f4f6)', color: '#3B82F6', fontSize: '0.875rem', padding: '2px 10px', borderRadius: '9999px', fontWeight: 600, flexShrink: 0 }}>
                {leads.length}
            </span>
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--admin-muted, #6b7280)', paddingLeft: '16px' }}>
          {LEAD_STAGE_TYPE_LABELS[stage.type] ?? 'Em andamento'}
        </span>
      </div>

      {/* A área de drop ocupa toda a altura da coluna. Antes ela encolhia até o
          tamanho do conteúdo, e numa etapa vazia sobrava uma faixa de poucos
          pixels — soltar o card ali quase nunca acertava o alvo. */}
      <div
        ref={setNodeRef}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '16px 12px',
          overflowY: 'auto',
          minHeight: '320px',
          background: isOver ? '#EFF6FF' : 'var(--admin-panel, #f9fafb)',
          transition: 'background 0.15s ease',
        }}
      >
        <SortableContext
          id={stage.id}
          items={leads.map(l => l.id)}
          strategy={verticalListSortingStrategy}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
            {leads.length === 0 ? (
                <div style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: '260px',
                  padding: '24px',
                  textAlign: 'center',
                  color: isOver ? '#1D4ED8' : 'var(--admin-muted, #9ca3af)',
                  fontSize: '0.875rem',
                  border: `1px dashed ${isOver ? '#3B82F6' : 'var(--admin-border, #d1d5db)'}`,
                  borderRadius: '8px',
                }}>
                    {isOver ? 'Solte aqui' : 'Sem leads nesta etapa'}
                </div>
            ) : (
                leads.map((lead) => (
                  <LeadCard key={lead.id} lead={lead} onOpen={onOpenLead} />
                ))
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}
