"use client";

import React, { useState } from 'react';
import { Stage } from './types';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';
import { InlineNotice } from '@/components/ui/Feedback';
import { MANUAL_LEAD_SOURCES } from '@/lib/utils/leadTags';

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
  const [erro, setErro] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !stageId) return;

    setLoading(true);
    setErro(null);
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
        const data = await response.json().catch(() => ({}));
        setErro(data.error || 'Não foi possível criar o lead.');
      }
    } catch (error) {
      console.error('Error adding lead:', error);
      setErro('Falha de conexão ao criar o lead. Tente de novo.');
    } finally {
      setLoading(false);
    }
  };

  const submitDisabled = loading || !name.trim() || !phone.trim() || !stageId;

  return (
    <AdminModal
      title="Novo lead"
      onClose={onClose}
      size="sm"
      busy={loading}
      onSubmit={handleSubmit}
      footer={
        <button type="submit" className={modalStyles.primary} disabled={submitDisabled}>
          {loading ? 'Salvando...' : 'Adicionar lead'}
        </button>
      }
    >
      <div className={modalStyles.stack}>
        {erro && <InlineNotice>{erro}</InlineNotice>}
        <label className={modalStyles.field}>
          Nome *
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>

        <label className={modalStyles.field}>
          Telefone *
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            placeholder="(11) 99999-9999"
          />
        </label>

        <label className={modalStyles.field}>
          E-mail
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className={modalStyles.field}>
          Origem
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            {MANUAL_LEAD_SOURCES.map(origem => (
              <option key={origem} value={origem}>{origem}</option>
            ))}
          </select>
        </label>

        <label className={modalStyles.field}>
          Fase inicial
          <select value={stageId} onChange={(e) => setStageId(e.target.value)} required>
            <option value="" disabled>Selecione uma fase</option>
            {selectableStages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </AdminModal>
  );
}
