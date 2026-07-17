"use client";

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Lead, formatDate, formatCurrencyBRL } from './types';
import { lostReasonLabel } from '@/lib/utils/crmFunnel';
import { FiPhone, FiMail, FiEdit, FiUser, FiCalendar, FiGrid, FiClock, FiDollarSign } from 'react-icons/fi';

interface Props {
  lead: Lead;
  isDragging?: boolean;
  onOpen?: (leadId: string) => void;
}

const iconButton: React.CSSProperties = {
  background: '#F9FAFB', border: '1px solid #F3F4F6', borderRadius: '4px', cursor: 'pointer',
  color: '#9CA3AF', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const chip = (background: string, color: string): React.CSSProperties => ({
  fontSize: '0.625rem', padding: '2px 8px', background, color, borderRadius: '4px', fontWeight: 600,
});

export default function LeadCard({ lead, isDragging, onOpen }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: lead.id });

  const style = { transform: CSS.Transform.toString(transform), transition };
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        background: '#FFFFFF',
        borderRadius: '12px',
        border: '1px solid #E5E7EB',
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
        opacity: isDragging ? 0.5 : 1,
        transform: isDragging ? `${style.transform} scale(1.02)` : style.transform,
        boxShadow: isDragging ? '0 10px 15px -3px rgba(0, 0, 0, 0.1)' : '0 1px 2px rgba(0, 0, 0, 0.05)',
        display: 'flex',
        flexDirection: 'row',
        overflow: 'hidden'
      }}
    >
      {/* Só a alça arrasta: assim os botões e o clique de abrir o lead continuam funcionando. */}
      <div
        {...attributes}
        {...listeners}
        style={{ width: '24px', background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid #E5E7EB', color: '#D1D5DB', cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
        title="Arraste para mover de fase"
      >
        <FiGrid size={14} />
      </div>

      <div
        style={{ flex: 1, padding: '16px', cursor: onOpen ? 'pointer' : 'default' }}
        onClick={() => onOpen?.(lead.id)}
      >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
            <span style={{ fontWeight: 700, color: '#111827', fontSize: '0.875rem', textTransform: 'uppercase' }}>
              {lead.name.length > 20 ? lead.name.substring(0, 20) + '...' : lead.name}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>
              {lead.phone} • {lead.email ? (lead.email.length > 15 ? lead.email.substring(0, 15) + '...' : lead.email) : 'S/ email'}
            </span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
            {lead.tags.length > 0 ? (
              lead.tags.map(tag => (
                <span key={tag} style={chip('#EFF6FF', '#3B82F6')}>{tag}</span>
              ))
            ) : (
              <span style={chip('#F3F4F6', '#4B5563')}>{lead.source || 'Orgânico'}</span>
            )}
            {lead.lostReason && (
              <span style={chip('#FEF2F2', '#DC2626')}>{lostReasonLabel(lead.lostReason)}</span>
            )}
            {typeof lead.proposalValue === 'number' && lead.proposalValue > 0 && (
              <span style={{ ...chip('#ECFDF5', '#059669'), display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                <FiDollarSign size={10} />{formatCurrencyBRL(lead.proposalValue)}
              </span>
            )}
            {(lead.pendingTasks ?? 0) > 0 && lead.nextTaskAt && (
              new Date(lead.nextTaskAt) < new Date() ? (
                <span style={{ ...chip('#FEF2F2', '#DC2626'), display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                  <FiClock size={10} />Tarefa atrasada
                </span>
              ) : (
                <span style={{ ...chip('#FFFBEB', '#B45309'), display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                  <FiClock size={10} />{formatDate(lead.nextTaskAt)}
                </span>
              )
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', fontSize: '0.75rem', color: '#6B7280' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
                <FiUser size={12} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {lead.ownerName || 'Sem responsável'}
                </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                <FiCalendar size={12} />
                <span>{formatDate(lead.createdAt)}</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', alignItems: 'center', paddingTop: '12px', borderTop: '1px dashed #E5E7EB' }}>
              <a href={`tel:${lead.phone}`} onClick={stop} style={{ ...iconButton, textDecoration: 'none' }} title="Ligar"><FiPhone size={14} /></a>
              <a
                href={lead.email ? `mailto:${lead.email}` : undefined}
                onClick={lead.email ? stop : (e) => e.preventDefault()}
                style={{ ...iconButton, textDecoration: 'none', opacity: lead.email ? 1 : 0.4 }}
                title={lead.email ? 'Enviar e-mail' : 'Lead sem e-mail'}
              >
                <FiMail size={14} />
              </a>
              <button
                onClick={(e) => { stop(e); onOpen?.(lead.id); }}
                style={iconButton}
                title="Abrir lead"
              >
                <FiEdit size={14} />
              </button>
          </div>
      </div>
    </div>
  );
}
