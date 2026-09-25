import type { Metadata } from 'next';
import styles from './page.module.css';
import { OpenModalButton } from '@/components/lp/OpenModalButton';
import { RegisterModals } from '@/components/lp/RegisterModals';
import { LegalModals } from '@/components/lp/LegalModals';
import { LegalButtons } from '@/components/lp/LegalButtons';
import { PlansSection, type PlanData } from '@/components/lp/PlansSection';
import { FloatingWhatsAppClient } from '@/components/lp/FloatingWhatsAppClient';
import { LandingNav, BrandLockup } from '@/components/lp/LandingNav';
import { ComissaoCalculadora } from '@/components/lp/ComissaoCalculadora';
import {
    IconArrowRight, IconBell, IconChat, IconChevronDown, IconFile, IconHeart, IconInbox, IconMegaphone,
    IconPhone, IconRepeat, IconSearch, IconTable, IconTruck, IconUpload,
} from '@/components/lp/icons';
import connectDB from '@/lib/mongodb';
import PlanModel from '@/models/Plan';
import DealerVehiclePrice from '@/models/DealerVehiclePrice';
import VehicleVariation from '@/models/VehicleVariation';
import mongoose from 'mongoose';
import { formatBrazilPhone, normalizeBrazilWhatsAppNumber } from '@/lib/utils/leadWhatsApp';
import { buildHomeStockPipeline, mapHomeStockSummary, EMPTY_HOME_STOCK } from '@/lib/utils/homeStock';
import { dividirNomePlano, recursosDoPlano } from '@/lib/utils/planoTexto';

export const metadata: Metadata = {
    title: 'CNV 0KM · Estoque 0km das concessionárias, sem intermediário',
    description: 'Consulte preço, cor, prazo e disponibilidade do estoque 0km das concessionárias e negocie direto, sem comissão para a mesa. Teste grátis.',
    openGraph: {
        title: 'CNV 0KM · O estoque 0km das concessionárias, sem a mesa no meio',
        description: 'Preço, cor, prazo e disponibilidade de carros 0km direto das concessionárias. Sem comissão para intermediários.',
        url: 'https://www.cnv0km.com.br',
        siteName: 'CNV 0KM',
        locale: 'pt_BR',
        type: 'website',
    },
};

export const revalidate = 60; // o estoque da primeira dobra se atualiza a cada minuto

/* ── Formatação dos números reais do estoque ── */

const PALAVRAS_CURTAS = new Set(['AUT', 'MEC', 'CAB', 'DE', 'DA', 'DO', 'COM']);

/** "HILUX SR AWD AUT." vira "Hilux SR AWD Aut.": siglas curtas e códigos continuam em maiúsculas. */
function nomeModelo(nome: string) {
    return nome.trim().split(/\s+/).map(palavra => palavra.split('-').map(parte => {
        const letras = parte.replace(/[^A-Za-zÀ-ÿ]/g, '').toUpperCase();
        if (/\d/.test(parte) || (letras.length <= 3 && !PALAVRAS_CURTAS.has(letras))) return parte.toUpperCase();
        const minusculo = parte.toLocaleLowerCase('pt-BR');
        return minusculo.charAt(0).toLocaleUpperCase('pt-BR') + minusculo.slice(1);
    }).join('-')).join(' ');
}

function valorEstoque(valor: number) {
    if (valor >= 1_000_000_000) return `R$ ${(valor / 1_000_000_000).toFixed(1).replace('.', ',')} bi`;
    if (valor >= 1_000_000) return `R$ ${Math.round(valor / 1_000_000)} mi`;
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function precoCurto(valor: number) {
    if (valor >= 1_000_000) return `R$ ${(valor / 1_000_000).toFixed(1).replace('.', ',')} mi`;
    if (valor >= 1_000) return `R$ ${Math.round(valor / 1_000)} mil`;
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

/** "mais de 15 mil carros em 15 estados", sem arredondar para cima. */
function resumoEstoque(veiculos: number, estados: number) {
    const carros = veiculos >= 1000 ? `mais de ${Math.floor(veiculos / 1000)} mil carros` : `${veiculos.toLocaleString('pt-BR')} carros`;
    if (estados > 1) return `${carros} em ${estados} estados`;
    return carros;
}

const precoPlano = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });

