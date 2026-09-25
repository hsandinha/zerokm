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
    <section className={styles.column} aria-label={`${stage.name}, ${leads.length} ${leads.length === 1 ? 'lead' : 'leads'}`}>
      <header className={styles.columnHead}>
        <div className={styles.columnTitleRow}>
          <h3 className={styles.columnName}>
            {/* A cor da fase é escolhida pelo usuário em Gerenciar fases. */}
            <span className={styles.stageDot} style={stage.color ? { background: stage.color } : undefined} aria-hidden="true" />
            <span>{stage.name}</span>
          </h3>
          <span className={styles.columnCount}>{leads.length}</span>
        </div>
        <span className={styles.columnType}>{LEAD_STAGE_TYPE_LABELS[stage.type] ?? 'Em andamento'}</span>
      </header>

      {/* A área de soltar ocupa a coluna inteira: numa etapa vazia o alvo continua grande. */}
      <div ref={setNodeRef} className={styles.drop} data-over={isOver}>
        <SortableContext id={stage.id} items={leads.map(l => l.id)} strategy={verticalListSortingStrategy}>
          {leads.length === 0
            ? <div className={styles.dropEmpty}>{isOver ? 'Solte aqui' : 'Sem leads nesta etapa'}</div>
            : leads.map(lead => <LeadCard key={lead.id} lead={lead} onOpen={onOpenLead} />)}
        </SortableContext>
      </div>
    </section>
  );
}
