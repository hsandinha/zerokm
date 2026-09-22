import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Guarda contra um erro que já aconteceu: usar em botão de texto uma classe
 * feita para ícone.
 *
 * A aba Acessos do CRM usava `.actionBtn`, um círculo de 28px, nos botões
 * "Desativar acesso", "Salvar perfis" e "Excluir usuário definitivamente". O
 * rótulo vazava do botão e passava por cima do conteúdo ao lado. Classe de
 * ícone tem tamanho fixo pequeno; rótulo precisa de `.textBtn` e equivalentes.
 */

const RAIZ = path.resolve(__dirname, '../../components');

function arquivos(dir: string, ext: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) return arquivos(p, ext);
        return e.name.endsWith(ext) ? [p] : [];
    });
}

/** Classes com largura e altura fixas pequenas: cara de botão de ícone. */
function classesDeIcone(cssPath: string): string[] {
    const txt = fs.readFileSync(cssPath, 'utf8');
    const nomes: string[] = [];
    for (const m of txt.matchAll(/\.([a-zA-Z0-9_]+)\s*\{([^}]*)\}/g)) {
        const [, nome, corpo] = m;
        const w = corpo.match(/\bwidth:\s*(\d+)px/);
        const h = corpo.match(/\bheight:\s*(\d+)px/);
        // "icon"/"spinner" no nome são elementos decorativos, não botões.
        if (w && h && Number(w[1]) <= 40 && Number(h[1]) <= 40 && !/icon|spinner|dot|avatar/i.test(nome)) {
            nomes.push(nome);
        }
    }
    return nomes;
}

/**
 * Texto entre o fim da tag de abertura e o próximo elemento.
 *
 * Percorre a tag desde o `<`, respeitando aspas e chaves: `onClick={() => x()}`
 * tem um `>` na seta, e a classe costuma vir dentro de um template literal —
 * começar a leitura no meio disso dava resultado errado nas duas pontas.
 */
function textoDoElemento(txt: string, idxDaClasse: number): string {
    const inicioTag = txt.lastIndexOf('<', idxDaClasse);
    if (inicioTag === -1) return '';
    let i = inicioTag + 1;
    let nivel = 0;
    let aspa: string | null = null;
    while (i < txt.length) {
        const ch = txt[i];
        if (aspa) {
            if (ch === aspa && txt[i - 1] !== '\\') aspa = null;
        } else if (ch === '"' || ch === "'" || ch === '`') {
            aspa = ch;
        } else if (ch === '{') {
            nivel++;
        } else if (ch === '}') {
            nivel--;
        } else if (ch === '>' && nivel === 0) {
            i++;
            break;
        }
        i++;
    }
    const fim = txt.indexOf('<', i);
    return fim === -1 ? '' : txt.slice(i, fim).trim();
}

describe('classes de ícone não recebem rótulo de texto', () => {
    it('nenhum componente coloca texto dentro de botão dimensionado para ícone', () => {
        const problemas: string[] = [];

        for (const tsx of arquivos(RAIZ, '.tsx')) {
            const txt = fs.readFileSync(tsx, 'utf8');
            const imp = txt.match(/import\s+styles\s+from\s+'\.\/([A-Za-z0-9_.]+)\.module\.css'/);
            if (!imp) continue;
            const css = path.join(path.dirname(tsx), `${imp[1]}.module.css`);
            if (!fs.existsSync(css)) continue;

            for (const cls of classesDeIcone(css)) {
                let de = 0;
                for (;;) {
                    const achou = txt.indexOf(`styles.${cls}`, de);
                    if (achou === -1) break;
                    de = achou + cls.length;
                    const texto = textoDoElemento(txt, de);
                    // Expressão JSX ({cond ? '✓' : '⏳'}) costuma render ícone, não rótulo.
                    if (!texto || texto.startsWith('{')) continue;
                    if (/[A-Za-zÀ-ú]{3,}/.test(texto)) {
                        const linha = txt.slice(0, achou).split('\n').length;
                        problemas.push(`${path.relative(RAIZ, tsx)}:${linha} usa .${cls} com o texto "${texto}"`);
                    }
                }
            }
        }

        expect(problemas).toEqual([]);
    });
});
