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
import { ArchiveRestore, Inbox, Plus, Settings2, Trash2 } from 'lucide-react';
import {
  Button, EmptyState, Page, PageHeader, Panel, PanelFooter, PanelToolbar, SearchField, Segmented, pageStyles,
} from '@/components/ui/Page';
import { InlineNotice, useFeedback } from '@/components/ui/Feedback';

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
  const { confirm, notify, feedback } = useFeedback();

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
    const ok = await confirm({
      title: 'Excluir lead de vez',
      description: <>O lead <strong>{lead.name}</strong> sai da lixeira junto com o histórico e as tarefas. Não dá para desfazer.</>,
      confirmLabel: 'Excluir de vez',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/crm/leads/${lead.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Falha ao excluir o lead');
      }
      notify('Lead excluído.', 'positive');
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

  const carregando = loading && stages.length === 0 && !error;

  return (
    <Page wide>
      <PageHeader
        title="Leads"
        count={carregando ? null : leads.length}
        description="Entrada, contato, follow-up, proposta e venda em um fluxo só. Arraste o card pela alça para mudar de fase."
        actions={<>
          <Button icon={<Settings2 size={16} aria-hidden="true" />} onClick={() => setIsStageModalOpen(true)}>Fases</Button>
          <Button variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={() => setIsAddLeadModalOpen(true)} disabled={stages.length === 0}>Novo lead</Button>
        </>}
      />

      {error && (
        <InlineNotice>{error}</InlineNotice>
      )}

      <RadarCards report={report} loading={loading && !report} />

      <Panel className={pageStyles.panelVisible}>
        <PanelToolbar>
          <Segmented<View>
            label="Visualização"
            value={view}
            onChange={setView}
            options={[
              { value: 'funil', label: 'Funil', count: filteredLeads.length },
              { value: 'relatorios', label: 'Relatórios' },
              { value: 'lixeira', label: 'Lixeira', count: trashed.length },
            ]}
          />
          {view === 'funil' && <SearchField value={searchQuery} onChange={setSearchQuery} placeholder="Nome, contato, origem ou responsável" />}
        </PanelToolbar>
        <div className={pageStyles.toolbarSecondary}>
          <FunnelFilters filters={filters} tags={tags} owners={owners} onChange={setFilters} />
        </div>
      </Panel>

      {view === 'relatorios' ? (
        <ReportsPanel report={report} loading={loading && !report} />
      ) : view === 'lixeira' ? (
        <Panel>
          <div className={pageStyles.panelHead}>
            <h2 className={pageStyles.panelTitle}>Lixeira</h2>
            <p className={pageStyles.panelDescription}>Leads tirados do quadro. O histórico fica guardado até a exclusão definitiva.</p>
          </div>
          {trashed.length === 0 ? (
            <EmptyState icon={<Trash2 size={20} />} title="Lixeira vazia" description="Leads removidos do quadro aparecem aqui." />
          ) : (
            <ul className={styles.trashList}>
              {trashed.map(lead => (
                <li key={lead.id} className={styles.trashItem}>
                  <div className={styles.trashInfo}>
                    <strong>{lead.name}</strong>
                    <span>{[lead.phone, lead.ownerName, lead.tags.join(', ')].filter(Boolean).join(' · ')}</span>
                  </div>
                  <Button icon={<ArchiveRestore size={15} aria-hidden="true" />} onClick={() => setLeadAtivo(lead.id, true)}>Restaurar</Button>
                  <Button variant="danger" onClick={() => excluirDefinitivo(lead)}>Excluir de vez</Button>
                </li>
              ))}
            </ul>
          )}
          {trashed.length > 0 && <PanelFooter>{trashed.length} {trashed.length === 1 ? 'lead na lixeira' : 'leads na lixeira'}</PanelFooter>}
        </Panel>
      ) : carregando ? (
        <Panel><EmptyState icon={<Inbox size={20} />} title="Carregando o funil" description="Buscando fases e leads." /></Panel>
      ) : stages.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Settings2 size={20} />}
            title="O funil ainda não tem fases"
            description="Crie as fases (entrada, contato, proposta, venda) para começar a mover os leads."
            action={<Button variant="primary" onClick={() => setIsStageModalOpen(true)}>Configurar fases</Button>}
          />
        </Panel>
      ) : (
        <div className={styles.columns}>
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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
      {feedback}
    </Page>
  );
}
