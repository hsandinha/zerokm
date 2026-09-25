"use client";

import React, { useEffect, useState } from 'react';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';
import { useFeedback } from '@/components/ui/Feedback';
import crm from './crmModals.module.css';
import { FiArrowRight, FiPlusCircle, FiTrash2, FiClock } from 'react-icons/fi';
import { lostReasonLabel } from '@/lib/utils/crmFunnel';
import { LeadDetail, LeadTaskItem, Owner, formatDateTime } from './types';

interface Props {
  leadId: string;
  onClose: () => void;
  onSaved: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Em andamento',
  proposal: 'Proposta enviada',
  won: 'Venda ganha',
  lost: 'Venda perdida',
};

const formatCurrencyInput = (value: number | null | undefined) =>
  typeof value === 'number' && value > 0
    ? value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';

/** Aceita "185.000,00", "R$ 185000" etc. Retorna null para vazio, NaN para inválido. */
const parseCurrencyInput = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\s/g, '').replace(/R\$/gi, '').replace(/\./g, '').replace(',', '.');
  return Number(normalized);
};

export default function LeadDetailModal({ leadId, onClose, onSaved }: Props) {
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [ownerId, setOwnerId] = useState('');
  const [notes, setNotes] = useState('');
  const [proposalValue, setProposalValue] = useState('');
  const [tasks, setTasks] = useState<LeadTaskItem[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');
  const [taskBusy, setTaskBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { confirm, feedback } = useFeedback();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [leadRes, ownersRes, tasksRes] = await Promise.all([
          fetch(`/api/crm/leads/${leadId}`),
          fetch('/api/crm/owners'),
          fetch(`/api/crm/leads/${leadId}/tasks`),
        ]);
        if (!leadRes.ok) throw new Error('Não foi possível carregar o lead');

        const leadData = await leadRes.json();
        const ownersData = ownersRes.ok ? await ownersRes.json() : { data: [] };
        const tasksData = tasksRes.ok ? await tasksRes.json() : { data: [] };
        if (cancelled) return;

        setLead(leadData.data);
        setOwnerId(leadData.data.ownerId || '');
        setNotes(leadData.data.notes || '');
        setProposalValue(formatCurrencyInput(leadData.data.proposalValue));
        setTasks(Array.isArray(tasksData.data) ? tasksData.data : []);
        setOwners(ownersData.data || []);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Erro ao carregar o lead');
      }
    })();

    return () => { cancelled = true; };
  }, [leadId]);

  const handleSave = async () => {
    const parsedProposal = parseCurrencyInput(proposalValue);
    if (parsedProposal !== null && (!Number.isFinite(parsedProposal) || parsedProposal < 0)) {
      setError('Valor da proposta inválido. Use apenas números, vírgula e ponto.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const owner = owners.find(o => o.id === ownerId);
      const res = await fetch(`/api/crm/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerId: ownerId || null, ownerName: owner?.name, notes, proposalValue: parsedProposal }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Não foi possível salvar');
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleMoveToTrash = async () => {
    if (!lead) return;
    const ok = await confirm({ title: 'Mover para a lixeira', description: <><strong>{lead.name}</strong> sai do quadro. Dá para restaurar pela Lixeira do funil.</>, confirmLabel: 'Mover para a lixeira' });
    if (!ok) return;

    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/crm/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: false }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Não foi possível mover para a lixeira');
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim() || !newTaskDue) {
      setError('Informe a descrição e a data da tarefa');
      return;
    }
    setTaskBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/crm/leads/${leadId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTaskTitle.trim(), dueAt: new Date(newTaskDue).toISOString() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Não foi possível criar a tarefa');
      setTasks(prev => [...prev, data].sort((a, b) =>
        Number(a.done) - Number(b.done) || new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()));
      setNewTaskTitle('');
      setNewTaskDue('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTaskBusy(false);
    }
  };

  const handleToggleTask = async (task: LeadTaskItem) => {
    setTaskBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/crm/leads/${leadId}/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: !task.done }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Não foi possível atualizar a tarefa');
      setTasks(prev => prev.map(t => (t.id === task.id ? data : t)));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTaskBusy(false);
    }
  };

  const handleDeleteTask = async (task: LeadTaskItem) => {
    const ok = await confirm({ title: 'Excluir tarefa', description: <>A tarefa <strong>{task.title}</strong> sai do lead.</>, confirmLabel: 'Excluir tarefa', danger: true });
    if (!ok) return;
    setTaskBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/crm/leads/${leadId}/tasks/${task.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Não foi possível excluir a tarefa');
      }
      setTasks(prev => prev.filter(t => t.id !== task.id));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTaskBusy(false);
    }
  };

  return (
    <AdminModal
      title={lead ? lead.name : 'Carregando…'}
      onClose={onClose}
      size="lg"
      busy={saving}
      footer={<>
        {/* Vai para a lixeira, não apaga: o histórico segue disponível para restaurar. */}
        <button
          type="button"
          onClick={handleMoveToTrash}
          disabled={!lead || saving}
          title="Mover para a lixeira"
          className={`${modalStyles.danger} ${crm.footerStart}`}
        >
          Mover para lixeira
        </button>
        <button type="button" onClick={onClose} className={modalStyles.secondary}>
          Fechar
        </button>
        <button type="button" onClick={handleSave} disabled={!lead || saving} className={modalStyles.primary}>
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </>}
    >
      <div className={modalStyles.stack}>
        {error && <div className={crm.error} role="alert">{error}</div>}

        {lead && (
          <>
            <div className={modalStyles.facts}>
              <div className={modalStyles.fact}>
                <span className={modalStyles.factLabel}>Criado em</span>
                <span className={modalStyles.factValue}>{formatDateTime(lead.createdAt)}</span>
              </div>
              <div className={modalStyles.fact}>
                <span className={modalStyles.factLabel}>Etapa atual</span>
                <span className={modalStyles.factValue}>{lead.stageName}</span>
              </div>
              <div className={modalStyles.fact}>
                <span className={modalStyles.factLabel}>Status</span>
                <span className={modalStyles.factValue}>{STATUS_LABEL[lead.stageType] ?? lead.stageType}</span>
              </div>
              <div className={modalStyles.fact}>
                <span className={modalStyles.factLabel}>Contato</span>
                <span className={modalStyles.factValue}>{lead.phone}{lead.email ? ` • ${lead.email}` : ''}</span>
              </div>
            </div>

            <div className={modalStyles.fact}>
              <span className={modalStyles.factLabel}>Origem</span>
              <div className={crm.tags}>
                {lead.tags.length > 0 ? lead.tags.map(tag => (
                  <span key={tag} className={crm.tag}>{tag}</span>
                )) : (
                  <span className={modalStyles.factValue} style={{ color: 'var(--color-text-muted)' }}>{lead.source || 'Não identificada'}</span>
                )}
              </div>
              {lead.firstMessage && (
                <p className={crm.quote}>“{lead.firstMessage}”</p>
              )}
            </div>

            {lead.lostReason && (
              <div className={modalStyles.fact}>
                <span className={modalStyles.factLabel}>Motivo da perda</span>
                <span className={modalStyles.factValue}>{lostReasonLabel(lead.lostReason)}</span>
                {lead.lostReasonNote && <p className={crm.note}>{lead.lostReasonNote}</p>}
              </div>
            )}

            <div className={modalStyles.grid2}>
              <div className={modalStyles.field}>
                <label htmlFor="lead-owner">Responsável</label>
                <select id="lead-owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                  <option value="">Sem responsável</option>
                  {owners.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>

              <div className={modalStyles.field}>
                <label htmlFor="lead-proposal">Valor da proposta (R$)</label>
                <input
                  id="lead-proposal"
                  value={proposalValue}
                  onChange={(e) => setProposalValue(e.target.value)}
                  placeholder="0,00"
                  inputMode="decimal"
                />
              </div>

              <div className={`${modalStyles.field} ${modalStyles.span2}`}>
                <label htmlFor="lead-notes">Anotações</label>
                <textarea id="lead-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ resize: 'vertical' }} />
              </div>
            </div>

            <section className={modalStyles.section}>
              <div className={modalStyles.sectionHead}>
                <h3 className={modalStyles.sectionTitle}>Tarefas e follow-up</h3>
              </div>
              <div className={crm.inlineForm} style={{ marginBottom: '10px' }}>
                <input
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="Ex.: Ligar para negociar entrada"
                  aria-label="Descrição da tarefa"
                  className={crm.control}
                />
                <input
                  type="datetime-local"
                  value={newTaskDue}
                  onChange={(e) => setNewTaskDue(e.target.value)}
                  aria-label="Data da tarefa"
                  className={`${crm.control} ${crm.controlNarrow}`}
                />
                <button type="button" onClick={handleAddTask} disabled={taskBusy} className={modalStyles.primary}>
                  Adicionar
                </button>
              </div>
              <div className={crm.list}>
                {tasks.length === 0 ? (
                  <p className={crm.empty}>
                    Nenhuma tarefa. Crie lembretes para não perder o follow-up deste lead.
                  </p>
                ) : tasks.map(task => {
                  const overdue = !task.done && new Date(task.dueAt) < new Date();
                  return (
                    <div key={task.id} className={`${crm.row} ${overdue ? crm.rowAlert : ''}`}>
                      <input
                        type="checkbox"
                        checked={task.done}
                        onChange={() => handleToggleTask(task)}
                        disabled={taskBusy}
                        className={crm.checkbox}
                        aria-label={task.done ? 'Reabrir tarefa' : 'Concluir tarefa'}
                      />
                      <div className={crm.rowMain}>
                        <div className={`${crm.rowText} ${task.done ? crm.rowDone : ''}`}>
                          {task.title}
                        </div>
                        <div className={`${crm.rowMeta} ${overdue ? crm.rowMetaAlert : ''}`}>
                          <FiClock size={11} aria-hidden="true" />
                          {formatDateTime(task.dueAt)}
                          {overdue && ' • Atrasada'}
                          {task.done && task.doneAt && ` • Concluída em ${formatDateTime(task.doneAt)}`}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteTask(task)}
                        disabled={taskBusy}
                        className={crm.iconButton}
                        title="Excluir tarefa"
                        aria-label="Excluir tarefa"
                      >
                        <FiTrash2 size={15} aria-hidden="true" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className={modalStyles.section}>
              <div className={modalStyles.sectionHead}>
                <h3 className={modalStyles.sectionTitle}>Histórico de movimentações</h3>
              </div>
              <div className={crm.list}>
                {lead.history.length === 0 ? (
                  <p className={crm.empty}>
                    Sem movimentações registradas. Leads criados antes desta versão não têm histórico.
                  </p>
                ) : lead.history.map(event => (
                  <div key={event.id} className={`${crm.row} ${crm.rowTop}`}>
                    <span className={crm.rowIcon}>
                      {event.type === 'created' ? <FiPlusCircle size={16} aria-hidden="true" /> : <FiArrowRight size={16} aria-hidden="true" />}
                    </span>
                    <div className={crm.rowMain}>
                      <div className={crm.rowText}>
                        {event.type === 'created'
                          ? <>Lead criado em <strong>{event.toStageName}</strong></>
                          : <>{event.fromStageName} <FiArrowRight size={11} style={{ verticalAlign: 'middle', margin: '0 4px' }} aria-hidden="true" /> <strong>{event.toStageName}</strong></>}
                        {event.lostReason && <>: {lostReasonLabel(event.lostReason)}</>}
                      </div>
                      <div className={crm.rowMeta}>
                        {formatDateTime(event.createdAt)} • {event.actor === 'webhook' ? 'Integração' : event.actorEmail || 'Usuário'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
      {feedback}
    </AdminModal>
  );
}
