// Reduz a foto no navegador antes de enviar: lado maior de até 1600px, em
// JPEG. Foto de celular sai com 4 a 12 MB, acima do que a Vercel aceita no
// corpo da requisição (~4,5 MB) e muito acima do que precisa uma foto que vai
// para o WhatsApp. Reduzida, fica em algumas centenas de KB.
//
// Só roda no cliente (canvas). PNG com transparência ganha fundo branco: o
// JPEG não tem canal alfa e o fundo preto padrão do canvas estragaria a foto.

export const LADO_MAXIMO = 1600;
const QUALIDADES = [0.85, 0.75, 0.65, 0.55];
/** Folga abaixo dos 4 MB do servidor. */
const TETO_BYTES = 3 * 1024 * 1024;

export type FotoReduzida = { blob: Blob; width: number; height: number };

/** Medidas finais mantendo a proporção (pura, para dar para testar). */
export function medidasReduzidas(w: number, h: number, max = LADO_MAXIMO): { width: number; height: number } {
  if (w <= 0 || h <= 0) return { width: 0, height: 0 };
  const escala = Math.min(1, max / Math.max(w, h));
  return { width: Math.round(w * escala), height: Math.round(h * escala) };
}

async function carregar(file: File): Promise<{ fonte: CanvasImageSource; w: number; h: number; fechar: () => void }> {
  // createImageBitmap respeita a orientação do EXIF (foto de celular "deitada").
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { fonte: bmp, w: bmp.width, h: bmp.height, fechar: () => bmp.close() };
    } catch {
      // Navegador sem suporte ao formato: tenta pelo <img>.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, falha) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => falha(new Error("Não deu para abrir esta imagem."));
      i.src = url;
    });
    return { fonte: img, w: img.naturalWidth, h: img.naturalHeight, fechar: () => URL.revokeObjectURL(url) };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

export async function reduzirFoto(file: File): Promise<FotoReduzida> {
  if (!file.type.startsWith("image/")) throw new Error(`"${file.name}" não é uma imagem.`);
  const { fonte, w, h, fechar } = await carregar(file);
  try {
    const { width, height } = medidasReduzidas(w, h);
    if (!width || !height) throw new Error("Imagem sem tamanho.");
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("O navegador não conseguiu preparar a foto.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(fonte, 0, 0, width, height);
    for (const q of QUALIDADES) {
      const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", q));
      if (blob && (blob.size <= TETO_BYTES || q === QUALIDADES[QUALIDADES.length - 1])) {
        if (blob.size > TETO_BYTES) throw new Error(`"${file.name}" continua grande demais depois de reduzida.`);
        return { blob, width, height };
      }
    }
    throw new Error("O navegador não conseguiu gerar o JPEG.");
  } finally {
    fechar();
  }
}
