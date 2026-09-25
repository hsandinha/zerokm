"use client";

import React, { useState } from 'react';
import { Stage } from './types';
import { MdAdd, MdDelete } from 'react-icons/md';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';
import { useFeedback } from '@/components/ui/Feedback';
import crm from './crmModals.module.css';
import { LEAD_STAGE_TYPE_LABELS, LEAD_STAGE_TYPES } from '@/lib/utils/crmFunnel';

interface Props {
  stages: Stage[];
  onClose: () => void;
  onRefresh: () => void;
}

export default function StageManagerModal({ stages, onClose, onRefresh }: Props) {
  const [newStageName, setNewStageName] = useState('');
  const [loading, setLoading] = useState(false);
  const { confirm, feedback } = useFeedback();
  const [error, setError] = useState('');

  const call = async (fn: () => Promise<Response>) => {
    setLoading(true);
    setError('');
    try {
      const res = await fn();
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Não foi possível concluir a operação');
        return;
      }
      onRefresh();
    } catch {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  const handleAddStage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStageName.trim()) return;
    await call(() => fetch('/api/crm/stages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newStageName.trim(), order: stages.length, color: 'var(--admin-muted, #6b7280)', type: 'open' }),
    }));
    setNewStageName('');
  };

  const handleSeed = () => call(() => fetch('/api/crm/stages/seed', { method: 'POST' }));

  const handleTypeChange = (id: string, type: string) =>
    call(() => fetch(`/api/crm/stages/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
    }));

  const handleDeleteStage = async (id: string) => {
    const fase = stages.find(st => st.id === id);
    const ok = await confirm({ title: 'Excluir fase', description: <>A fase <strong>{fase?.name}</strong> sai do funil. Não dá para desfazer.</>, confirmLabel: 'Excluir fase', danger: true });
    if (!ok) return;
    await call(() => fetch(`/api/crm/stages/${id}`, { method: 'DELETE' }));
  };

  return (
    <AdminModal title="Gerenciar fases do funil" onClose={onClose} size="md" busy={loading}>
      <div className={modalStyles.stack}>
        <p className={crm.intro}>
          O tipo da fase é o que os relatórios usam para saber o que é proposta, venda e perda.
          Sem marcá-lo, a fase conta apenas como etapa intermediária.
        </p>

        {error && <div className={crm.error} role="alert">{error}</div>}

        <div className={crm.list}>
          {stages.length === 0 ? (
            <div className={crm.emptyBlock}>
              <p className={crm.empty}>Nenhuma fase cadastrada.</p>
              <button type="button" className={modalStyles.primary} onClick={handleSeed} disabled={loading}>
                Criar funil padrão CNV (11 etapas)
              </button>
            </div>
          ) : (
            stages.map((stage, index) => (
              <div key={stage.id} className={crm.row}>
                <span className={crm.stageIndex}>{index + 1}</span>
                <span className={crm.stageDot} style={{ backgroundColor: stage.color || 'var(--admin-border, var(--color-highlight))' }} />
                <span className={crm.stageName}>{stage.name}</span>

                <select
                  aria-label={`Tipo da fase ${stage.name}`}
                  value={stage.type}
                  onChange={(e) => handleTypeChange(stage.id, e.target.value)}
                  disabled={loading}
                  className={crm.stageSelect}
                >
                  {LEAD_STAGE_TYPES.map(type => (
                    <option key={type} value={type}>{LEAD_STAGE_TYPE_LABELS[type]}</option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => handleDeleteStage(stage.id)}
                  className={`${crm.iconButton} ${crm.iconButtonDanger}`}
                  disabled={loading}
                  aria-label={`Excluir fase ${stage.name}`}
                >
                  <MdDelete size={20} aria-hidden="true" />
                </button>
              </div>
            ))
          )}
        </div>

        <form onSubmit={handleAddStage} className={`${modalStyles.field} ${crm.divider}`}>
          <label htmlFor="crm-new-stage">Nova fase</label>
          <div className={crm.inlineForm}>
            <input
              id="crm-new-stage"
              type="text"
              value={newStageName}
              onChange={(e) => setNewStageName(e.target.value)}
              placeholder="Ex: Em negociação"
              className={crm.control}
              disabled={loading}
            />
            <button type="submit" className={modalStyles.primary} disabled={loading || !newStageName.trim()}>
              <MdAdd size={20} aria-hidden="true" />
              Adicionar
            </button>
          </div>
        </form>
      </div>
      {feedback}
    </AdminModal>
  );
}
