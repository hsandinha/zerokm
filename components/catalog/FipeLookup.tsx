'use client';
import { useCallback, useId, useRef, useState } from 'react';
import type { FipeDetail, FipeOption } from '@/lib/services/fipeService';
import styles from './FipeLookup.module.css';

export const normalizeSearch = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const fipeTypeFor = (tipo?: string) => tipo === 'moto' ? 'motorcycles' : tipo === 'caminhao' ? 'trucks' : 'cars';
const MAX_VISIBLE = 60;

/**
 * Campo de texto livre com sugestões. Digitar nunca bloqueia o cadastro manual:
 * as sugestões só ajudam a escolher o nome padronizado da FIPE.
 */
export function AutocompleteField({ label, value, options, onText, onPick, onOpen, placeholder, loading, emptyText, className }: {
    label: string; value: string; options: FipeOption[]; onText: (text: string) => void; onPick: (option: FipeOption) => void;
    onOpen?: () => void; placeholder?: string; loading?: boolean; emptyText?: string; className?: string;
}) {
    const id = useId(); const [open, setOpen] = useState(false); const [active, setActive] = useState(0);
    const query = normalizeSearch(value);
    const matches = options.filter(option => normalizeSearch(option.name).includes(query));
    // Com texto idêntico a uma opção (já escolhida), mostra a lista inteira para permitir trocar.
    const filtered = (matches.length === 1 && normalizeSearch(matches[0].name) === query ? options : matches).slice(0, MAX_VISIBLE);
    const pick = (option: FipeOption) => { onPick(option); setOpen(false); };
    const show = () => { setOpen(true); setActive(0); onOpen?.(); };
    return <label className={className}>
        {label}
        <div className={styles.search} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
            <input role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list"
                aria-activedescendant={open && filtered[active] ? `${id}-${active}` : undefined}
                value={value} placeholder={placeholder} autoComplete="off"
                onFocus={show} onClick={() => { if (!open) show(); }}
                onChange={event => { onText(event.target.value); setOpen(true); setActive(0); }}
                onKeyDown={event => {
                    if (event.key === 'Escape') setOpen(false);
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActive(current => Math.max(0, Math.min(filtered.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)))); }
                    if (event.key === 'Enter' && open && filtered[active]) { event.preventDefault(); pick(filtered[active]); }
                }} />
            {open && (loading || options.length > 0 || emptyText) && <ul id={`${id}-list`} role="listbox" aria-label={label} className={styles.options}>
                {loading ? <li className={styles.muted}>Carregando lista da FIPE…</li>
                    : filtered.length ? filtered.map((option, index) => <li id={`${id}-${index}`} key={option.code} role="option" aria-selected={index === active}
                        onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => pick(option)}>{option.name}</li>)
                    : <li className={styles.muted}>{options.length ? 'Nenhum resultado na FIPE. Pode continuar digitando para cadastrar manualmente.' : emptyText}</li>}
                {!loading && matches.length > MAX_VISIBLE && <li className={styles.muted}>Continue digitando para refinar ({matches.length} resultados)</li>}
            </ul>}
        </div>
    </label>;
}

