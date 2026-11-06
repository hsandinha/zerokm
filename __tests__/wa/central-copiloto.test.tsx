// Copiloto na Central (wa/components/central-copiloto.tsx): a resposta pedida
// numa conversa não pode cair no campo de outra. O compositor não remonta ao
// trocar de conversa, então quem descarta é o próprio hook.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useCopiloto } from '@wa/components/central-copiloto';

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

/** fetch que só responde quando o teste mandar. */
function fetchSegurado() {
    let soltar: (texto: string) => void = () => {};
    const fn = vi.fn(
        () =>
            new Promise((resolve) => {
                soltar = (texto) => resolve({ ok: true, json: async () => ({ texto }) });
            }),
    );
    vi.stubGlobal('fetch', fn);
    return { fn, soltar: (t: string) => soltar(t) };
}

describe('useCopiloto', () => {
    it('descarta a resposta quando a conversa mudou no meio do pedido', async () => {
        const f = fetchSegurado();
        const onError = vi.fn();
        const { result, rerender } = renderHook(({ id }) => useCopiloto(id, onError), { initialProps: { id: 'conv-a' } });

        let resposta: Promise<string | null> = Promise.resolve(null);
        act(() => {
            resposta = result.current.pedir('sugerir');
        });
        expect(f.fn).toHaveBeenCalledWith('/api/wa/conversations/conv-a/copiloto', expect.anything());

        rerender({ id: 'conv-b' });
        await act(async () => {
            f.soltar('Oi, Marina!');
            expect(await resposta).toBeNull();
        });
        expect(onError).not.toHaveBeenCalledWith(expect.any(String));
    });

    it('na mesma conversa, devolve o texto', async () => {
        const f = fetchSegurado();
        const { result } = renderHook(() => useCopiloto('conv-a', () => {}));
        let resposta: Promise<string | null> = Promise.resolve(null);
        act(() => {
            resposta = result.current.pedir('sugerir');
        });
        await act(async () => {
            f.soltar('Oi, Marina!');
            expect(await resposta).toBe('Oi, Marina!');
        });
        expect(result.current.ocupado).toBeNull();
    });
});
