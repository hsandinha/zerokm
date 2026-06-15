"use client";

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Lead } from './KanbanBoard';

interface Props {
  lead: Lead;
  isDragging?: boolean;
}

export default function LeadCard({ lead, isDragging }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: lead.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        background: 'rgba(255,255,255,0.05)',
        padding: '16px',
        borderRadius: '8px',
        border: '1px solid var(--color-highlight)',
        cursor: isDragging ? 'grabbing' : 'grab',
        transition: 'border-color 0.2s ease',
        opacity: isDragging ? 0.5 : 1,
        transform: isDragging ? `${style.transform} scale(1.02)` : style.transform,
        boxShadow: isDragging ? '0 0 0 2px var(--color-primary)' : 'none',
      }}
      {...attributes}
      {...listeners}
    >
      <div style={{ fontWeight: 600, color: 'var(--color-text)', marginBottom: '4px' }}>{lead.name}</div>
      <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '12px' }}>{lead.phone}</div>
      
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
        {lead.source && (
          <span style={{ fontSize: '0.625rem', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.05em', padding: '4px 8px', background: 'rgba(255,255,255,0.1)', color: 'var(--color-text-muted)', borderRadius: '4px' }}>
            {lead.source}
          </span>
        )}
        {lead.campaign && (
          <span style={{ fontSize: '0.625rem', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.05em', padding: '4px 8px', background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '4px' }}>
            {lead.campaign}
          </span>
        )}
      </div>
    </div>
  );
}
