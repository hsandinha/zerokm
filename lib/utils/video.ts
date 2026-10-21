/**
 * Endereço para embutir o vídeo tutorial. Aceita YouTube (watch, youtu.be,
 * shorts), Vimeo e arquivo .mp4/.webm direto. Qualquer outra coisa: null.
 */
export function embedDoVideo(url: string): { tipo: 'iframe' | 'arquivo'; src: string } | null {
    const texto = (url || '').trim();
    if (!/^https:\/\//i.test(texto)) return null;

    const youtube = texto.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i);
    if (youtube) return { tipo: 'iframe', src: `https://www.youtube.com/embed/${youtube[1]}?rel=0` };

    const vimeo = texto.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
    if (vimeo) return { tipo: 'iframe', src: `https://player.vimeo.com/video/${vimeo[1]}` };

    if (/\.(mp4|webm)(\?.*)?$/i.test(texto)) return { tipo: 'arquivo', src: texto };
    return null;
}
