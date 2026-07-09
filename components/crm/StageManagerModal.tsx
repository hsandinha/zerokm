"use client";

import React, { useState } from 'react';
import { Stage } from './types';
import { MdClose, MdAdd, MdDelete } from 'react-icons/md';
import { LEAD_STAGE_TYPE_LABELS, LEAD_STAGE_TYPES } from '@/lib/utils/crmFunnel';

interface Props {
  stages: Stage[];
  onClose: () => void;
  onRefresh: () => void;
}

const selectStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-highlight)',
  color: 'var(--color-text)', borderRadius: '6px', padding: '4px 8px', fontSize: '0.75rem', outline: 'none',
};

export default function StageManagerModal({ stages, onClose, onRefresh }: Props) {
  const [newStageName, setNewStageName] = useState('');
  const [loading, setLoading] = useState(false);
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
      body: JSON.stringify({ name: newStageName.trim(), order: stages.length, color: '#6B7280', type: 'open' }),
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
    if (!confirm('Excluir esta fase? A ação não pode ser desfeita.')) return;
    await call(() => fetch(`/api/crm/stages/${id}`, { method: 'DELETE' }));
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)', padding: '16px' }}>
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-highlight)', width: '100%', maxWidth: '520px', borderRadius: '12px', display: 'flex', flexDirection: 'column', maxHeight: '90vh', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid var(--color-highlight)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--color-text)', margin: 0 }}>Gerenciar Fases do Funil</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }} aria-label="Fechar">
            <MdClose size={24} />
          </button>
        </div>

        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginTop: 0, marginBottom: '16px' }}>
            O tipo da fase é o que os relatórios usam para saber o que é proposta, venda e perda.
            Sem marcá-lo, a fase conta apenas como etapa intermediária.
          </p>

          {error && (
            <div style={{ background: 'rgba(220,38,38,0.12)', border: '1px solid #DC2626', color: '#FCA5A5', padding: '10px 12px', borderRadius: '8px', fontSize: '0.875rem', marginBottom: '16px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
            {stages.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', fontStyle: 'italic' }}>Nenhuma fase cadastrada.</p>
                <button
                  onClick={handleSeed}
                  disabled={loading}
                  style={{ background: 'var(--color-primary)', color: 'var(--color-text)', padding: '10px 16px', borderRadius: '8px', fontWeight: 600, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1 }}
                >
                  Criar funil padrão CNV (11 etapas)
                </button>
              </div>
            ) : (
              stages.map((stage, index) => (
                <div key={stage.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid var(--color-highlight)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                    <span style={{ color: 'var(--color-text-muted)', fontFamily: 'monospace', fontSize: '0.875rem' }}>{index + 1}</span>
                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: stage.color || '#E5E7EB', flexShrink: 0 }} />
                    <span style={{ color: 'var(--color-text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stage.name}</span>
                  </div>

                  <select
                    aria-label={`Tipo da fase ${stage.name}`}
                    value={stage.type}
                    onChange={(e) => handleTypeChange(stage.id, e.target.value)}
                    disabled={loading}
                    style={selectStyle}
                  >
                    {LEAD_STAGE_TYPES.map(type => (
                      <option key={type} value={type} style={{ color: '#000' }}>{LEAD_STAGE_TYPE_LABELS[type]}</option>
                    ))}
                  </select>

                  <button
                    onClick={() => handleDeleteStage(stage.id)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--color-negative, #DC2626)', cursor: 'pointer', padding: '4px' }}
                    disabled={loading}
                    aria-label={`Excluir fase ${stage.name}`}
                  >
                    <MdDelete size={20} />
                  </button>
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleAddStage} style={{ paddingTop: '16px', borderTop: '1px solid var(--color-highlight)' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: '8px' }}>Nova Fase</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                placeholder="Ex: Em Negociação"
                style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-highlight)', color: 'var(--color-text)', borderRadius: '8px', padding: '8px 12px', outline: 'none' }}
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !newStageName.trim()}
                style={{ background: 'var(--color-primary)', color: 'var(--color-text)', padding: '8px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 500, border: 'none', cursor: (loading || !newStageName.trim()) ? 'not-allowed' : 'pointer', opacity: (loading || !newStageName.trim()) ? 0.5 : 1 }}
              >
                <MdAdd size={20} />
                Adicionar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
