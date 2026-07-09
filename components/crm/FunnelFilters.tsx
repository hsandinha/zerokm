"use client";

import React from 'react';
import { PERIOD_PRESETS, PeriodPreset } from '@/lib/utils/period';

export interface FilterState {
  preset: PeriodPreset;
  from: string;
  to: string;
  tag: string;
}

interface Props {
  filters: FilterState;
  tags: string[];
  onChange: (next: FilterState) => void;
}

const chipStyle = (active: boolean): React.CSSProperties => ({
  padding: '8px 14px',
  borderRadius: '9999px',
  border: `1px solid ${active ? '#3B82F6' : '#E5E7EB'}`,
  background: active ? '#3B82F6' : '#FFFFFF',
  color: active ? '#FFFFFF' : '#4B5563',
  fontWeight: 600,
  fontSize: '0.875rem',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
});

const dateInput: React.CSSProperties = {
  border: '1px solid #E5E7EB', borderRadius: '8px', padding: '7px 10px',
  color: '#111827', background: '#FFFFFF', fontSize: '0.875rem',
};

export default function FunnelFilters({ filters, tags, onChange }: Props) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
      {PERIOD_PRESETS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange({ ...filters, preset: value })}
          style={chipStyle(filters.preset === value)}
        >
          {label}
        </button>
      ))}

      {filters.preset === 'custom' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="date"
            aria-label="Data inicial"
            value={filters.from}
            onChange={(e) => onChange({ ...filters, from: e.target.value })}
            style={dateInput}
          />
          <span style={{ color: '#6B7280', fontSize: '0.875rem' }}>até</span>
          <input
            type="date"
            aria-label="Data final"
            value={filters.to}
            onChange={(e) => onChange({ ...filters, to: e.target.value })}
            style={dateInput}
          />
        </div>
      )}

      <div style={{ marginLeft: 'auto' }}>
        <select
          aria-label="Filtrar por origem"
          value={filters.tag}
          onChange={(e) => onChange({ ...filters, tag: e.target.value })}
          style={{ ...dateInput, padding: '8px 12px', minWidth: '200px' }}
        >
          <option value="">Todas as origens</option>
          {tags.map(tag => (
            <option key={tag} value={tag}>{tag}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
