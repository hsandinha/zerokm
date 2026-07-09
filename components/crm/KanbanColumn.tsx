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
  const { setNodeRef } = useDroppable({ id: stage.id });

  return (
    <div className={styles.column} style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, background: 'transparent', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px', background: '#FFFFFF', borderTopLeftRadius: '8px', borderTopRightRadius: '8px', borderBottom: '1px solid #E5E7EB' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: stage.color || '#E5E7EB', flexShrink: 0 }} />
                <h3 style={{ color: '#111827', margin: 0, fontSize: '1rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stage.name}</h3>
            </div>
            <span style={{ background: '#F3F4F6', color: '#3B82F6', fontSize: '0.875rem', padding: '2px 10px', borderRadius: '9999px', fontWeight: 600, flexShrink: 0 }}>
                {leads.length}
            </span>
        </div>
        <span style={{ fontSize: '0.75rem', color: '#6B7280', paddingLeft: '16px' }}>
          {LEAD_STAGE_TYPE_LABELS[stage.type] ?? 'Em andamento'}
        </span>
      </div>

      <div
        ref={setNodeRef}
        style={{ flex: 1, padding: '16px 12px', overflowY: 'auto', minHeight: '150px', background: '#F9FAFB' }}
      >
        <SortableContext
          id={stage.id}
          items={leads.map(l => l.id)}
          strategy={verticalListSortingStrategy}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {leads.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#9CA3AF', fontSize: '0.875rem', border: '1px dashed #D1D5DB', borderRadius: '8px' }}>
                    Sem leads nesta etapa
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
