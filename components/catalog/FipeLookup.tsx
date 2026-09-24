'use client';
import { useEffect, useId, useRef, useState } from 'react';
import type { FipeDetail, FipeOption } from '@/lib/services/fipeService';
import styles from './FipeLookup.module.css';
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function SearchList({ label, options, value, onChange, disabled }: { label: string; options: FipeOption[]; value: string; onChange: (value: string) => void; disabled?: boolean }) {
    const id = useId(); const [text, setText] = useState(''); const [open, setOpen] = useState(false); const [active, setActive] = useState(0);
    useEffect(() => { if (value) setText(options.find(option => option.code === value)?.name || ''); }, [value, options]);
    const filtered = options.filter(option => normalize(option.name).includes(normalize(text)));
    const select = (option: FipeOption) => { onChange(option.code); setText(option.name); setOpen(false); };
    return <div className={styles.search} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
        <label htmlFor={id}>{label}</label>
        <input id={id} role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={open && filtered[active] ? `${id}-${active}` : undefined} disabled={disabled} value={text} placeholder={`Pesquisar ${label.toLowerCase()}`} onFocus={() => { setOpen(true); setActive(0); }} onChange={event => { setText(event.target.value); setOpen(true); setActive(0); if (value) onChange(''); }} onKeyDown={event => {
            if (event.key === 'Escape') setOpen(false);
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActive(current => Math.max(0, Math.min(filtered.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)))); }
            if (event.key === 'Enter' && open) { event.preventDefault(); if (filtered[active]) select(filtered[active]); }
        }} />
        {open && <ul id={`${id}-list`} role="listbox" aria-label={label} className={styles.options}>{filtered.length ? filtered.map((option, index) => <li id={`${id}-${index}`} key={option.code} role="option" aria-selected={index === active} onMouseDown={event => event.preventDefault()} onClick={() => select(option)}>{option.name}</li>) : <li>Nenhum resultado</li>}</ul>}
    </div>;
}
export function FipeLookup({ onApply }: { onApply: (detail: FipeDetail, tipo: string) => void }) {
    const [enabled, setEnabled] = useState(false); const [type, setType] = useState('cars'); const [mode, setMode] = useState('guided');
    const [brands, setBrands] = useState<FipeOption[]>([]); const [models, setModels] = useState<FipeOption[]>([]); const [years, setYears] = useState<FipeOption[]>([]);
    const [brand, setBrand] = useState(''); const [model, setModel] = useState(''); const [year, setYear] = useState(''); const [code, setCode] = useState(''); const [searchedCode, setSearchedCode] = useState('');
    const [detail, setDetail] = useState<FipeDetail | null>(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(false); const requestId = useRef(0);
    useEffect(() => {
        const id = ++requestId.current; const controller = new AbortController();
        setDetail(null); setError('');
        if (!enabled || (mode === 'code' && !searchedCode)) { setLoading(false); return; }
        const params = new URLSearchParams({ type });
        if (mode === 'code') params.set('code', searchedCode);
        else { if (brand) params.set('brand', brand); if (model) params.set('model', model); }
        if (year) params.set('year', year);
        setLoading(true);
        fetch(`/api/catalog/fipe?${params}`, { signal: controller.signal }).then(async response => { const data = await response.json(); if (!response.ok) throw Error(data.error); return data; }).then(data => {
            if (id !== requestId.current) return;
            if (year) setDetail(data); else if (mode === 'code' || model) setYears(data.map((item: FipeOption) => ({ ...item, name: item.name.replace(/^32000/, 'Zero km') }))); else if (brand) setModels(data); else setBrands(data);
        }).catch(err => { if (!controller.signal.aborted && id === requestId.current) setError(err.message || 'Falha na consulta FIPE.'); }).finally(() => { if (id === requestId.current) setLoading(false); });
        return () => controller.abort();
    }, [enabled, type, mode, brand, model, year, searchedCode]);
    const reset = () => { setBrand(''); setModel(''); setYear(''); setModels([]); setYears([]); setCode(''); setSearchedCode(''); setDetail(null); };
    return <section className={styles.panel} aria-label="Assistente FIPE">
        <div className={styles.heading}><strong>Preencher pela FIPE</strong><button type="button" onClick={() => { setEnabled(!enabled); reset(); }}>{enabled ? 'Continuar manualmente' : 'Buscar veículo'}</button></div>
        {!enabled && <p>Use marca e modelo ou o código FIPE. O cadastro manual continua disponível abaixo.</p>}
        {enabled && <>
            <div className={styles.grid}><label>Categoria<select value={type} onChange={event => { setType(event.target.value); setBrands([]); reset(); }}><option value="cars">Carros e utilitários</option><option value="motorcycles">Motos</option><option value="trucks">Caminhões</option></select></label>
            <label>Pesquisar por<select value={mode} onChange={event => { setMode(event.target.value); reset(); }}><option value="guided">Marca e modelo</option><option value="code">Código FIPE</option></select></label></div>
            {mode === 'guided' ? <div className={styles.grid}>
                <SearchList key={`brand-${type}`} label="Marca FIPE" options={brands} value={brand} disabled={loading && !brands.length} onChange={value => { setBrand(value); setModel(''); setYear(''); setModels([]); setYears([]); }} />
                <SearchList key={`model-${type}-${brand}`} label="Modelo / versão FIPE" options={models} value={model} disabled={!brand || loading && !models.length} onChange={value => { setModel(value); setYear(''); setYears([]); }} />
            </div> : <div className={styles.code}><label>Código FIPE<input value={code} placeholder="000000-0" onChange={event => { setCode(event.target.value); setSearchedCode(''); setYear(''); setYears([]); }} /></label><button type="button" disabled={loading || !/^\d{6}-?\d$/.test(code.trim())} onClick={() => setSearchedCode(code.trim())}>Consultar código</button></div>}
            <SearchList key={`year-${type}-${mode}-${brand}-${model}-${searchedCode}`} label="Ano-modelo / combustível FIPE" options={years} value={year} onChange={setYear} disabled={!years.length || loading} />
            {loading && <p role="status">Consultando FIPE…</p>}{error && <p role="alert">{error} Você pode continuar pelo cadastro manual.</p>}
            {detail && <div className={styles.result}><strong>{detail.brand} · {detail.model}</strong><p>{detail.modelYear === 32000 ? 'Zero km — informe o ano-modelo no cadastro' : detail.modelYear} · {detail.fuel} · FIPE {detail.codeFipe}</p><p>Aplicar substitui marca, nome de exibição, combustível e ano-modelo. Revise os demais campos antes de salvar.</p><button type="button" onClick={() => { onApply(detail, type === 'motorcycles' ? 'moto' : type === 'trucks' ? 'caminhao' : 'carro'); setEnabled(false); reset(); }}>Aplicar ao cadastro</button></div>}
        </>}
    </section>;
}
