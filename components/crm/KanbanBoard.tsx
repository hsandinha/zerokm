"use client";

import React, { useState, useEffect } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import KanbanColumn from './KanbanColumn';
import LeadCard from './LeadCard';
import StageManagerModal from './StageManagerModal';
import AddLeadModal from './AddLeadModal';

export type Lead = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  source?: string;
  campaign?: string;
  stageId: string;
  notes?: string;
};

export type Stage = {
  id: string;
  name: string;
  order: number;
  color: string;
};

export default function KanbanBoard() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAddLeadModalOpen, setIsAddLeadModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [stagesRes, leadsRes] = await Promise.all([
        fetch('/api/crm/stages'),
        fetch('/api/crm/leads')
      ]);
      const stagesData = await stagesRes.json();
      const leadsData = await leadsRes.json();
      
      setStages(stagesData.data || []);
      setLeads(leadsData.data || []);
    } catch (error) {
      console.error('Error fetching CRM data:', error);
    } finally {
      setLoading(false);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;

    if (!over) return;

    const activeLeadId = active.id as string;
    const overId = over.id as string;

    const activeLead = leads.find((l) => l.id === activeLeadId);
    if (!activeLead) return;

    // Check if dragging over a column directly or another lead
    let newStageId = overId;
    const overLead = leads.find((l) => l.id === overId);
    if (overLead) {
      newStageId = overLead.stageId;
    }

    if (activeLead.stageId !== newStageId) {
      // Optimistic update
      setLeads((prev) =>
        prev.map((lead) =>
          lead.id === activeLeadId ? { ...lead, stageId: newStageId } : lead
        )
      );

      // Persist change
      try {
        await fetch(`/api/crm/leads/${activeLeadId}/stage`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stageId: newStageId }),
        });
      } catch (error) {
        console.error('Failed to update lead stage:', error);
        // Revert on error
        fetchData();
      }
    }
  };

  const activeLead = activeId ? leads.find((l) => l.id === activeId) : null;

  if (loading) {
        return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '16rem', color: 'var(--color-text)' }}>Carregando CRM...</div>;
  }

  return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-surface)', color: 'var(--color-text)', padding: '24px', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Leads</h1>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        onClick={() => setIsAddLeadModalOpen(true)}
                        style={{ background: 'var(--color-primary)', color: 'var(--color-text)', padding: '8px 16px', borderRadius: '6px', fontWeight: 500, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        ➕ Novo Lead
                    </button>
                    <button
                        onClick={() => setIsModalOpen(true)}
                        style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--color-text)', padding: '8px 16px', borderRadius: '6px', fontWeight: 500, border: '1px solid var(--color-highlight)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        ⚙️ Gerenciar Fases
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', flex: 1, overflowX: 'auto', paddingBottom: '16px', gap: '24px' }}>
                <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {stages.map((stage) => (
            <KanbanColumn 
              key={stage.id} 
              stage={stage} 
              leads={leads.filter((l) => l.stageId === stage.id)} 
            />
          ))}

          <DragOverlay>
            {activeLead ? <LeadCard lead={activeLead} isDragging /> : null}
          </DragOverlay>
        </DndContext>
      </div>

      {isModalOpen && (
        <StageManagerModal 
          stages={stages} 
          onClose={() => setIsModalOpen(false)} 
          onRefresh={fetchData} 
        />
      )}

      {isAddLeadModalOpen && (
        <AddLeadModal 
          stages={stages} 
          onClose={() => setIsAddLeadModalOpen(false)} 
          onRefresh={fetchData} 
        />
      )}
    </div>
  );
}
