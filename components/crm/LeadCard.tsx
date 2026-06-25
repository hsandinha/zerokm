"use client";

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Lead } from './KanbanBoard';
import { FiPhone, FiMail, FiEye, FiHome, FiClock, FiCheckSquare, FiEdit, FiTrash2, FiUser, FiCalendar, FiGrid } from 'react-icons/fi';

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

  // Placeholder para a data, no futuro pode ser lead.createdAt formatado
  const leadDate = "04 de nov.";

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        background: '#FFFFFF',
        borderRadius: '12px',
        border: '1px solid #E5E7EB',
        cursor: isDragging ? 'grabbing' : 'grab',
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
        opacity: isDragging ? 0.5 : 1,
        transform: isDragging ? `${style.transform} scale(1.02)` : style.transform,
        boxShadow: isDragging ? '0 10px 15px -3px rgba(0, 0, 0, 0.1)' : '0 1px 2px rgba(0, 0, 0, 0.05)',
        display: 'flex',
        flexDirection: 'row',
        overflow: 'hidden'
      }}
      {...attributes}
      {...listeners}
    >
      {/* Área do Drag Handle */}
      <div style={{ width: '24px', background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid #E5E7EB', color: '#D1D5DB' }}>
        <FiGrid size={14} />
      </div>

      <div style={{ flex: 1, padding: '16px' }}>
          {/* Header Info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
            <span style={{ fontWeight: 700, color: '#111827', fontSize: '0.875rem', textTransform: 'uppercase' }}>
              {lead.name.length > 20 ? lead.name.substring(0, 20) + '...' : lead.name}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>
              {lead.phone} • {lead.email ? (lead.email.length > 15 ? lead.email.substring(0, 15) + '...' : lead.email) : 'S/ email'}
            </span>
          </div>

          {/* Tags */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
            {lead.source ? (
              <span style={{ fontSize: '0.625rem', padding: '2px 8px', background: '#F3F4F6', color: '#4B5563', borderRadius: '4px', fontWeight: 600 }}>
                {lead.source}
              </span>
            ) : (
                <span style={{ fontSize: '0.625rem', padding: '2px 8px', background: '#F3F4F6', color: '#4B5563', borderRadius: '4px', fontWeight: 600 }}>
                    Orgânico
                </span>
            )}
            {lead.campaign && (
              <span style={{ fontSize: '0.625rem', padding: '2px 8px', background: '#EFF6FF', color: '#3B82F6', borderRadius: '4px', fontWeight: 600 }}>
                {lead.campaign}
              </span>
            )}
          </div>

          {/* Data */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '16px', fontSize: '0.75rem', color: '#6B7280' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <FiCalendar size={12} />
                <span>{leadDate}</span>
            </div>
          </div>

          {/* Ícones de Ação */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', alignItems: 'center', paddingTop: '12px', borderTop: '1px dashed #E5E7EB' }}>
              <button style={{ background: '#F9FAFB', border: '1px solid #F3F4F6', borderRadius: '4px', cursor: 'pointer', color: '#9CA3AF', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Telefone"><FiPhone size={14} /></button>
              <button style={{ background: '#F9FAFB', border: '1px solid #F3F4F6', borderRadius: '4px', cursor: 'pointer', color: '#9CA3AF', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="E-mail"><FiMail size={14} /></button>
              <button style={{ background: '#F9FAFB', border: '1px solid #F3F4F6', borderRadius: '4px', cursor: 'pointer', color: '#9CA3AF', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Editar"><FiEdit size={14} /></button>
          </div>
      </div>
    </div>
  );
}