/* ── Conteúdo fixo ── */

const COMPARACAO = [
    { tema: 'Comissão por carro', mesa: 'Paga em toda compra', cnv: 'Zero', zero: true },
    { tema: 'Com quem você negocia', mesa: 'Um intermediário', cnv: 'A concessionária' },
    { tema: 'O que você enxerga', mesa: 'O que a mesa oferece', cnv: 'O estoque de todas as lojas cadastradas' },
    { tema: 'Preço que chega a você', mesa: 'Com a parte da mesa', cnv: 'O da concessionária' },
];

const RECURSOS = [
    { icone: <IconTable />, titulo: 'Estoque de várias concessionárias num lugar só', texto: 'Preço, cor, prazo e quantidade publicados e atualizados pelas próprias concessionárias.' },
    { icone: <IconHeart />, titulo: 'Favoritos com aviso de oferta', texto: 'Monitore o carro que o seu cliente quer e veja no menu quando entrar oferta nova.' },
    { icone: <IconFile />, titulo: 'Sua margem no orçamento', texto: 'Defina a margem uma vez e gere o orçamento em PDF pronto para enviar ao cliente.' },
    { icone: <IconTruck />, titulo: 'Frete até a sua loja', texto: 'Valor de transporte por estado para comparar o custo final antes de fechar.' },
    { icone: <IconRepeat />, titulo: 'Repasse de seminovos', texto: 'Usados que as concessionárias recebem na troca, oferecidos direto para lojistas.' },
    { icone: <IconPhone />, titulo: 'No computador e no celular', texto: 'A consulta funciona na loja, no pátio ou atendendo o cliente pelo WhatsApp.' },
];

const CONCESSIONARIA = [
    { icone: <IconUpload />, titulo: 'Estoque pela planilha ou pelo painel', texto: 'Preço, prazo e quantidade de cada versão, em minutos.' },
    { icone: <IconRepeat size={20} />, titulo: 'Repasse de seminovos', texto: 'Os usados da troca oferecidos para lojistas, com busca pela FIPE.' },
    { icone: <IconMegaphone />, titulo: 'Banner em destaque', texto: 'Anuncie uma oferta no topo da consulta dos lojistas.' },
    { icone: <IconInbox />, titulo: 'Contatos no seu CRM', texto: 'Cada lojista interessado entra no funil de leads da sua loja.' },
];

const DUVIDAS = [
    { q: 'A CNV cobra comissão sobre as vendas?', a: 'Não. Você paga só o plano. A negociação é direta entre a sua loja e a concessionária, sem porcentagem para a CNV nem para intermediários.' },
    { q: 'Como funciona o teste grátis?', a: 'Você cria a conta e usa a consulta completa por 10 minutos. Para continuar, escolhe um plano e paga por PIX, boleto ou cartão.' },
    { q: 'De onde vêm os preços e o estoque?', a: 'Das próprias concessionárias, que publicam e atualizam preço, prazo e quantidade no painel da CNV.' },
    { q: 'Posso cancelar quando quiser?', a: 'Sim. Não há fidelidade nem multa. A cobrança recorrente no cartão é cancelada pelo próprio painel e o acesso segue até o fim do período pago.' },
    { q: 'A consulta funciona no celular?', a: 'Sim. A consulta, os favoritos e o orçamento funcionam no computador, no tablet e no celular.' },
    { q: 'Sou concessionária. Como entro na plataforma?', a: 'Faça o cadastro da concessionária. A equipe da CNV confere os dados, vincula as marcas e libera o painel para você publicar o estoque.' },
];

