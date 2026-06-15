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

  const [searchQuery, setSearchQuery] = useState('');

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

    let newStageId = overId;
    const overLead = leads.find((l) => l.id === overId);
    if (overLead) {
      newStageId = overLead.stageId;
    }

    if (activeLead.stageId !== newStageId) {
      setLeads((prev) =>
        prev.map((lead) =>
          lead.id === activeLeadId ? { ...lead, stageId: newStageId } : lead
        )
      );

      try {
        await fetch(`/api/crm/leads/${activeLeadId}/stage`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stageId: newStageId }),
        });
      } catch (error) {
        console.error('Failed to update lead stage:', error);
        fetchData();
      }
    }
  };

  const activeLead = activeId ? leads.find((l) => l.id === activeId) : null;
  const filteredLeads = leads.filter(l => 
      l.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (l.phone && l.phone.includes(searchQuery)) ||
      (l.email && l.email.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  const totalLeads = leads.length;

  if (loading) {
        return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '16rem', color: '#111827' }}>Carregando CRM...</div>;
  }

  return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#F9FAFB', color: '#111827', padding: '32px', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                <div>
                    <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Comercial</h4>
                    <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#111827', marginBottom: '4px' }}>Pipeline de leads</h1>
                    <p style={{ fontSize: '1rem', color: '#6B7280' }}>Acompanhe entrada, contato, follow-up, visitas e propostas em um fluxo único.</p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        onClick={() => setIsModalOpen(true)}
                        style={{ background: '#FFFFFF', color: '#374151', padding: '10px 16px', borderRadius: '8px', fontWeight: 600, border: '1px solid #D1D5DB', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                    >
                        ⚙️ Gerenciar Fases
                    </button>
                    <button
                        onClick={() => setIsAddLeadModalOpen(true)}
                        style={{ background: '#3B82F6', color: '#FFFFFF', padding: '10px 20px', borderRadius: '8px', fontWeight: 600, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                    >
                        ➕ Novo Lead
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', overflowX: 'auto', paddingBottom: '8px' }}>
                {stages.map(stage => {
                const stageLeads = leads.filter(l => l.stageId === stage.id);
                const percentage = totalLeads > 0 ? Math.round((stageLeads.length / totalLeads) * 100) : 0;
                return (
                    <div key={stage.id} style={{ minWidth: '200px', flex: 1, background: '#FFFFFF', borderRadius: '12px', padding: '20px', border: '1px solid #E5E7EB', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: stage.color || '#E5E7EB' }} />
                                <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>{stageLeads.length}</span>
                            </div>
                            <span style={{ fontSize: '0.875rem', color: '#6B7280', fontWeight: 500 }}>{percentage}%</span>
                        </div>
                        <span style={{ fontSize: '1rem', color: '#6B7280', fontWeight: 500 }}>{stage.name}</span>
                    </div>
                );
                })}
                <div style={{ minWidth: '200px', background: '#111827', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.875rem', color: '#9CA3AF', fontWeight: 500 }}>Total</span>
                        <span style={{ fontSize: '0.875rem', color: '#10B981', fontWeight: 600 }}>Conv. 0%</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '1.75rem', fontWeight: 700, color: '#FFFFFF' }}>{totalLeads}</span>
                        <span style={{ fontSize: '1rem', color: '#9CA3AF', fontWeight: 500 }}>Leads ativos</span>
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', background: '#FFFFFF', padding: '12px 20px', borderRadius: '12px', border: '1px solid #E5E7EB', marginBottom: '24px', gap: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <span style={{ color: '#9CA3AF', fontSize: '1.2rem' }}>🔍</span>
                <input 
                    type="text" 
                    placeholder="Pesquisar por nome, contato, interesse ou corretor"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: '1rem', color: '#111827' }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ background: '#F3F4F6', color: '#4B5563', padding: '6px 12px', borderRadius: '9999px', fontSize: '0.875rem', fontWeight: 600 }}>
                        {filteredLeads.length} no quadro
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', flex: 1, overflowX: 'auto', paddingBottom: '16px', gap: '20px' }}>
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
              leads={filteredLeads.filter((l) => l.stageId === stage.id)} 
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
