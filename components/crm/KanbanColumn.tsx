"use client";

import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Stage, Lead } from './KanbanBoard';
import LeadCard from './LeadCard';

interface Props {
  stage: Stage;
  leads: Lead[];
}

export default function KanbanColumn({ stage, leads }: Props) {
  const { setNodeRef } = useDroppable({
    id: stage.id,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, width: '320px', background: 'var(--color-surface)', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', border: '1px solid var(--color-highlight)' }}>
      <div 
        style={{ padding: '16px', borderBottom: '1px solid var(--color-highlight)', borderTopLeftRadius: '8px', borderTopRightRadius: '8px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: `4px solid ${stage.color || '#E5E7EB'}` }}
      >
        <h3 style={{ color: 'var(--color-text)', margin: 0 }}>{stage.name}</h3>
        <span style={{ background: 'var(--color-highlight)', color: 'var(--color-text-muted)', fontSize: '0.75rem', padding: '2px 8px', borderRadius: '9999px' }}>
          {leads.length}
        </span>
      </div>

      <div 
        ref={setNodeRef}
        style={{ flex: 1, padding: '12px', overflowY: 'auto', minHeight: '150px' }}
      >
        <SortableContext
          id={stage.id}
          items={leads.map(l => l.id)}
          strategy={verticalListSortingStrategy}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {leads.map((lead) => (
              <LeadCard key={lead.id} lead={lead} />
            ))}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}
