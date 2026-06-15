type BoletoEmailParams = {
    customerName?: string;
    planName: string;
    amount: number;
    dueDate?: Date | null;
    boletoUrl?: string | null;
    barcode?: string | null;
};

function formatCurrency(value: number): string {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value?: Date | null): string {
    if (!value) return 'data informada no boleto';
    return value.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
}

export function buildBoletoEmail({ customerName, planName, amount, dueDate, boletoUrl, barcode }: BoletoEmailParams) {
    const name = customerName?.trim() || 'cliente';
    const due = formatDate(dueDate);
    const amountLabel = formatCurrency(amount);
    const subject = `Seu boleto Zero KM vence em ${due}`;
    const text = [
        `Olá, ${name}.`,
        `Geramos o boleto de renovação do plano ${planName}, no valor de ${amountLabel}.`,
        `Vencimento: ${due}.`,
        boletoUrl ? `Acesse o boleto: ${boletoUrl}` : '',
        barcode ? `Linha digitável/código: ${barcode}` : '',
        'Após a compensação, seu acesso é renovado automaticamente.',
    ].filter(Boolean).join('\n');

    const html = `
        <div style="font-family:Arial,sans-serif;background:#f6f8fb;padding:24px;color:#111827">
            <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px;border:1px solid #e5e7eb">
                <h1 style="font-size:20px;margin:0 0 12px;color:#111827">Boleto de renovação Zero KM</h1>
                <p style="font-size:15px;line-height:1.5;margin:0 0 16px">Olá, ${name}.</p>
                <p style="font-size:15px;line-height:1.5;margin:0 0 16px">
                    Geramos o boleto de renovação do plano <strong>${planName}</strong>.
                </p>
                <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:18px 0">
                    <p style="margin:0 0 8px;font-size:14px;color:#4b5563">Valor</p>
                    <p style="margin:0 0 14px;font-size:22px;font-weight:700;color:#111827">${amountLabel}</p>
                    <p style="margin:0 0 8px;font-size:14px;color:#4b5563">Vencimento</p>
                    <p style="margin:0;font-size:16px;font-weight:700;color:#111827">${due}</p>
                </div>
                ${boletoUrl ? `
                    <p style="margin:20px 0">
                        <a href="${boletoUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:700">
                            Abrir boleto
                        </a>
                    </p>
                ` : ''}
                ${barcode ? `
                    <p style="font-size:13px;color:#4b5563;margin:18px 0 6px">Linha digitável/código:</p>
                    <p style="font-size:13px;word-break:break-all;background:#f3f4f6;border-radius:6px;padding:10px;margin:0">${barcode}</p>
                ` : ''}
                <p style="font-size:13px;color:#6b7280;line-height:1.5;margin:18px 0 0">
                    Após a compensação do boleto pelo Mercado Pago, seu acesso é renovado automaticamente.
                </p>
            </div>
        </div>
    `;

    return { subject, text, html };
}
