import { CalendarClock } from 'lucide-react';
import { UpgradeModal } from '../../../components/operator/UpgradeModal';
import { Button, Callout } from '@/components/ui/Page';

type InfoVencimento = {
    profile?: string | null;
    daysUntilExpiry?: number | null;
    subscriptionPlanId?: string | null;
    subscriptionBillingType?: 'monthly' | 'annual' | null;
};

/** Faixa de vencimento: faltam 1 a 5 dias. Venceu (0 ou menos) vira bloqueio. */
function situacao(info: InfoVencimento) {
    const dias = info.daysUntilExpiry;
    if (dias === undefined || dias === null) return null;
    if (info.profile === 'gratis' || info.profile === 'administrador') return null;
    if (dias <= 0) return 'vencido' as const;
    if (dias <= 5) return 'vencendo' as const;
    return null;
}

/** Aviso dentro da consulta enquanto o plano está para vencer. */
export function ExpirationNotice({ userInfo, onRenovar }: { userInfo: InfoVencimento; onRenovar: () => void }) {
    if (situacao(userInfo) !== 'vencendo') return null;
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
    if (!bloqueado && !(renovar && estado === 'vencendo')) return null;

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
