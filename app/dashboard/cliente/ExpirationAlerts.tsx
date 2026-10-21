import { CalendarClock } from 'lucide-react';
import { UpgradeModal } from '../../../components/operator/UpgradeModal';
import { Button, Callout } from '@/components/ui/Page';
import { acessoBloqueado, emTolerancia } from '@/lib/utils/acessoAssinatura';

type InfoVencimento = {
    profile?: string | null;
    daysUntilExpiry?: number | null;
    subscriptionPlanId?: string | null;
    subscriptionExpiresAt?: string | null;
    subscriptionBillingType?: 'monthly' | 'annual' | null;
};

/**
 * Faixa de vencimento: faltam 1 a 5 dias, ou venceu hoje (ainda com acesso).
 * O bloqueio só vem no dia seguinte ao vencimento (lib/utils/acessoAssinatura.ts).
 */
function situacao(info: InfoVencimento) {
    if (info.profile === 'gratis' || info.profile === 'administrador') return null;
    if (info.subscriptionExpiresAt) {
        if (acessoBloqueado(info.subscriptionExpiresAt)) return 'vencido' as const;
        if (emTolerancia(info.subscriptionExpiresAt)) return 'tolerancia' as const;
    }
    const dias = info.daysUntilExpiry;
    if (dias === undefined || dias === null) return null;
    // Sem a data exata (sessão antiga), cai na regra anterior.
    if (!info.subscriptionExpiresAt && dias <= 0) return 'vencido' as const;
    if (dias > 0 && dias <= 5) return 'vencendo' as const;
    return null;
}

/** Aviso dentro da consulta enquanto o plano está para vencer ou venceu hoje. */
export function ExpirationNotice({ userInfo, onRenovar }: { userInfo: InfoVencimento; onRenovar: () => void }) {
    const estado = situacao(userInfo);
    if (estado === 'tolerancia') {
        return (
            <Callout
                tone="negative"
                icon={<CalendarClock size={18} aria-hidden="true" />}
                title="Seu plano venceu hoje"
                action={<Button variant="primary" onClick={onRenovar}>Renovar com PIX</Button>}
            >
                O acesso continua liberado até o fim do dia. Se já pagou o boleto, pode desconsiderar: a baixa chega sozinha.
            </Callout>
        );
    }
    if (estado !== 'vencendo') return null;
    const dias = userInfo.daysUntilExpiry as number;
    return (
        <Callout
            tone="warning"
            icon={<CalendarClock size={18} aria-hidden="true" />}
            title={`Seu plano vence em ${dias} ${dias === 1 ? 'dia' : 'dias'}`}
            action={<Button variant="primary" onClick={onRenovar}>Renovar com PIX</Button>}
        >
            Renove agora para não perder o acesso ao estoque e aos contatos das concessionárias.
        </Callout>
    );
}

/**
 * Modal de renovação: abre sozinho e trava a tela quando o plano venceu, ou
 * quando o cliente pede para renovar pelo aviso.
 */
export function ExpirationAlerts({ userInfo, renovar = false, onFecharRenovacao }: {
    userInfo: InfoVencimento;
    renovar?: boolean;
    onFecharRenovacao?: () => void;
}) {
    const estado = situacao(userInfo);
    const bloqueado = estado === 'vencido';
    if (!bloqueado && !(renovar && (estado === 'vencendo' || estado === 'tolerancia'))) return null;

    return (
        <UpgradeModal
            locked={bloqueado}
            paidOnly
            pixOnly
            initialPlanId={userInfo.subscriptionPlanId || undefined}
            initialBilling={userInfo.subscriptionBillingType === 'annual' ? 'annual' : 'monthly'}
            title={bloqueado ? 'Assinatura vencida' : 'Renovar com PIX'}
            subtitle={bloqueado
                ? 'Sua tela fica bloqueada até a confirmação do pagamento. Escaneie o QR Code PIX para renovar o acesso.'
                : 'Escaneie o QR Code PIX para renovar seu acesso antes do vencimento.'}
            onClose={() => { if (!bloqueado) onFecharRenovacao?.(); }}
        />
    );
}
