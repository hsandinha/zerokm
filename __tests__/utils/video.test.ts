import { describe, expect, it } from 'vitest';
import { embedDoVideo } from '@/lib/utils/video';

describe('vídeo tutorial', () => {
    it('converte links do YouTube e do Vimeo para o player', () => {
        expect(embedDoVideo('https://www.youtube.com/watch?v=abc123XYZ')?.src).toBe('https://www.youtube.com/embed/abc123XYZ?rel=0');
        expect(embedDoVideo('https://youtu.be/abc123XYZ')?.src).toBe('https://www.youtube.com/embed/abc123XYZ?rel=0');
        expect(embedDoVideo('https://youtube.com/shorts/abc123XYZ')?.src).toBe('https://www.youtube.com/embed/abc123XYZ?rel=0');
        expect(embedDoVideo('https://vimeo.com/123456')?.src).toBe('https://player.vimeo.com/video/123456');
    });

    it('aceita arquivo de vídeo e recusa o resto', () => {
        expect(embedDoVideo('https://cdn.exemplo.com/tutorial.mp4')).toEqual({ tipo: 'arquivo', src: 'https://cdn.exemplo.com/tutorial.mp4' });
        expect(embedDoVideo('http://youtu.be/abc123XYZ')).toBeNull();
        expect(embedDoVideo('https://exemplo.com/pagina')).toBeNull();
        expect(embedDoVideo('')).toBeNull();
    });
});
