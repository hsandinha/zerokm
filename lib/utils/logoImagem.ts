/** Tamanho máximo da logo já redimensionada (data URL). */
export const LOGO_MAX_CARACTERES = 300_000;

const DATA_URL_IMAGEM = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

/** Valida a logo recebida pela API: só PNG, JPG ou WEBP embutidos e pequenos. */
export function validarLogo(valor: unknown): { ok: true; logo: string } | { ok: false; erro: string } {
    if (typeof valor !== 'string' || !valor.trim()) return { ok: false, erro: 'Envie a imagem da logo.' };
    const logo = valor.trim();
    if (!DATA_URL_IMAGEM.test(logo)) return { ok: false, erro: 'Formato não aceito. Use PNG, JPG ou WEBP.' };
    if (logo.length > LOGO_MAX_CARACTERES) return { ok: false, erro: 'A imagem ficou grande demais. Use uma logo menor.' };
    return { ok: true, logo };
}

/**
 * Redimensiona no navegador antes de enviar: no máximo 600x240, mantendo a
 * proporção e a transparência. Uma logo de 2 MB vira algo entre 10 e 60 KB.
 */
export async function redimensionarLogo(arquivo: File, larguraMax = 600, alturaMax = 240): Promise<string> {
    if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(arquivo.type)) {
        throw new Error('Escolha uma imagem PNG, JPG, WEBP ou SVG.');
    }
    const url = URL.createObjectURL(arquivo);
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image();
            el.onload = () => resolve(el);
            el.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
            el.src = url;
        });
        const largura = img.naturalWidth || larguraMax;
        const altura = img.naturalHeight || alturaMax;
        let escala = Math.min(1, larguraMax / largura, alturaMax / altura);

        for (let tentativa = 0; tentativa < 4; tentativa++) {
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(largura * escala));
            canvas.height = Math.max(1, Math.round(altura * escala));
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Seu navegador não conseguiu processar a imagem.');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            // WEBP guarda transparência e pesa menos; sem suporte, o navegador devolve PNG.
            const dataUrl = canvas.toDataURL('image/webp', 0.9);
            if (dataUrl.length <= LOGO_MAX_CARACTERES) return dataUrl;
            escala *= 0.7;
        }
        throw new Error('A imagem ficou grande demais mesmo reduzida. Use uma logo mais simples.');
    } finally {
        URL.revokeObjectURL(url);
    }
}
