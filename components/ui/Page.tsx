'use client';

import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import styles from './Page.module.css';

export { styles as pageStyles };

/* ─────────────────────────── Estrutura ─────────────────────────── */

/**
 * Faixa superior de toda tela logada: trilha (Painel › Seção), data e ações
 * globais à direita. Fica fixa no topo da área de conteúdo.
 */
export function PageTopbar({ trail, aside }: { trail: string[]; aside?: ReactNode }) {
    const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    return (
        <div className={styles.topbar}>
            <nav className={styles.trail} aria-label="Você está em">
                {trail.map((item, i) => (
                    <span key={`${item}-${i}`} className={styles.trailItem} aria-current={i === trail.length - 1 ? 'page' : undefined}>
                        {i > 0 && <ChevronRight size={14} aria-hidden="true" className={styles.trailSep} />}
                        {item}
                    </span>
                ))}
            </nav>
            <div className={styles.topbarAside}>
                <span className={styles.topbarDate}>{hoje.charAt(0).toUpperCase() + hoje.slice(1)}</span>
                {aside}
            </div>
        </div>
    );
}

/** Miolo da página: largura máxima e respiro padrão. */
export function Page({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
    return <div className={`${styles.page} ${wide ? styles.pageWide : ''}`}>{children}</div>;
}

/** Título da seção, contador opcional, descrição de uma linha e ação principal à direita. */
export function PageHeader({ title, count, description, actions }: {
    title: string;
    count?: number | null;
    description?: ReactNode;
    actions?: ReactNode;
}) {
    return (
        <header className={styles.header}>
            <div className={styles.headerText}>
                <div className={styles.titleRow}>
                    <h1 className={styles.title}>{title}</h1>
                    {typeof count === 'number' && <span className={styles.count}>{count.toLocaleString('pt-BR')}</span>}
                </div>
                {description && <p className={styles.description}>{description}</p>}
            </div>
            {actions && <div className={styles.headerActions}>{actions}</div>}
        </header>
    );
}

/* ─────────────────────────── Indicadores ─────────────────────────── */

export function StatGrid({ children }: { children: ReactNode }) {
    return <section className={styles.stats} aria-label="Indicadores">{children}</section>;
}

/**
 * Card de indicador: rótulo, número grande e legenda. `progress` (0 a 100)
 * desenha a barra fina, como "0% da base".
 */
export function StatCard({ label, value, caption, icon, progress, tone }: {
    label: string;
    value: ReactNode;
    caption?: ReactNode;
    icon?: ReactNode;
    progress?: number;
    tone?: 'default' | 'positive' | 'warning' | 'negative';
}) {
    return (
        <div className={styles.stat} data-tone={tone ?? 'default'}>
            <div className={styles.statHead}>
                <span className={styles.statLabel}>{label}</span>
                {icon && <span className={styles.statIcon} aria-hidden="true">{icon}</span>}
            </div>
            <strong className={styles.statValue}>{value}</strong>
            {typeof progress === 'number' && (
                <div className={styles.statBar} role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
                    <span style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
                </div>
            )}
            {caption && <span className={styles.statCaption}>{caption}</span>}
        </div>
    );
}

/* ─────────────────────────── Painel de dados ─────────────────────────── */

/** Caixa branca que agrupa barra de filtros, tabela/lista e rodapé. */
export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
    return <section className={`${styles.panel} ${className}`}>{children}</section>;
}

export function PanelToolbar({ children }: { children: ReactNode }) {
    return <div className={styles.toolbar}>{children}</div>;
}

