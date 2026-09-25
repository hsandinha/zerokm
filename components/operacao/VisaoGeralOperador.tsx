'use client';

import { useEffect, useState } from 'react';
import { Building2, CarFront, CircleCheck, Clock } from 'lucide-react';
import { Page, PageHeader, StatCard, StatGrid } from '@/components/ui/Page';
import { InlineNotice } from '@/components/ui/Feedback';

type Metricas = { concessionariasAtivas: number; veiculosEmEstoque: number; veiculosVendidos: number; desatualizadas: number };

/** Indicadores da carteira de concessionárias do operador. */
export function VisaoGeralOperador() {
    const [m, setM] = useState<Metricas | null>(null);
    const [erro, setErro] = useState(false);

    useEffect(() => {
        fetch('/api/operator/metrics')
            .then(res => res.json())
            .then(data => {
                if (!data || data.error) throw new Error();
                setM({
                    concessionariasAtivas: data.concessionariasAtivas || 0,
                    veiculosEmEstoque: data.veiculosEmEstoque || 0,
                    veiculosVendidos: data.veiculosVendidos || 0,
                    desatualizadas: data.desatualizadas || 0,
                });
            })
            .catch(() => setErro(true));
    }, []);

    const n = (v?: number) => (m ? (v ?? 0).toLocaleString('pt-BR') : '-');

    return (
        <Page>
            <PageHeader title="Visão geral" description="Indicadores da sua carteira de concessionárias." />
            {erro && <InlineNotice>Não foi possível carregar os indicadores. Atualize a página.</InlineNotice>}
            <StatGrid>
                <StatCard label="Lojas na carteira" icon={<Building2 size={18} />} value={n(m?.concessionariasAtivas)} caption="Concessionárias ativas" />
                <StatCard label="Estoque somado" icon={<CarFront size={18} />} value={n(m?.veiculosEmEstoque)} caption="Veículos das suas lojas" />
                <StatCard
                    label="Lojas desatualizadas"
                    icon={<Clock size={18} />}
                    value={n(m?.desatualizadas)}
                    tone={m && m.desatualizadas > 0 ? 'warning' : 'default'}
                    caption="Mais de 5 dias sem atualizar"
                />
                <StatCard label="Vendidos ou licenciados" icon={<CircleCheck size={18} />} value={n(m?.veiculosVendidos)} caption="No período" />
            </StatGrid>
        </Page>
    );
}
