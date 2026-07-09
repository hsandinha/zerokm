"use client";

import React, { useState } from 'react';
import { MdClose } from 'react-icons/md';
import { LOST_REASONS } from '@/lib/utils/crmFunnel';
import { Lead } from './types';

interface Props {
  lead: Lead;
  stageName: string;
  onCancel: () => void;
  onConfirm: (reason: string, note: string) => void;
}

/** A perda só é registrada com motivo — é a única movimentação que não pode ser silenciosa. */
export default function LostReasonModal({ lead, stageName, onCancel, onConfirm }: Props) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) return;
    onConfirm(reason, note.trim());
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-highlight)', width: '100%', maxWidth: '420px', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid var(--color-highlight)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 'bold', color: 'var(--color-text)', margin: 0 }}>Por que a venda foi perdida?</h2>
          <button onClick={onCancel} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }} aria-label="Cancelar">
            <MdClose size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
            Movendo <strong style={{ color: 'var(--color-text)' }}>{lead.name}</strong> para <strong style={{ color: 'var(--color-text)' }}>{stageName}</strong>.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {LOST_REASONS.map(({ value, label }) => (
              <label key={value} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${reason === value ? 'var(--color-primary)' : 'var(--color-highlight)'}`, cursor: 'pointer', color: 'var(--color-text)' }}>
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

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: '8px' }}>
              Detalhe (opcional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Ex: fechou com a concorrência por R$ 2 mil a menos"
              style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-highlight)', color: 'var(--color-text)', borderRadius: '8px', padding: '10px 12px', outline: 'none', resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button type="button" onClick={onCancel} style={{ flex: 1, background: 'transparent', color: 'var(--color-text-muted)', padding: '10px 16px', borderRadius: '8px', fontWeight: 600, border: '1px solid var(--color-highlight)', cursor: 'pointer' }}>
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!reason}
              style={{ flex: 1, background: 'var(--color-negative, #DC2626)', color: '#FFFFFF', padding: '10px 16px', borderRadius: '8px', fontWeight: 600, border: 'none', cursor: reason ? 'pointer' : 'not-allowed', opacity: reason ? 1 : 0.5 }}
            >
              Registrar perda
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
