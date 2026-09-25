"use client";

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CalendarDays, Clock, GripVertical, Mail, Pencil, Phone, UserRound } from 'lucide-react';
import { Lead, formatDate, formatCurrencyBRL } from './types';
import { lostReasonLabel } from '@/lib/utils/crmFunnel';
import { StatusBadge } from '@/components/ui/Page';
import styles from './Kanban.module.css';

interface Props {
  lead: Lead;
  isDragging?: boolean;
  onOpen?: (leadId: string) => void;
}

export default function LeadCard({ lead, isDragging, onOpen }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: lead.id });
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const tarefaAtrasada = (lead.pendingTasks ?? 0) > 0 && !!lead.nextTaskAt && new Date(lead.nextTaskAt) < new Date();

  return (
    <article
      ref={setNodeRef}
      className={styles.card}
      data-dragging={Boolean(isDragging)}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {/* Só a alça arrasta: os botões e o clique de abrir continuam funcionando. */}
      <div {...attributes} {...listeners} className={styles.handle} title="Arraste para mudar de fase" aria-label={`Mover ${lead.name}`}>
        <GripVertical size={14} aria-hidden="true" />
      </div>

      <div className={styles.cardBody} onClick={() => onOpen?.(lead.id)}>
        <div>
          <div className={styles.cardName} title={lead.name}>{lead.name}</div>
          <div className={styles.cardContact}>{[lead.phone, lead.email].filter(Boolean).join(' · ') || 'Sem contato'}</div>
        </div>

        <div className={styles.chips}>
          {lead.tags.length > 0
            ? lead.tags.map(tag => <StatusBadge key={tag} tone="info" dot={false}>{tag}</StatusBadge>)
            : <StatusBadge dot={false}>{lead.source || 'Orgânico'}</StatusBadge>}
          {lead.lostReason && <StatusBadge tone="negative" dot={false}>{lostReasonLabel(lead.lostReason)}</StatusBadge>}
          {typeof lead.proposalValue === 'number' && lead.proposalValue > 0 && (
            <StatusBadge tone="positive" dot={false}>{formatCurrencyBRL(lead.proposalValue)}</StatusBadge>
          )}
          {(lead.pendingTasks ?? 0) > 0 && lead.nextTaskAt && (
            tarefaAtrasada
              ? <StatusBadge tone="negative" dot={false}><Clock size={11} aria-hidden="true" /> Tarefa atrasada</StatusBadge>
              : <StatusBadge tone="warning" dot={false}><Clock size={11} aria-hidden="true" /> {formatDate(lead.nextTaskAt)}</StatusBadge>
          )}
        </div>

        <div className={styles.cardMeta}>
          <span><UserRound size={12} aria-hidden="true" />{lead.ownerName || 'Sem responsável'}</span>
          <span><CalendarDays size={12} aria-hidden="true" />{formatDate(lead.createdAt)}</span>
        </div>

        <div className={styles.cardActions}>
          <a href={`tel:${lead.phone}`} onClick={stop} className={styles.cardAction} title="Ligar" aria-label={`Ligar para ${lead.name}`}><Phone size={15} aria-hidden="true" /></a>
          <a
            href={lead.email ? `mailto:${lead.email}` : undefined}
            onClick={lead.email ? stop : (e) => { e.preventDefault(); e.stopPropagation(); }}
            className={styles.cardAction}
            aria-disabled={!lead.email}
            title={lead.email ? 'Enviar e-mail' : 'Lead sem e-mail'}
            aria-label={lead.email ? `Enviar e-mail para ${lead.name}` : 'Lead sem e-mail'}
          >
            <Mail size={15} aria-hidden="true" />
          </a>
          <button type="button" onClick={(e) => { stop(e); onOpen?.(lead.id); }} className={styles.cardAction} title="Abrir lead" aria-label={`Abrir ${lead.name}`}>
            <Pencil size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  );
}
