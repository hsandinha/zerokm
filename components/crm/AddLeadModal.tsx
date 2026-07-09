"use client";

import React, { useState } from 'react';
import { Stage } from './types';
import { MdClose } from 'react-icons/md';

interface Props {
  stages: Stage[];
  onClose: () => void;
  onRefresh: () => void;
}

export default function AddLeadModal({ stages, onClose, onRefresh }: Props) {
  // Criar um lead direto em "Venda Perdida" burlaria o motivo obrigatório; a API também recusa.
  const selectableStages = stages.filter(s => s.type !== 'lost');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [source, setSource] = useState('Manual');
  const [stageId, setStageId] = useState(selectableStages.length > 0 ? selectableStages[0].id : '');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !stageId) return;

    setLoading(true);
    try {
      const response = await fetch('/api/crm/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          source,
          stageId
        }),
      });

      if (response.ok) {
        onRefresh();
        onClose();
      } else {
        const data = await response.json();
        alert(data.error || 'Erro ao criar lead');
      }
    } catch (error) {
      console.error('Error adding lead:', error);
      alert('Erro de conexão ao criar lead');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}>
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-highlight)', width: '100%', maxWidth: '400px', borderRadius: '12px', display: 'flex', flexDirection: 'column', maxHeight: '90vh', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid var(--color-highlight)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--color-text)' }}>Novo Lead</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
            <MdClose size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: '8px' }}>Nome *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-highlight)', color: 'var(--color-text)', borderRadius: '8px', padding: '10px 12px', outline: 'none' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: '8px' }}>Telefone *</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              placeholder="(11) 99999-9999"
              style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-highlight)', color: 'var(--color-text)', borderRadius: '8px', padding: '10px 12px', outline: 'none' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: '8px' }}>E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-highlight)', color: 'var(--color-text)', borderRadius: '8px', padding: '10px 12px', outline: 'none' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: '8px' }}>Fase Inicial</label>
            <select
              value={stageId}
              onChange={(e) => setStageId(e.target.value)}
              required
              style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-highlight)', color: 'var(--color-text)', borderRadius: '8px', padding: '10px 12px', outline: 'none' }}
            >
              <option value="" disabled style={{ color: '#000' }}>Selecione uma fase</option>
              {selectableStages.map((stage) => (
                <option key={stage.id} value={stage.id} style={{ color: '#000' }}>
                  {stage.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ paddingTop: '8px', borderTop: '1px solid var(--color-highlight)', marginTop: '8px' }}>
            <button 
              type="submit" 
              disabled={loading || !name.trim() || !phone.trim() || !stageId}
              style={{ width: '100%', background: 'var(--color-primary)', color: 'var(--color-text)', padding: '10px 16px', borderRadius: '8px', fontWeight: 600, border: 'none', cursor: (loading || !name.trim() || !phone.trim() || !stageId) ? 'not-allowed' : 'pointer', opacity: (loading || !name.trim() || !phone.trim() || !stageId) ? 0.5 : 1 }}
            >
              {loading ? 'Salvando...' : 'Adicionar Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
