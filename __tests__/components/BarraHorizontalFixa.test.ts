// Quando o espelho da barra horizontal aparece (components/ui/BarraHorizontalFixa).
import { describe, expect, it } from 'vitest';
import { medirBarra } from '@/components/ui/BarraHorizontalFixa';

const janela = { altura: 800, largura: 1400 };
const tabela = { top: 200, bottom: 3000, left: 260, clientWidth: 1100, scrollWidth: 1900 };

describe('barra horizontal fixa', () => {
    it('aparece quando a tabela é mais larga que a tela e o fim dela está abaixo da dobra', () => {
        expect(medirBarra(tabela, janela)).toEqual({ visivel: true, left: 260, width: 1100, conteudo: 1900 });
    });

    it('some quando a barra de verdade já está na tela', () => {
        expect(medirBarra({ ...tabela, bottom: 780 }, janela).visivel).toBe(false);
    });

    it('não aparece sem rolagem horizontal, antes de a tabela entrar na tela ou em tela de toque', () => {
        expect(medirBarra({ ...tabela, scrollWidth: 1100 }, janela).visivel).toBe(false);
        expect(medirBarra({ ...tabela, top: 760 }, janela).visivel).toBe(false);
        expect(medirBarra(tabela, { altura: 800, largura: 600 }).visivel).toBe(false);
    });
});
