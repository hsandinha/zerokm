"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import KanbanColumn from './KanbanColumn';
import LeadCard from './LeadCard';
import StageManagerModal from './StageManagerModal';
import AddLeadModal from './AddLeadModal';
import LostReasonModal from './LostReasonModal';
import LeadDetailModal from './LeadDetailModal';
import FunnelFilters, { FilterState } from './FunnelFilters';
import RadarCards from './RadarCards';
import ReportsPanel from './ReportsPanel';
import { Lead, Owner, ReportData, Stage } from './types';
import styles from './Kanban.module.css';

export type { Lead, Stage } from './types';

type View = 'funil' | 'relatorios' | 'lixeira';

const INITIAL_FILTERS: FilterState = { preset: 'all', from: '', to: '', tag: '', ownerId: '' };

function buildQuery(filters: FilterState) {
  const params = new URLSearchParams({ preset: filters.preset });
  if (filters.preset === 'custom') {
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
  }
  if (filters.tag) params.set('tags', filters.tag);
  if (filters.ownerId) params.set('ownerId', filters.ownerId);
  return params.toString();
}

const toggleButton = (active: boolean): React.CSSProperties => ({
  padding: '8px 16px', borderRadius: '8px', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer',
  border: '1px solid #D1D5DB', background: active ? '#111827' : '#FFFFFF', color: active ? '#FFFFFF' : '#374151',
});

