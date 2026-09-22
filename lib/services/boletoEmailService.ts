import Payment from '@/models/Payment';
import { buildBoletoEmail } from '@/lib/email/boletoEmail';
import { sendEmail } from '@/lib/email/sendEmail';

/**
 * Envio do boleto por e-mail, em um lugar só.
 *
 * O cron de renovação e o reenvio manual do admin usam esta função: o cliente
 * que liga dizendo "não recebi" precisa receber exatamente o mesmo e-mail.
 * O id devolvido pelo Resend fica gravado para a tela de Cobranças mostrar se
 * a mensagem foi entregue, caiu em spam ou voltou.
 */
export async function enviarBoletoPorEmail(params: {
    payment: any;
    para: string;
    nomeCliente?: string;
    nomePlano: string;
    vencimento?: Date | null;
}): Promise<{ ok: boolean; id?: string; error?: string; skipped?: boolean }> {
    const { payment, para, nomeCliente, nomePlano, vencimento } = params;

    const conteudo = buildBoletoEmail({
        customerName: nomeCliente,
        planName: nomePlano,
        amount: payment.amount || 0,
        dueDate: vencimento || null,
        boletoUrl: payment.boletoUrl,
        barcode: payment.boletoBarcode,
    });

    const res = await sendEmail({ to: para, subject: conteudo.subject, html: conteudo.html, text: conteudo.text });

    if (res.ok) {
        await Payment.findByIdAndUpdate(payment._id, {
            $set: {
                boletoEmailSentAt: new Date(),
                boletoEmailTo: para,
                boletoEmailId: res.id,
                boletoEmailError: null,
            },
        });
        return { ok: true, id: res.id };
    }

    // Boleto emitido e não entregue é pior que boleto não emitido: o cliente é
    // cobrado sem receber nada. Guardar o motivo deixa isso visível na tela.
    await Payment.findByIdAndUpdate(payment._id, {
        $set: { boletoEmailError: res.error || 'Falha ao enviar e-mail', boletoEmailTo: para },
    });
    return { ok: false, error: res.error, skipped: res.skipped };
}

/**
 * Situação da mensagem no Resend (delivered, bounced, complained, ...).
 * Consultado na hora, porque o Resend é a fonte da verdade da entrega.
 */
export async function consultarStatusEmail(emailId: string): Promise<{ status: string | null; error?: string }> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return { status: null, error: 'RESEND_API_KEY não configurado' };
    try {
        const res = await fetch(`https://api.resend.com/emails/${emailId}`, {
            headers: { Authorization: `Bearer ${apiKey}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return { status: null, error: data?.message || `Resend ${res.status}` };
        return { status: data?.last_event || null };
    } catch (error: any) {
        return { status: null, error: error?.message || 'Falha ao consultar o Resend' };
    }
}