export default async function LandingPage() {
    // Planos ativos do lojista, do mais barato ao mais caro. Os de concessionária
    // (repasse) não são vendidos aqui.
    let PLANS: PlanData[] = [];
    try {
        await connectDB();
        const dbPlans = await PlanModel.find({ active: true, publico: { $ne: 'concessionaria' } }).sort({ price: 1 }).lean();
        const popularId = dbPlans.find(p => (p as any).popular)?._id?.toString();
        const maisCaroId = dbPlans.length > 1 ? dbPlans[dbPlans.length - 1]._id?.toString() : undefined;
        const destaqueId = popularId ?? maisCaroId;
        PLANS = dbPlans.map(p => {
            const id = (p._id as any).toString();
            const { titulo, resumo } = dividirNomePlano(p.name);
            return {
                id,
                title: titulo,
                summary: resumo,
                price: p.price,
                annualPrice: ((p as any).annualPrice as number | null | undefined) ?? null,
                features: recursosDoPlano((p as any).features as string[] | undefined, p.description),
                featured: id === destaqueId,
                badge: id === destaqueId ? (popularId ? 'Mais popular' : 'Mais completo') : undefined,
            };
        });
    } catch {
        PLANS = [];
    }
    const planoDeEntrada = PLANS.find(p => p.price > 0);

    // Estoque real: mesma fonte que o cliente vê na consulta.
    let estoque = { ...EMPTY_HOME_STOCK };
    try {
        await connectDB();
        const [resumo, variacoesAtivas] = await Promise.all([
            DealerVehiclePrice.aggregate(buildHomeStockPipeline()),
            VehicleVariation.countDocuments({ ativo: true }),
        ]);
        estoque = mapHomeStockSummary(resumo, variacoesAtivas);
    } catch {
        // Sem banco: a página mostra o texto sem números.
    }
    const temEstoque = estoque.totalVehicles > 0;

    let contactConfig = {
        whatsapp: '11926384826',
        email_support: 'suporte@meuzerokilometro.com.br',
        email_sales: 'comercial@meuzerokilometro.com.br',
        email_general: 'cnv0kmsp@gmail.com',
        address: 'São Paulo, SP',
        business_hours: 'Seg–Sex: 09:00–18:00',
        cnpj: '64.467.246/0001-50'
    };
    
    try {
        await connectDB();
        const configCollection = mongoose.connection.useDb('zerokm').collection('configs');
        const contatoDoc = await configCollection.findOne({ key: 'contato' }) as any;
        if (contatoDoc) {
            contactConfig = {
                whatsapp: contatoDoc.whatsapp || contactConfig.whatsapp,
                email_support: contatoDoc.email_support || contactConfig.email_support,
                email_sales: contatoDoc.email_sales || contactConfig.email_sales,
                email_general: contatoDoc.email_general || contactConfig.email_general,
                address: contatoDoc.address || contactConfig.address,
                business_hours: contatoDoc.business_hours || contactConfig.business_hours,
                cnpj: contatoDoc.cnpj || contactConfig.cnpj
            };
        }
    } catch {
        // use default contact
    }

    // Origem única do WhatsApp da página: mesma config que o disparo de lead usa.
    const whatsappNumber = normalizeBrazilWhatsAppNumber(contactConfig.whatsapp);
    const whatsappUrl = whatsappNumber ? `https://wa.me/${whatsappNumber}` : null;

    return (
        <div className={styles.page} id="topo">
            <LandingNav />

            <main>
                {/* ── PRIMEIRA DOBRA ── */}
                <section className={styles.hero} aria-labelledby="titulo-principal">
                    <div className={styles.container}>
                        <div className={styles.heroGrid}>
                            <div className={styles.heroCopy}>
                                <span className={styles.pill}><span className={styles.pillDot} aria-hidden="true" />0% de comissão para intermediários</span>
                                <h1 id="titulo-principal" className={styles.heroTitle}>O estoque 0km das concessionárias, sem a mesa no meio.</h1>
                                <p className={styles.heroSub}>
                                    Consulte preço, cor, prazo e disponibilidade {temEstoque ? `de ${resumoEstoque(estoque.totalVehicles, estoque.totalStates)}` : 'do estoque das concessionárias'} e
                                    negocie direto com quem vende. A margem fica inteira com a sua loja.
                                </p>
                                <div className={styles.heroCtas}>
                                    <OpenModalButton type="cliente" className={`${styles.btn} ${styles.btnLg} ${styles.btnPrimary}`}>
                                        Testar grátis por 10 minutos <IconArrowRight />
                                    </OpenModalButton>
                                    <a href="#como-funciona" className={`${styles.btn} ${styles.btnLg} ${styles.btnOutline}`}>Ver como funciona</a>
                                </div>
                                <p className={styles.heroNote}>
                                    Sem cartão para testar{planoDeEntrada ? ` · Planos a partir de R$ ${precoPlano(planoDeEntrada.price)}/mês` : ''} · Sem fidelidade
                                </p>
                            </div>

                            {/* Recorte da consulta com o estoque de hoje */}
                            <div className={styles.product}>
                                <div className={styles.productCard}>
                                    <div className={styles.productBar}>
                                        <span className={styles.productTrail}>Cliente › <strong>Veículos</strong></span>
                                        <span className={styles.productLive}><span className={styles.liveDot} aria-hidden="true" />Estoque de hoje</span>
                                    </div>
                                    <div className={styles.productTools} aria-hidden="true">
                                        <div className={styles.productSearch}><IconSearch />Buscar modelo, versão ou cor</div>
                                        <div className={styles.chips}>
                                            <span className={`${styles.chip} ${styles.chipOn}`}>{estoque.topModels[0]?.brand ? nomeModelo(estoque.topModels[0].brand) : 'Marca'}</span>
                                            <span className={styles.chip}>Todas as cores</span>
                                            <span className={styles.chip}>Todos os estados</span>
                                        </div>
                                    </div>
                                    {estoque.topModels.length > 0 ? (
                                        <div role="table" aria-label="Modelos com mais unidades no estoque">
                                            <div role="row" className={styles.productHead}>
                                                <span role="columnheader">Veículo</span>
                                                <span role="columnheader">UF</span>
                                                <span role="columnheader" className={styles.num}>Preço médio</span>
                                                <span role="columnheader" className={styles.num}>Unidades</span>
                                            </div>
                                            {estoque.topModels.map(m => (
                                                <div role="row" key={m.name} className={styles.productRow}>
                                                    <span role="cell" className={styles.productName}>
                                                        <strong>{nomeModelo(m.name)}</strong>
                                                        <span>{m.brand ? nomeModelo(m.brand) : `Estoque em ${m.estado}`}</span>
                                                    </span>
                                                    <span role="cell" className={styles.productUf}>{m.estado}</span>
                                                    <span role="cell" className={`${styles.num} ${styles.productPrice}`}>{precoCurto(m.avgPrice)}</span>
                                                    <span role="cell" className={`${styles.num} ${styles.productUnits}`}>{m.count.toLocaleString('pt-BR')}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className={styles.productEmpty}>O estoque completo aparece no teste grátis.</p>
                                    )}
                                </div>
                                <div className={styles.productFloat}>
                                    <span className={styles.floatIcon}><IconBell /></span>
                                    <span className={styles.floatText}>
                                        <strong>Favoritos</strong>
                                        <span>Você recebe o aviso quando chega oferta nova do carro que monitora.</span>
                                    </span>
                                </div>
                            </div>
                        </div>

                        {temEstoque && (
                            <ul className={`${styles.stats} ${styles.plainList}`} aria-label="Estoque publicado hoje">
                                <li className={styles.stat}>
                                    <span className={styles.statNum}>{estoque.totalVehicles.toLocaleString('pt-BR')}</span>
                                    <span className={styles.statLabel}>veículos 0km disponíveis hoje</span>
                                </li>
                                <li className={styles.stat}>
                                    <span className={styles.statNum}>{valorEstoque(estoque.totalValue)}</span>
                                    <span className={styles.statLabel}>em estoque com preço publicado</span>
                                </li>
                                <li className={styles.stat}>
                                    <span className={styles.statNum}>{estoque.totalStates}</span>
                                    <span className={styles.statLabel}>{estoque.totalStates === 1 ? 'estado com concessionárias' : 'estados com concessionárias'}</span>
                                </li>
                                <li className={styles.stat}>
                                    <span className={`${styles.statNum} ${styles.statAccent}`}>0%</span>
                                    <span className={styles.statLabel}>de comissão para intermediários</span>
                                </li>
                            </ul>
                        )}
                    </div>
                </section>

                {/* ── A CONTA DA MESA ── */}
                <section id="conta" className={`${styles.section} ${styles.sectionSoft}`} aria-labelledby="titulo-conta">
                    <div className={`${styles.container} ${styles.contaGrid}`}>
                        <div className={styles.stack}>
                            <span className={styles.eyebrow}>A conta da mesa</span>
                            <h2 id="titulo-conta" className={styles.h2}>Cada carro comprado pela mesa leva um pedaço da sua margem.</h2>
                            <p className={styles.lead}>Na CNV você vê o estoque que as próprias concessionárias publicam e fala direto com elas. Nenhum intermediário entre o preço de fábrica e o seu cliente.</p>
                            <div className={styles.compare} role="table" aria-label="Comparação entre comprar pela mesa e pela CNV">
                                <div role="row" className={`${styles.compareRow} ${styles.compareHead}`}>
                                    <span role="columnheader"><span className={styles.srOnly}>Tema</span></span>
                                    <span role="columnheader">Com a mesa</span>
                                    <span role="columnheader">Com a CNV</span>
                                </div>
                                {COMPARACAO.map(c => (
                                    <div role="row" key={c.tema} className={styles.compareRow}>
                                        <span role="rowheader" className={styles.compareLabel}>{c.tema}</span>
                                        <span role="cell" className={styles.compareMesa}>{c.mesa}</span>
                                        <span role="cell" className={c.zero ? styles.compareZero : styles.compareCnv}>{c.cnv}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <ComissaoCalculadora
                            precoPlanoMensal={planoDeEntrada?.price ?? 0}
                            nomePlano={planoDeEntrada?.title ?? 'Plano'}
                        />
                    </div>
                </section>

                {/* ── COMO FUNCIONA ── */}
                <section id="como-funciona" className={styles.section} aria-labelledby="titulo-como">
                    <div className={styles.container}>
                        <div className={styles.sectionHead}>
                            <div className={styles.stackTight}>
                                <span className={styles.eyebrow}>Como funciona</span>
                                <h2 id="titulo-como" className={styles.h2}>Do filtro ao fechamento em três passos.</h2>
                            </div>
                            <p>O teste grátis libera a consulta completa por 10 minutos. Depois, é só escolher o plano.</p>
                        </div>
                        <ol className={`${styles.stepsGrid} ${styles.plainList}`}>
                            <li className={styles.step}>
                                <span className={styles.stepNum}>01</span>
                                <div className={styles.stepBody}>
                                    <h3 className={styles.stepTitle}>Encontre o carro</h3>
                                    <p className={styles.stepText}>Filtre por marca, modelo, versão, cor e estado. Você vê o que cada concessionária tem de verdade.</p>
                                </div>
                                <div className={`${styles.stepDemo} ${styles.demoChips}`} aria-hidden="true">
                                    <span className={styles.demoChip}>Marca</span>
                                    <span className={styles.demoChip}>Modelo</span>
                                    <span className={styles.demoChip}>Versão</span>
                                    <span className={styles.demoChip}>Cor</span>
                                    <span className={`${styles.demoChip} ${styles.demoChipOn}`}>Estado</span>
                                </div>
                            </li>
                            <li className={styles.step}>
                                <span className={styles.stepNum}>02</span>
                                <div className={styles.stepBody}>
                                    <h3 className={styles.stepTitle}>Compare as ofertas</h3>
                                    <p className={styles.stepText}>Preço, prazo de entrega e frete até a sua cidade lado a lado, para achar a melhor compra.</p>
                                </div>
                                <div className={`${styles.stepDemo} ${styles.demoRows}`} aria-hidden="true">
                                    <div className={styles.demoRow}><span>Preço</span><strong>Da concessionária</strong></div>
                                    <div className={styles.demoRow}><span>Prazo</span><strong>Pronta entrega ou dias</strong></div>
                                    <div className={styles.demoRow}><span>Frete</span><strong>Por estado</strong></div>
                                </div>
                            </li>
                            <li className={styles.step}>
                                <span className={styles.stepNum}>03</span>
                                <div className={styles.stepBody}>
                                    <h3 className={styles.stepTitle}>Negocie direto</h3>
                                    <p className={styles.stepText}>Chame a concessionária pelo contato dela e mande ao seu cliente o orçamento em PDF com a sua margem.</p>
                                </div>
                                <div className={`${styles.stepDemo} ${styles.demoLines}`} aria-hidden="true">
                                    <span className={styles.demoLine}><span className={styles.demoIconPositive}><IconChat /></span>Contato direto da concessionária</span>
                                    <span className={styles.demoLine}><span className={styles.demoIconGold}><IconFile size={18} /></span>Orçamento em PDF para o cliente</span>
                                </div>
                            </li>
                        </ol>
                    </div>
                </section>

                {/* ── RECURSOS ── */}
                <section id="recursos" className={`${styles.section} ${styles.sectionSoft}`} aria-labelledby="titulo-recursos">
                    <div className={styles.container}>
                        <div className={`${styles.stackTight} ${styles.sectionHeadNarrow}`}>
                            <span className={styles.eyebrow}>Recursos</span>
                            <h2 id="titulo-recursos" className={styles.h2}>Feito para a rotina de quem compra e revende 0km.</h2>
                        </div>
                        <ul className={`${styles.featuresGrid} ${styles.plainList}`}>
                            {RECURSOS.map(r => (
                                <li key={r.titulo} className={styles.feature}>
                                    <span className={styles.featureIcon}>{r.icone}</span>
                                    <h3 className={styles.featureTitle}>{r.titulo}</h3>
                                    <p className={styles.featureText}>{r.texto}</p>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                {/* ── PARA CONCESSIONÁRIAS ── */}
                <section id="concessionarias" className={`${styles.section} ${styles.sectionDark}`} aria-labelledby="titulo-concessionarias">
                    <div className={`${styles.container} ${styles.dealerGrid}`}>
                        <div className={styles.stack}>
                            <span className={`${styles.eyebrow} ${styles.eyebrowOnDark}`}>Para concessionárias</span>
                            <h2 id="titulo-concessionarias" className={`${styles.h2} ${styles.h2OnDark}`}>Sua vitrine para lojistas do Brasil inteiro.</h2>
                            <p className={`${styles.lead} ${styles.leadOnDark}`}>Publique o estoque uma vez e seja encontrado por lojistas de outros estados, sem pagar comissão por venda.</p>
                            <div className={styles.dealerCtas}>
                                <OpenModalButton type="concessionaria" className={`${styles.btn} ${styles.btnLg} ${styles.btnGold}`}>Cadastrar concessionária</OpenModalButton>
                                {whatsappUrl && (
                                    <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={`${styles.btn} ${styles.btnLg} ${styles.btnOnDark}`}>Falar com o comercial</a>
                                )}
                            </div>
                        </div>
                        <ul className={styles.dealerList}>
                            {CONCESSIONARIA.map(c => (
                                <li key={c.titulo} className={styles.dealerItem}>
                                    <span className={styles.dealerIcon}>{c.icone}</span>
                                    <span className={styles.dealerText}><strong>{c.titulo}</strong><span>{c.texto}</span></span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                {/* ── PLANOS ── */}
                {PLANS.length > 0 && (
                    <section id="planos" className={styles.section} aria-labelledby="titulo-planos">
                        <div className={styles.container}>
                            <div className={`${styles.stackTight} ${styles.sectionHeadCenter}`}>
                                <span className={styles.eyebrow}>Planos</span>
                                <h2 id="titulo-planos" className={styles.h2}>Um plano paga o acesso. A comissão fica com você.</h2>
                                <p className={styles.lead}>Teste grátis por 10 minutos antes de assinar.</p>
                            </div>
                            <PlansSection plans={PLANS} />
                            <p className={styles.plansNote}>Sem fidelidade · Cancele pelo próprio painel · PIX, boleto ou cartão pelo Mercado Pago</p>
                        </div>
                    </section>
                )}

                {/* ── DÚVIDAS ── */}
                <section id="duvidas" className={`${styles.section} ${styles.sectionSoft}`} aria-labelledby="titulo-duvidas">
                    <div className={`${styles.container} ${styles.faqGrid}`}>
                        <div className={styles.stackTight}>
                            <span className={styles.eyebrow}>Dúvidas</span>
                            <h2 id="titulo-duvidas" className={styles.h2}>Perguntas frequentes</h2>
                            {whatsappUrl && (
                                <p className={styles.lead}>
                                    Não achou a resposta?{' '}
                                    <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={styles.faqLink}>Fale com a gente no WhatsApp</a>.
                                </p>
                            )}
                        </div>
                        <div className={styles.faqList}>
                            {DUVIDAS.map((d, i) => (
                                <details key={d.q} className={styles.faqItem} open={i === 0}>
                                    <summary className={styles.faqQ}>{d.q}<IconChevronDown /></summary>
                                    <p className={styles.faqA}>{d.a}</p>
                                </details>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── CHAMADA FINAL ── */}
                <section className={styles.cta} aria-labelledby="titulo-final">
                    <div className={`${styles.container} ${styles.ctaBand}`}>
                        <div className={styles.ctaCopy}>
                            <h2 id="titulo-final" className={`${styles.h2} ${styles.h2OnDark}`}>Pare de dividir a sua margem com a mesa.</h2>
                            <p className={`${styles.lead} ${styles.leadOnDark}`}>Veja o estoque completo agora. O teste é grátis e não pede cartão.</p>
                        </div>
                        <div className={styles.ctaActions}>
                            <OpenModalButton type="cliente" className={`${styles.btn} ${styles.btnLg} ${styles.btnGold} ${styles.btnBlock}`}>Testar grátis por 10 minutos</OpenModalButton>
                            {whatsappUrl && (
                                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={`${styles.btn} ${styles.btnLg} ${styles.btnOnDark} ${styles.btnBlock}`}>Falar no WhatsApp</a>
                            )}
                        </div>
                    </div>
                </section>
            </main>

            {/* ── RODAPÉ ── */}
            <footer className={styles.footer}>
                <div className={styles.container}>
                    <div className={styles.footerGrid}>
                        <div className={styles.footerBrand}>
                            <BrandLockup />
                            <p className={styles.footerBrandText}>Comércio Nacional de Veículos 0km. Lojistas e concessionárias negociando direto, sem intermediário.</p>
                        </div>
                        <div className={styles.footerCol}>
                            <span className={styles.footerColTitle}>Plataforma</span>
                            <OpenModalButton type="cliente" className={styles.footerLink}>Testar grátis</OpenModalButton>
                            <a href="/login" className={styles.footerLink}>Entrar</a>
                            <a href="#planos" className={styles.footerLink}>Planos</a>
                            <OpenModalButton type="concessionaria" className={styles.footerLink}>Cadastrar concessionária</OpenModalButton>
                        </div>
                        <div className={styles.footerCol}>
                            <span className={styles.footerColTitle}>Atendimento</span>
                            {whatsappUrl && (
                                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={styles.footerLink}>{formatBrazilPhone(contactConfig.whatsapp)}</a>
                            )}
                            {contactConfig.email_general && <a href={`mailto:${contactConfig.email_general}`} className={styles.footerLink}>{contactConfig.email_general}</a>}
                            {contactConfig.business_hours && <span className={styles.footerText}>{contactConfig.business_hours}</span>}
                        </div>
                        <div className={styles.footerCol}>
                            <span className={styles.footerColTitle}>Empresa</span>
                            {contactConfig.address && <span className={styles.footerText}>{contactConfig.address}</span>}
                            {contactConfig.cnpj && <span className={styles.footerText}>CNPJ {contactConfig.cnpj}</span>}
                            {contactConfig.email_sales && <a href={`mailto:${contactConfig.email_sales}`} className={styles.footerLink}>Comercial</a>}
                            {contactConfig.email_support && <a href={`mailto:${contactConfig.email_support}`} className={styles.footerLink}>Suporte</a>}
                        </div>
                    </div>
                    <div className={styles.footerBottom}>
                        <span>© {new Date().getFullYear()} CNV · Comércio Nacional de Veículos 0km · Desenvolvido por Hebert Sandinha</span>
                        <LegalButtons />
                    </div>
                </div>
            </footer>

            <RegisterModals />
            <LegalModals />
            {whatsappNumber && <FloatingWhatsAppClient whatsappNumber={whatsappNumber} />}
        </div>
    );
}
