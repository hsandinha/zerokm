import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { lerConfigSistema, salvarConfigSistema } from '@/lib/services/configSistema';
import { embedDoVideo } from '@/lib/utils/video';

export const dynamic = 'force-dynamic';

/** GET /api/config/sistema — qualquer usuário logado (o cliente lê o vídeo tutorial). */
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
        return NextResponse.json(await lerConfigSistema());
    } catch (error: any) {
        console.error('[config/sistema] GET', error);
        return NextResponse.json({ error: 'Erro ao ler configurações' }, { status: 500 });
    }
}

/** PATCH /api/config/sistema — administração. */
export async function PATCH(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session || !['admin', 'administrador', 'gerente'].includes(session.user?.profile as string)) {
        return NextResponse.json({ error: 'Sem permissão para alterar configurações' }, { status: 403 });
    }
    try {
        const body = await request.json().catch(() => ({}));
        const parcial: Record<string, unknown> = {};
        if (typeof body.videoTutorialUrl === 'string') {
            const url = body.videoTutorialUrl.trim();
            if (url && !embedDoVideo(url)) {
                return NextResponse.json({ error: 'Link de vídeo não reconhecido. Use YouTube, Vimeo ou um arquivo .mp4.' }, { status: 400 });
            }
            parcial.videoTutorialUrl = url;
        }
        if (body.diasEstoqueDesatualizado !== undefined) {
            const dias = Number(body.diasEstoqueDesatualizado);
            if (!Number.isInteger(dias) || dias < 1 || dias > 60) {
                return NextResponse.json({ error: 'Os dias para o aviso de estoque vão de 1 a 60.' }, { status: 400 });
            }
            parcial.diasEstoqueDesatualizado = dias;
        }
        if (typeof body.lembreteEstoqueWhatsApp === 'boolean') parcial.lembreteEstoqueWhatsApp = body.lembreteEstoqueWhatsApp;
        return NextResponse.json(await salvarConfigSistema(parcial));
    } catch (error: any) {
        console.error('[config/sistema] PATCH', error);
        return NextResponse.json({ error: 'Erro ao salvar configurações' }, { status: 500 });
    }
}
