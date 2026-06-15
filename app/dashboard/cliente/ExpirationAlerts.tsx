import { useState } from 'react';
import { UpgradeModal } from '../../../components/operator/UpgradeModal';

export function ExpirationAlerts({ userInfo }: { userInfo: any }) {
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const { daysUntilExpiry } = userInfo;

    // Do nothing if they are not approaching expiry or already downgraded to 'gratis'
    if (daysUntilExpiry === undefined || daysUntilExpiry === null) return null;
    if (userInfo.profile === 'gratis' || userInfo.profile === 'administrador') return null;

    // Se estiver faltando até 5 dias (daysUntilExpiry de 1 a 5)
    const isWarningZone = daysUntilExpiry > 0 && daysUntilExpiry <= 5;

    // Venceu: bloqueia imediatamente e mostra QR Code PIX do plano atual.
    const isBlocked = daysUntilExpiry <= 0;

    if (!isWarningZone && !isBlocked) return null;

    return (
        <>
            {/* Banner amarelo de aviso: faltam X dias para vencer */}
            {isWarningZone && (
                <div style={{
                    backgroundColor: '#eab308',
                    color: '#fff',
                    padding: '12px 24px',
                    textAlign: 'center',
                    fontWeight: 600,
                    fontSize: '0.95rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '15px'
                    }}>
                    <span>⚠️ Atenção: Seu plano vencerá em {daysUntilExpiry} {daysUntilExpiry === 1 ? 'dia' : 'dias'}.</span>
                    <button 
                        onClick={() => setShowUpgradeModal(true)}
                        style={{
                            backgroundColor: '#fff', color: '#eab308',
                            border: 'none', borderRadius: '4px', padding: '6px 12px',
                            fontWeight: 'bold', cursor: 'pointer'
                        }}>
                        Gerar PIX
                    </button>
                </div>
            )}

            {(isBlocked || showUpgradeModal) && (
                <UpgradeModal
                    locked={isBlocked}
                    paidOnly
                    pixOnly
                    initialPlanId={userInfo.subscriptionPlanId || undefined}
                    initialBilling={userInfo.subscriptionBillingType === 'annual' ? 'annual' : 'monthly'}
                    title={isBlocked ? 'Assinatura vencida' : 'Renovar com PIX'}
                    subtitle={isBlocked
                        ? 'Sua tela fica bloqueada até a confirmação do pagamento. Escaneie o QR Code PIX para renovar o acesso.'
                        : 'Escaneie o QR Code PIX para renovar seu acesso antes do vencimento.'}
                    onClose={() => {
                        if (!isBlocked) setShowUpgradeModal(false);
                    }}
                />
            )}
        </>
    );
}