export default function KanbanBoard() {
  const [view, setView] = useState<View>('funil');
  const [stages, setStages] = useState<Stage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [report, setReport] = useState<ReportData | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [trashed, setTrashed] = useState<Lead[]>([]);

  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [searchQuery, setSearchQuery] = useState('');

  const [activeId, setActiveId] = useState<string | null>(null);
  const [isStageModalOpen, setIsStageModalOpen] = useState(false);
  const [isAddLeadModalOpen, setIsAddLeadModalOpen] = useState(false);
  const [detailLeadId, setDetailLeadId] = useState<string | null>(null);
  const [pendingLoss, setPendingLoss] = useState<{ lead: Lead; stage: Stage } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const query = buildQuery(filters);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [stagesRes, leadsRes, reportRes, tagsRes, ownersRes, trashRes] = await Promise.all([
        fetch('/api/crm/stages'),
        fetch(`/api/crm/leads?${query}`),
        fetch(`/api/crm/reports?${query}`),
        fetch('/api/crm/tags'),
        fetch('/api/crm/owners'),
        fetch(`/api/crm/leads?${query}&trash=true`),
      ]);

      if (!stagesRes.ok || !leadsRes.ok) throw new Error('Não foi possível carregar o funil');

      const [stagesData, leadsData, reportData, tagsData, ownersData, trashData] = await Promise.all([
        stagesRes.json(),
        leadsRes.json(),
        reportRes.ok ? reportRes.json() : Promise.resolve({ data: null }),
        tagsRes.ok ? tagsRes.json() : Promise.resolve({ data: [] }),
        ownersRes.ok ? ownersRes.json() : Promise.resolve({ data: [] }),
        trashRes.ok ? trashRes.json() : Promise.resolve({ data: [] }),
      ]);

      setStages(stagesData.data || []);
      setLeads(leadsData.data || []);
      setReport(reportData.data || null);
      setTags(tagsData.data || []);
      setOwners(ownersData.data || []);
      setTrashed(trashData.data || []);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar o CRM');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // No touch, long-press para arrastar — deixa o scroll com o dedo livre
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const moveLead = async (leadId: string, stageId: string, body: Record<string, any> = {}) => {
    const previous = leads;
    setLeads(prev => prev.map(l => (l.id === leadId ? { ...l, stageId } : l)));

    try {
      const res = await fetch(`/api/crm/leads/${leadId}/stage`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId, ...body }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Falha ao mover o lead (${res.status})`);
      }
      // A movimentação muda o radar e os relatórios: recarrega os números.
      fetchData();
    } catch (err: any) {
      setLeads(previous);
      setError(err.message);
    }
  };

  /** Lixeira: some do quadro sem perder histórico. `ativo` volta a true ao restaurar. */
  const setLeadAtivo = async (leadId: string, ativo: boolean) => {
    try {
      const res = await fetch(`/api/crm/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Falha ao atualizar o lead');
      }
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const excluirDefinitivo = async (lead: Lead) => {
    if (!confirm(`Excluir "${lead.name}" definitivamente? O histórico e as tarefas vão junto.`)) return;
    try {
      const res = await fetch(`/api/crm/leads/${lead.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Falha ao excluir o lead');
      }
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDragStart = (event: DragStartEvent) => setActiveId(event.active.id as string);

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const activeLeadId = active.id as string;
    const activeLead = leads.find(l => l.id === activeLeadId);
    if (!activeLead) return;

    const overLead = leads.find(l => l.id === over.id);
    const newStageId = overLead ? overLead.stageId : (over.id as string);
    if (activeLead.stageId === newStageId) return;

    const targetStage = stages.find(s => s.id === newStageId);
    if (!targetStage) return;

    // Perda exige motivo: o card só se move depois que o motivo é escolhido.
    if (targetStage.type === 'lost') {
      setPendingLoss({ lead: activeLead, stage: targetStage });
      return;
    }

    await moveLead(activeLeadId, newStageId);
  };

  const activeLead = activeId ? leads.find(l => l.id === activeId) : null;

  const filteredLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter(l =>
      l.name.toLowerCase().includes(q) ||
      (l.phone && l.phone.includes(q)) ||
      (l.email && l.email.toLowerCase().includes(q)) ||
      (l.ownerName && l.ownerName.toLowerCase().includes(q)) ||
      l.tags.some(t => t.toLowerCase().includes(q)),
    );
  }, [leads, searchQuery]);

  if (loading && stages.length === 0 && !error) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '16rem', color: '#111827' }}>Carregando CRM...</div>;
  }

  return (
    <div className={styles.board} style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#F9FAFB', color: '#111827', borderRadius: '8px' }}>
      <div className={styles.header}>
        <div>
          <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Comercial</h4>
          <h1 className={styles.title} style={{ fontWeight: 'bold', color: '#111827', marginBottom: '4px', marginTop: 0 }}>Pipeline de leads</h1>
          <p style={{ fontSize: '1rem', color: '#6B7280', margin: 0 }}>Acompanhe entrada, contato, follow-up, propostas e vendas em um fluxo único.</p>
        </div>
        <div className={styles.actions}>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button onClick={() => setView('funil')} style={toggleButton(view === 'funil')}>Funil</button>
            <button onClick={() => setView('relatorios')} style={toggleButton(view === 'relatorios')}>Relatórios</button>
            <button onClick={() => setView('lixeira')} style={toggleButton(view === 'lixeira')}>
              🗑️ Lixeira{trashed.length > 0 ? ` (${trashed.length})` : ''}
            </button>
          </div>
          <button
            onClick={() => setIsStageModalOpen(true)}
            style={{ background: '#FFFFFF', color: '#374151', padding: '10px 16px', borderRadius: '8px', fontWeight: 600, border: '1px solid #D1D5DB', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
          >
            ⚙️ Gerenciar Fases
          </button>
          <button
            onClick={() => setIsAddLeadModalOpen(true)}
            disabled={stages.length === 0}
            style={{ background: '#3B82F6', color: '#FFFFFF', padding: '10px 20px', borderRadius: '8px', fontWeight: 600, border: 'none', cursor: stages.length === 0 ? 'not-allowed' : 'pointer', opacity: stages.length === 0 ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
          >
            ➕ Novo Lead
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
          <span>{error}</span>
          <button onClick={() => setError('')} style={{ background: 'transparent', border: 'none', color: '#B91C1C', cursor: 'pointer', fontWeight: 700 }}>✕</button>
        </div>
      )}

      <FunnelFilters filters={filters} tags={tags} owners={owners} onChange={setFilters} />

      <RadarCards report={report} loading={loading && !report} />

      {view === 'relatorios' ? (
        <ReportsPanel report={report} loading={loading && !report} />
      ) : view === 'lixeira' ? (
        <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '20px' }}>
          <h2 style={{ margin: '0 0 4px', fontSize: '1.1rem', color: '#111827' }}>Lixeira</h2>
          <p style={{ margin: '0 0 16px', color: '#6B7280', fontSize: '0.875rem' }}>
            Leads removidos do quadro. O histórico fica guardado até a exclusão definitiva.
          </p>
          {trashed.length === 0 ? (
            <p style={{ color: '#9CA3AF', margin: 0 }}>A lixeira está vazia.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {trashed.map(lead => (
                <li
                  key={lead.id}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', border: '1px solid #E5E7EB', borderRadius: '10px', padding: '12px 16px' }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <strong style={{ color: '#111827' }}>{lead.name}</strong>
                    <div style={{ color: '#6B7280', fontSize: '0.85rem' }}>
                      {lead.phone}{lead.ownerName ? ` · ${lead.ownerName}` : ''}
                      {lead.tags.length ? ` · ${lead.tags.join(', ')}` : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => setLeadAtivo(lead.id, true)}
                    style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #3B82F6', background: '#FFFFFF', color: '#1D4ED8', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Restaurar
                  </button>
                  <button
                    onClick={() => excluirDefinitivo(lead)}
                    style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#B91C1C', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Excluir definitivamente
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : stages.length === 0 ? (
        <div style={{ background: '#FFFFFF', border: '1px dashed #D1D5DB', borderRadius: '12px', padding: '48px 24px', textAlign: 'center' }}>
          <p style={{ color: '#6B7280', marginTop: 0 }}>Seu funil ainda não tem fases.</p>
          <button onClick={() => setIsStageModalOpen(true)} style={{ background: '#3B82F6', color: '#FFFFFF', padding: '10px 20px', borderRadius: '8px', fontWeight: 600, border: 'none', cursor: 'pointer' }}>
            Configurar fases
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', background: '#FFFFFF', padding: '12px 20px', borderRadius: '12px', border: '1px solid #E5E7EB', marginBottom: '24px', gap: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <span style={{ color: '#9CA3AF', fontSize: '1.2rem' }}>🔍</span>
            <input
              type="text"
              placeholder="Pesquisar por nome, contato, origem ou responsável"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: '1rem', color: '#111827' }}
            />
            <div style={{ background: '#F3F4F6', color: '#4B5563', padding: '6px 12px', borderRadius: '9999px', fontSize: '0.875rem', fontWeight: 600 }}>
              {filteredLeads.length} no quadro
            </div>
          </div>

          <div className={styles.columns} style={{ display: 'flex', flex: 1, overflowX: 'auto', paddingBottom: '16px', gap: '20px' }}>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              {stages.map(stage => (
                <KanbanColumn
                  key={stage.id}
                  stage={stage}
                  leads={filteredLeads.filter(l => l.stageId === stage.id)}
                  onOpenLead={setDetailLeadId}
                />
              ))}

              <DragOverlay>
                {activeLead ? <LeadCard lead={activeLead} isDragging /> : null}
              </DragOverlay>
            </DndContext>
          </div>
        </>
      )}

      {isStageModalOpen && (
        <StageManagerModal stages={stages} onClose={() => setIsStageModalOpen(false)} onRefresh={fetchData} />
      )}

      {isAddLeadModalOpen && (
        <AddLeadModal stages={stages} onClose={() => setIsAddLeadModalOpen(false)} onRefresh={fetchData} />
      )}

      {pendingLoss && (
        <LostReasonModal
          lead={pendingLoss.lead}
          stageName={pendingLoss.stage.name}
          onCancel={() => setPendingLoss(null)}
          onConfirm={async (lostReason, lostReasonNote) => {
            const { lead, stage } = pendingLoss;
            setPendingLoss(null);
            await moveLead(lead.id, stage.id, { lostReason, lostReasonNote });
          }}
        />
      )}

      {detailLeadId && (
        <LeadDetailModal
          leadId={detailLeadId}
          onClose={() => setDetailLeadId(null)}
          onSaved={fetchData}
        />
      )}
    </div>
  );
}
