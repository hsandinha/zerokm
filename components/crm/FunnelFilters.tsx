"use client";

import React from 'react';
import { PERIOD_PRESETS, PeriodPreset } from '@/lib/utils/period';
import { FilterSelect, Segmented } from '@/components/ui/Page';
import styles from './Kanban.module.css';

export interface FilterState {
  preset: PeriodPreset;
  from: string;
  to: string;
  tag: string;
  ownerId: string;
}

interface Props {
  filters: FilterState;
  tags: string[];
  owners: { id: string; name: string }[];
  onChange: (next: FilterState) => void;
}

/** Período, responsável e origem. Fica na barra do painel do funil. */
export default function FunnelFilters({ filters, tags, owners, onChange }: Props) {
  return (
    <>
      <Segmented<PeriodPreset>
        label="Período"
        value={filters.preset}
        onChange={preset => onChange({ ...filters, preset })}
        options={PERIOD_PRESETS.map(({ value, label }) => ({ value, label }))}
      />

      {filters.preset === 'custom' && (
        <div className={styles.dateRange}>
          <input type="date" aria-label="Data inicial" value={filters.from} onChange={(e) => onChange({ ...filters, from: e.target.value })} />
          <span>até</span>
          <input type="date" aria-label="Data final" value={filters.to} onChange={(e) => onChange({ ...filters, to: e.target.value })} />
        </div>
      )}

      <FilterSelect
        label="Filtrar por responsável"
        value={filters.ownerId}
        onChange={ownerId => onChange({ ...filters, ownerId })}
        options={[{ value: '', label: 'Todos os vendedores' }, { value: 'none', label: 'Sem responsável' }, ...owners.map(o => ({ value: o.id, label: o.name }))]}
      />
      <FilterSelect
        label="Filtrar por origem"
        value={filters.tag}
        onChange={tag => onChange({ ...filters, tag })}
        options={[{ value: '', label: 'Todas as origens' }, ...tags.map(t => ({ value: t, label: t }))]}
      />
    </>
  );
}
