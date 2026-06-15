type SendEmailParams = {
    to: string;
    subject: string;
    html: string;
    text?: string;
};

export async function sendEmail({ to, subject, html, text }: SendEmailParams): Promise<{ ok: boolean; skipped?: boolean; id?: string; error?: string }> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        console.warn('[email] RESEND_API_KEY não configurado. E-mail não enviado:', { to, subject });
        return { ok: false, skipped: true, error: 'RESEND_API_KEY não configurado' };
    }

    const from = process.env.RESEND_FROM_EMAIL || 'Zero KM <noreply@meuzerokilometro.com.br>';

    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from,
            to,
            subject,
            html,
            ...(text ? { text } : {}),
        }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        console.error('[email] Falha ao enviar e-mail:', { to, subject, status: res.status, response: data });
        return { ok: false, error: data?.message || data?.error || 'Falha ao enviar e-mail' };
    }

    return { ok: true, id: data?.id };
}
