"use client";

import React, { useEffect, useState } from 'react';
import { MdClose } from 'react-icons/md';
import { FiArrowRight, FiPlusCircle, FiTrash2, FiClock } from 'react-icons/fi';
import { lostReasonLabel } from '@/lib/utils/crmFunnel';
import { LeadDetail, LeadTaskItem, Owner, formatDateTime } from './types';

interface Props {
  leadId: string;
  onClose: () => void;
  onSaved: () => void;
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px',
};

const valueStyle: React.CSSProperties = { color: 'var(--color-text)', fontSize: '0.9375rem' };

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-highlight)',
  color: 'var(--color-text)', borderRadius: '8px', padding: '10px 12px', outline: 'none',
};

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
    if (!confirm(`Excluir a tarefa "${task.title}"?`)) return;
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 55, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', padding: '16px' }}>
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-highlight)', width: '100%', maxWidth: '640px', borderRadius: '12px', display: 'flex', flexDirection: 'column', maxHeight: '90vh', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid var(--color-highlight)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--color-text)', margin: 0 }}>
            {lead ? lead.name : 'Carregando…'}
          </h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }} aria-label="Fechar">
            <MdClose size={24} />
          </button>
        </div>

        <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {error && (
            <div style={{ background: 'rgba(220,38,38,0.12)', border: '1px solid #DC2626', color: '#FCA5A5', padding: '10px 12px', borderRadius: '8px', fontSize: '0.875rem' }}>
              {error}
            </div>
          )}

          {lead && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px' }}>
                <div>
                  <span style={labelStyle}>Criado em</span>
                  <span style={valueStyle}>{formatDateTime(lead.createdAt)}</span>
                </div>
                <div>
                  <span style={labelStyle}>Etapa atual</span>
                  <span style={valueStyle}>{lead.stageName}</span>
                </div>
                <div>
                  <span style={labelStyle}>Status</span>
                  <span style={valueStyle}>{STATUS_LABEL[lead.stageType] ?? lead.stageType}</span>
                </div>
                <div>
                  <span style={labelStyle}>Contato</span>
                  <span style={valueStyle}>{lead.phone}{lead.email ? ` • ${lead.email}` : ''}</span>
                </div>
              </div>

              <div>
                <span style={labelStyle}>Origem</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {lead.tags.length > 0 ? lead.tags.map(tag => (
                    <span key={tag} style={{ fontSize: '0.75rem', padding: '4px 10px', background: 'rgba(59,130,246,0.15)', color: '#93C5FD', borderRadius: '9999px', fontWeight: 600 }}>{tag}</span>
                  )) : (
                    <span style={{ ...valueStyle, color: 'var(--color-text-muted)' }}>{lead.source || 'Não identificada'}</span>
                  )}
                </div>
                {lead.firstMessage && (
                  <p style={{ marginTop: '8px', marginBottom: 0, fontSize: '0.8125rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                    “{lead.firstMessage}”
                  </p>
                )}
              </div>

              {lead.lostReason && (
                <div>
                  <span style={labelStyle}>Motivo da perda</span>
                  <span style={valueStyle}>{lostReasonLabel(lead.lostReason)}</span>
                  {lead.lostReasonNote && (
                    <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>{lead.lostReasonNote}</p>
                  )}
                </div>
              )}

              <div>
                <label style={labelStyle} htmlFor="lead-owner">Responsável</label>
                <select id="lead-owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} style={inputStyle}>
                  <option value="" style={{ color: '#000' }}>Sem responsável</option>
                  {owners.map(o => (
                    <option key={o.id} value={o.id} style={{ color: '#000' }}>{o.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle} htmlFor="lead-proposal">Valor da proposta (R$)</label>
                <input
                  id="lead-proposal"
                  value={proposalValue}
                  onChange={(e) => setProposalValue(e.target.value)}
                  placeholder="0,00"
                  inputMode="decimal"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle} htmlFor="lead-notes">Anotações</label>
                <textarea id="lead-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>

              <div>
                <span style={labelStyle}>Tarefas e follow-up</span>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                  <input
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="Ex.: Ligar para negociar entrada"
                    style={{ ...inputStyle, flex: '1 1 200px' }}
                  />
                  <input
                    type="datetime-local"
                    value={newTaskDue}
                    onChange={(e) => setNewTaskDue(e.target.value)}
                    style={{ ...inputStyle, flex: '0 1 200px', colorScheme: 'dark' }}
                  />
                  <button
                    onClick={handleAddTask}
                    disabled={taskBusy}
                    style={{ background: 'var(--color-primary)', color: 'var(--color-text)', padding: '10px 16px', borderRadius: '8px', fontWeight: 600, border: 'none', cursor: taskBusy ? 'not-allowed' : 'pointer', opacity: taskBusy ? 0.5 : 1 }}
                  >
                    Adicionar
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {tasks.length === 0 ? (
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', fontStyle: 'italic', margin: 0 }}>
                      Nenhuma tarefa. Crie lembretes para não perder o follow-up deste lead.
                    </p>
                  ) : tasks.map(task => {
                    const overdue = !task.done && new Date(task.dueAt) < new Date();
                    return (
                      <div key={task.id} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '10px 12px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${overdue ? '#DC2626' : 'var(--color-highlight)'}`, borderRadius: '8px' }}>
                        <input
                          type="checkbox"
                          checked={task.done}
                          onChange={() => handleToggleTask(task)}
                          disabled={taskBusy}
                          style={{ cursor: 'pointer', width: '16px', height: '16px', flexShrink: 0 }}
                          aria-label={task.done ? 'Reabrir tarefa' : 'Concluir tarefa'}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: 'var(--color-text)', fontSize: '0.875rem', textDecoration: task.done ? 'line-through' : 'none', opacity: task.done ? 0.6 : 1 }}>
                            {task.title}
                          </div>
                          <div style={{ color: overdue ? '#FCA5A5' : 'var(--color-text-muted)', fontSize: '0.75rem', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <FiClock size={11} />
                            {formatDateTime(task.dueAt)}
                            {overdue && ' • Atrasada'}
                            {task.done && task.doneAt && ` • Concluída em ${formatDateTime(task.doneAt)}`}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteTask(task)}
                          disabled={taskBusy}
                          style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '4px', flexShrink: 0 }}
                          title="Excluir tarefa"
                        >
                          <FiTrash2 size={15} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <span style={labelStyle}>Histórico de movimentações</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                  {lead.history.length === 0 ? (
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', fontStyle: 'italic', margin: 0 }}>
                      Sem movimentações registradas. Leads criados antes desta versão não têm histórico.
                    </p>
                  ) : lead.history.map(event => (
                    <div key={event.id} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '10px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-highlight)', borderRadius: '8px' }}>
                      <span style={{ color: 'var(--color-text-muted)', marginTop: '2px' }}>
                        {event.type === 'created' ? <FiPlusCircle size={16} /> : <FiArrowRight size={16} />}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: 'var(--color-text)', fontSize: '0.875rem' }}>
                          {event.type === 'created'
                            ? <>Lead criado em <strong>{event.toStageName}</strong></>
                            : <>{event.fromStageName} <FiArrowRight size={11} style={{ verticalAlign: 'middle', margin: '0 4px' }} /> <strong>{event.toStageName}</strong></>}
                          {event.lostReason && <> — {lostReasonLabel(event.lostReason)}</>}
                        </div>
                        <div style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', marginTop: '2px' }}>
                          {formatDateTime(event.createdAt)} • {event.actor === 'webhook' ? 'Integração' : event.actorEmail || 'Usuário'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--color-highlight)', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button onClick={onClose} style={{ background: 'transparent', color: 'var(--color-text-muted)', padding: '10px 16px', borderRadius: '8px', fontWeight: 600, border: '1px solid var(--color-highlight)', cursor: 'pointer' }}>
            Fechar
          </button>
          <button
            onClick={handleSave}
            disabled={!lead || saving}
            style={{ background: 'var(--color-primary)', color: 'var(--color-text)', padding: '10px 20px', borderRadius: '8px', fontWeight: 600, border: 'none', cursor: (!lead || saving) ? 'not-allowed' : 'pointer', opacity: (!lead || saving) ? 0.5 : 1 }}
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
