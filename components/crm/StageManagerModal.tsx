"use client";

import React, { useState } from 'react';
import { Stage } from './KanbanBoard';
import { MdClose, MdAdd, MdDelete } from 'react-icons/md';

interface Props {
  stages: Stage[];
  onClose: () => void;
  onRefresh: () => void;
}

export default function StageManagerModal({ stages, onClose, onRefresh }: Props) {
  const [newStageName, setNewStageName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAddStage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStageName.trim()) return;

    setLoading(true);
    try {
      await fetch('/api/crm/stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newStageName.trim(),
          order: stages.length, // Put at the end
          color: '#ef4444' // Default to red-500 from tailwind, or pick random
        }),
      });
      setNewStageName('');
      onRefresh();
    } catch (error) {
      console.error('Error adding stage:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStage = async (id: string) => {
    if (!confirm('Tem certeza? Isso pode causar problemas se houver leads nesta fase.')) return;

    setLoading(true);
    try {
      await fetch(`/api/crm/stages/${id}`, {
        method: 'DELETE',
      });
      onRefresh();
    } catch (error) {
      console.error('Error deleting stage:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}>
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-highlight)', width: '100%', maxWidth: '400px', borderRadius: '12px', display: 'flex', flexDirection: 'column', maxHeight: '90vh', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid var(--color-highlight)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--color-text)' }}>Gerenciar Fases do Funil</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
            <MdClose size={24} />
          </button>
        </div>

        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
            {stages.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', fontStyle: 'italic' }}>Nenhuma fase cadastrada.</p>
            ) : (
              stages.map((stage, index) => (
                <div key={stage.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid var(--color-highlight)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ color: 'var(--color-text-muted)', fontFamily: 'monospace', fontSize: '0.875rem' }}>{index + 1}</span>
                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: stage.color || '#E5E7EB' }}></div>
                    <span style={{ color: 'var(--color-text)', fontWeight: 500 }}>{stage.name}</span>
                  </div>
                  <button 
                    onClick={() => handleDeleteStage(stage.id)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--color-negative)', cursor: 'pointer', padding: '4px' }}
                    disabled={loading}
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