export function PanelFooter({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
    return (
        <footer className={styles.footer}>
            <span>{children}</span>
            {aside && <span className={styles.footerAside}>{aside}</span>}
        </footer>
    );
}

/** "Mostrando 10 de 42 clientes". */
export function ShowingCount({ shown, total, singular, plural }: { shown: number; total: number; singular: string; plural: string }) {
    return <>Mostrando <strong>{shown.toLocaleString('pt-BR')}</strong> de {total.toLocaleString('pt-BR')} {total === 1 ? singular : plural}</>;
}

export interface SegmentOption<T extends string> { value: T; label: string; count?: number }

/** Filtro segmentado com contadores (Todos 12 · Ativos 9 · Inativos 3). */
export function Segmented<T extends string>({ options, value, onChange, label }: {
    options: SegmentOption<T>[];
    value: T;
    onChange: (value: T) => void;
    label: string;
}) {
    return (
        <div className={styles.segmented} role="tablist" aria-label={label}>
            {options.map(opt => (
                <button
                    key={opt.value}
                    type="button"
                    role="tab"
                    aria-selected={opt.value === value}
                    className={styles.segment}
                    onClick={() => onChange(opt.value)}
                >
                    {opt.label}
                    {typeof opt.count === 'number' && <span className={styles.segmentCount}>{opt.count.toLocaleString('pt-BR')}</span>}
                </button>
            ))}
        </div>
    );
}

export function SearchField({ value, onChange, placeholder, label }: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    label?: string;
}) {
    return (
        <label className={styles.search}>
            <Search size={16} aria-hidden="true" className={styles.searchIcon} />
            <input
                type="search"
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                aria-label={label ?? placeholder}
            />
            {value && (
                <button type="button" className={styles.searchClear} onClick={() => onChange('')} aria-label="Limpar busca">
                    <X size={14} aria-hidden="true" />
                </button>
            )}
        </label>
    );
}

/* ─────────────────────────── Peças de linha ─────────────────────────── */

export function Avatar({ name, src, size = 36 }: { name: string; src?: string | null; size?: number }) {
    const partes = name.trim().split(/\s+/).filter(Boolean);
    // Primeiro e último nome, como na assinatura: "Hebert ... Sandinha" vira HS.
    const iniciais = (partes.length > 1 ? partes[0][0] + partes[partes.length - 1][0] : (partes[0] ?? '?').slice(0, 2)).toUpperCase();
    return (
        <span className={styles.avatar} style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }} aria-hidden="true">
            {src ? <img src={src} alt="" /> : iniciais}
        </span>
    );
}

/** Nome em destaque com linha secundária (e-mail, código, cidade). */
export function PrimaryCell({ title, subtitle, leading }: { title: ReactNode; subtitle?: ReactNode; leading?: ReactNode }) {
    return (
        <div className={styles.primaryCell}>
            {leading}
            <div className={styles.primaryText}>
                <span className={styles.primaryTitle}>{title}</span>
                {subtitle && <span className={styles.primarySub}>{subtitle}</span>}
            </div>
        </div>
    );
}

export function TwoLine({ top, bottom, nowrap }: { top: ReactNode; bottom?: ReactNode; /** Datas e valores: não quebra linha. */ nowrap?: boolean }) {
    return (
        <div className={`${styles.twoLine} ${nowrap ? styles.nowrap : ''}`}>
            <span>{top}</span>
            {bottom && <span className={styles.muted}>{bottom}</span>}
        </div>
    );
}

export type BadgeTone = 'neutral' | 'positive' | 'warning' | 'negative' | 'info' | 'accent';

/** Pílula de status com ponto (Ativo, Sem acesso, Pendente). */
export function StatusBadge({ tone = 'neutral', children, dot = true }: { tone?: BadgeTone; children: ReactNode; dot?: boolean }) {
    return (
        <span className={styles.badge} data-tone={tone}>
            {dot && <span className={styles.badgeDot} aria-hidden="true" />}
            {children}
        </span>
    );
}

/** Botão só com ícone nas ações da linha (conversar, editar, ver). */
export function IconAction({ label, onClick, children, tone, href }: {
    label: string;
    onClick?: () => void;
    children: ReactNode;
    tone?: 'danger';
    href?: string;
}) {
    if (href) {
        return <a className={styles.iconAction} data-tone={tone} href={href} title={label} aria-label={label} target="_blank" rel="noopener noreferrer">{children}</a>;
    }
    return <button type="button" className={styles.iconAction} data-tone={tone} onClick={onClick} title={label} aria-label={label}>{children}</button>;
}

export function RowActions({ children }: { children: ReactNode }) {
    return <div className={styles.rowActions}>{children}</div>;
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode }) {
    return (
        <div className={styles.empty}>
            {icon && <span className={styles.emptyIcon} aria-hidden="true">{icon}</span>}
            <strong>{title}</strong>
            {description && <p>{description}</p>}
            {action}
        </div>
    );
}