async function fipeGet<T>(params: Record<string, string>, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`/api/catalog/fipe?${new URLSearchParams(params)}`, { signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Falha na consulta FIPE.');
    return data as T;
}
const yearLabel = (option: FipeOption) => ({ ...option, name: option.name.replace(/^32000/, 'Zero km') });

/**
 * Estado da cascata FIPE (marca → modelo → ano/combustível, ou código → ano).
 * Cada resposta só é aplicada se ainda for a consulta mais recente daquele nível.
 */
export function useFipeCascade(tipo: string) {
    const type = fipeTypeFor(tipo);
    const brandsCache = useRef(new Map<string, FipeOption[]>());
    const [brands, setBrands] = useState<FipeOption[]>([]);
    const [brandCode, setBrandCode] = useState('');
    const [models, setModels] = useState<FipeOption[]>([]);
    const [modelCode, setModelCode] = useState('');
    const [codeKey, setCodeKey] = useState('');
    const [years, setYears] = useState<FipeOption[]>([]);
    const [year, setYear] = useState('');
    const [loading, setLoading] = useState('');
    const [error, setError] = useState('');
    const [brandsLoading, setBrandsLoading] = useState(false);
    const seq = useRef(0);
    const brandsRequest = useRef<string | null>(null);

    /** Cascata (modelos, anos, detalhe): só a consulta mais recente é aplicada. */
    const run = useCallback(async <T,>(what: string, task: () => Promise<T>) => {
        const id = ++seq.current; setLoading(what); setError('');
        try { const result = await task(); return id === seq.current ? result : null; }
        catch (err) { if (id === seq.current) setError(`${(err as Error).message} Você pode continuar preenchendo manualmente.`); return null; }
        finally { if (id === seq.current) setLoading(''); }
    }, []);

    /** Lista de marcas: independente da cascata, para que digitar na marca não cancele o carregamento. */
    const loadBrands = useCallback(async () => {
        const cached = brandsCache.current.get(type);
        if (cached) { setBrands(cached); return; }
        if (brandsRequest.current === type) return;
        brandsRequest.current = type; setBrandsLoading(true); setError('');
        try {
            const data = await fipeGet<FipeOption[]>({ type });
            brandsCache.current.set(type, data);
            if (brandsRequest.current === type) setBrands(data);
        } catch (err) {
            if (brandsRequest.current === type) setError(`${(err as Error).message} Você pode continuar preenchendo manualmente.`);
        } finally {
            if (brandsRequest.current === type) { brandsRequest.current = null; setBrandsLoading(false); }
        }
    }, [type]);

    const clearModel = useCallback(() => { setModelCode(''); setCodeKey(''); setYears([]); setYear(''); }, []);
    const clearBrand = useCallback(() => { setBrandCode(''); setModels([]); clearModel(); seq.current++; setLoading(''); }, [clearModel]);
    const reset = useCallback(() => { setBrands(brandsCache.current.get(type) || []); brandsRequest.current = null; setBrandsLoading(false); clearBrand(); setError(''); }, [clearBrand, type]);

    const pickBrand = useCallback(async (code: string) => {
        setBrandCode(code); setModels([]); clearModel();
        const data = await run('models', () => fipeGet<FipeOption[]>({ type, brand: code }));
        if (data) setModels(data);
    }, [clearModel, run, type]);

    const pickModel = useCallback(async (code: string) => {
        setModelCode(code); setCodeKey(''); setYears([]); setYear('');
        const data = await run('years', () => fipeGet<FipeOption[]>({ type, brand: brandCode, model: code }));
        if (data) setYears(data.map(yearLabel));
    }, [brandCode, run, type]);

    /** Código FIPE: descobre marca/modelo pela primeira combinação, mas o ano continua sendo escolha do usuário. */
    const lookupCode = useCallback(async (code: string) => {
        setBrandCode(''); setModels([]); setModelCode(''); setCodeKey(code); setYears([]); setYear('');
        return run('code', async () => {
            const options = await fipeGet<FipeOption[]>({ type, code });
            if (!options.length) throw new Error('Código FIPE sem anos disponíveis.');
            const detail = await fipeGet<FipeDetail>({ type, code, year: options[0].code });
            setYears(options.map(yearLabel));
            return detail;
        });
    }, [run, type]);

    const pickYear = useCallback(async (code: string) => {
        setYear(code);
        if (!code) return null;
        const params: Record<string, string> = codeKey ? { type, code: codeKey, year: code } : { type, brand: brandCode, model: modelCode, year: code };
        return run('detail', () => fipeGet<FipeDetail>(params));
    }, [brandCode, codeKey, modelCode, run, type]);

    return { type, brands, brandCode, models, modelCode, years, year, loading: brandsLoading && !loading ? 'brands' : loading, error, loadBrands, clearBrand, clearModel, reset, pickBrand, pickModel, lookupCode, pickYear };
}
