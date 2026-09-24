"use client";

import React, { useState } from 'react';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';
import { LOST_REASONS } from '@/lib/utils/crmFunnel';
import { Lead } from './types';
import crm from './crmModals.module.css';

interface Props {
  lead: Lead;
  stageName: string;
  onCancel: () => void;
  onConfirm: (reason: string, note: string) => void;
}

/** A perda só é registrada com motivo: é a única movimentação que não pode ser silenciosa. */
export default function LostReasonModal({ lead, stageName, onCancel, onConfirm }: Props) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) return;
    onConfirm(reason, note.trim());
  };

  return (
    <AdminModal
      title="Por que a venda foi perdida?"
      subtitle={<>Movendo <strong>{lead.name}</strong> para <strong>{stageName}</strong>.</>}
      onClose={onCancel}
      size="sm"
      onSubmit={handleSubmit}
      footer={<>
        <button type="button" className={modalStyles.secondary} onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className={modalStyles.danger} disabled={!reason}>
          Registrar perda
        </button>
      </>}
    >
      <div className={modalStyles.stack}>
        <fieldset className={modalStyles.group}>
          <legend className={modalStyles.groupLabel}>Motivo</legend>
          <div className={`${modalStyles.choices} ${crm.reasons}`}>
            {LOST_REASONS.map(({ value, label }) => (
              <label key={value} className={modalStyles.choice}>
                <input
                  type="radio"
                  name="lostReason"
                  value={value}
                  checked={reason === value}
                  onChange={() => setReason(value)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <label className={modalStyles.field}>
          Detalhe (opcional)
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Ex: fechou com a concorrência por R$ 2 mil a menos"
          />
        </label>
      </div>
    </AdminModal>
  );
}