/** Paginação do rodapé: Anterior · Página 2 de 9 · Próxima. */
export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
    if (totalPages <= 1) return null;
    return (
        <nav className={styles.pagination} aria-label="Paginação">
            <button type="button" className={styles.pageButton} onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Página anterior">
                <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <span className={styles.pageInfo}>Página <strong>{page}</strong> de {totalPages}</span>
            <button type="button" className={styles.pageButton} onClick={() => onChange(page + 1)} disabled={page >= totalPages} aria-label="Próxima página">
                <ChevronRight size={16} aria-hidden="true" />
            </button>
        </nav>
    );
}

/** Select compacto da barra de filtros. A primeira opção nomeia o filtro ("Todos os planos"). */
export function FilterSelect<T extends string>({ label, value, options, onChange }: {
    label: string;
    value: T;
    options: { value: T; label: string }[];
    onChange: (value: T) => void;
}) {
    return (
        <label className={styles.filterSelect}>
            <select value={value} onChange={e => onChange(e.target.value as T)} aria-label={label}>
                {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown size={14} aria-hidden="true" className={styles.filterChevron} />
        </label>
    );
}

export type SortDirection = 'asc' | 'desc';

/** Cabeçalho de coluna ordenável: clique alterna crescente e decrescente. */
export function SortHeader<K extends string>({ label, column, sort, onSort, align }: {
    label: string;
    column: K;
    sort: { column: K | null; direction: SortDirection };
    onSort: (column: K) => void;
    align?: 'right';
}) {
    const ativo = sort.column === column;
    return (
        <th className={align === 'right' ? styles.num : undefined} aria-sort={ativo ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
            <button type="button" className={styles.sortButton} onClick={() => onSort(column)} data-active={ativo}>
                {label}
                {ativo
                    ? (sort.direction === 'asc' ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" />)
                    : <ArrowUpDown size={13} aria-hidden="true" />}
            </button>
        </th>
    );
}

/** Estado de ordenação pronto para SortHeader. */
export function nextSort<K extends string>(sort: { column: K | null; direction: SortDirection }, column: K) {
    return sort.column === column
        ? { column, direction: (sort.direction === 'asc' ? 'desc' : 'asc') as SortDirection }
        : { column, direction: 'asc' as SortDirection };
}

/** Linhas fantasmas enquanto a lista carrega (evita tela piscando "0 itens"). */
export function SkeletonRows({ rows = 5, columns }: { rows?: number; columns: number }) {
    return (
        <>
            {Array.from({ length: rows }, (_, r) => (
                <tr key={r} aria-hidden="true">
                    {Array.from({ length: columns }, (_, c) => (
                        <td key={c}><span className={styles.skeleton} style={{ width: c === 0 ? '70%' : `${40 + ((r + c) % 3) * 15}%` }} /></td>
                    ))}
                </tr>
            ))}
        </>
    );
}

/** Abas de uma tela com sub-seções (ex.: Configurações > Geral · Frete · Integrações). */
export function Tabs<T extends string>({ tabs, value, onChange, label }: {
    tabs: { value: T; label: string; count?: number }[];
    value: T;
    onChange: (value: T) => void;
    label: string;
}) {
    return (
        <div className={styles.tabs} role="tablist" aria-label={label}>
            {tabs.map(t => (
                <button key={t.value} type="button" role="tab" aria-selected={t.value === value} className={styles.tab} onClick={() => onChange(t.value)}>
                    {t.label}
                    {typeof t.count === 'number' && <span className={styles.segmentCount}>{t.count}</span>}
                </button>
            ))}
        </div>
    );
}

/** Bloco de configuração/formulário: título, explicação e conteúdo; ações no rodapé. */
export function SectionCard({ title, description, children, footer, aside }: {
    title: string;
    description?: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
    aside?: ReactNode;
}) {
    return (
        <section className={styles.section}>
            <header className={styles.sectionHead}>
                <div>
                    <h2 className={styles.sectionTitle}>{title}</h2>
                    {description && <p className={styles.sectionDescription}>{description}</p>}
                </div>
                {aside}
            </header>
            <div className={styles.sectionBody}>{children}</div>
            {footer && <footer className={styles.sectionFooter}>{footer}</footer>}
        </section>
    );
}

/* ─────────────────────────── Botões ─────────────────────────── */

export function Button({ variant = 'secondary', icon, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    icon?: ReactNode;
}) {
    return (
        <button type="button" {...rest} className={`${styles.button} ${rest.className ?? ''}`} data-variant={variant}>
            {icon}
            {children}
        </button>
    );
}
