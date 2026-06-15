import Link from 'next/link';
import Image from 'next/image';
import styles from './page.module.css';
import { OpenModalButton } from '@/components/lp/OpenModalButton';
import { RegisterModals } from '@/components/lp/RegisterModals';
import { LegalModals } from '@/components/lp/LegalModals';
import { LegalButtons } from '@/components/lp/LegalButtons';
import { ScrollReveal } from '@/components/lp/ScrollReveal';
import LandingFAQ from '@/components/lp/FAQ';
import TiltCard from '@/components/lp/TiltCard';
import { PlansSection, type PlanData } from '@/components/lp/PlansSection';
import { FloatingWhatsAppClient } from '@/components/lp/FloatingWhatsAppClient';
import connectDB from '@/lib/mongodb';
import PlanModel from '@/models/Plan';
import Vehicle from '@/models/Vehicle';
import mongoose from 'mongoose';

export const metadata = {
    title: 'CNV — Comércio Nacional de Veículos 0km',
    description: 'Sistema completo para concessionárias de veículos 0km. Catálogo digital, CRM, logística integrada e relatórios em tempo real.',
};

export const revalidate = 60; // 1 minute revalidation

const MARQUEE = [
    '500+ CONCESSIONÁRIAS ATIVAS',
    '12.000+ VEÍCULOS',
    '27 ESTADOS',
    'GESTÃO INTELIGENTE',
    'CRM AVANÇADO',
    'LOGÍSTICA INTEGRADA',
    'CONTROLE TOTAL',
    'PLATAFORMA NACIONAL',
];

const FEATURES = [
    {
        tag: 'MARGEM',
        title: 'Aumento da Margem de Lucro',
        desc: 'Elimine comissões para intermediários e retenha 100% do seu lucro em cada venda.',
    },
    {
        tag: 'CONEXÃO',
        title: 'Conexão Direta e Transparente',
        desc: 'Estabeleça parcerias diretas com concessionárias e tenha acesso a um estoque ilimitado de veículos 0km.',
    },
    {
        tag: 'ECONOMIA',
        title: 'Economia Significativa',
        desc: 'Economize até R$ 240 mil por ano em comissões, reinvestindo esse valor no seu negócio.',
    },
    {
        tag: 'AGILIDADE',
        title: 'Otimização de Tempo',
        desc: 'Agilize o processo de compra e venda, focando no que realmente importa: seus clientes.',
    },
];

const STEPS = [
    { num: '01', tag: 'CADASTRO', title: 'Crie sua conta', desc: 'Cadastro em minutos, sem burocracia. Escolha seu plano e acesse imediatamente.' },
    { num: '02', tag: 'CATÁLOGO', title: 'Acompanhe o catálogo', desc: 'Veículos adicionados individualmente ou importados em massa via CSV.' },
    { num: '03', tag: 'OPERAÇÃO', title: 'Gerencie em tempo real', desc: 'Acompanhe leads, clientes e logística pelo dashboard de qualquer dispositivo.' },
    { num: '04', tag: 'CRESCIMENTO', title: 'Escale seu negócio', desc: 'Use os dados da plataforma para tomar decisões estratégicas e expandir para todo o Brasil.' },
];

const STATS = [
    { num: '500+', label: 'Lojistas satisfeitos' },
    { num: 'R$80M+', label: 'Economizados em comissões' },
    { num: '27', label: 'Estados atendidos' },
    { num: '98%', label: 'Taxa de satisfação' },
];

const TESTIMONIALS = [
    {
        stars: 5,
        text: 'Agora compro direto das concessionárias e fico com 100% do meu lucro. Acabou a dependência das mesas. A CNV mudou completamente o modelo do meu negócio.',
        name: 'Carlos Mendes',
        role: 'Proprietário — Auto Premium',
        city: 'São Paulo, SP',
    },
    {
        stars: 5,
        text: 'Antes pagava em média R$1.500 de comissão para mesas por venda. Hoje economizo R$15 mil por mês — R$180 mil por ano. O que eu pagava em comissão virou carro no meu estoque.',
        name: 'Ricardo Almeida',
        role: 'Gerente Comercial — Mega Veículos',
        city: 'Rio de Janeiro, RJ',
    },
    {
        stars: 5,
        text: 'Triplicamos as vendas sem pagar um centavo de comissão. O melhor investimento que já fiz pra minha loja. O controle de logística entre estados é excepcional.',
        name: 'Fernando Silva',
        role: 'CEO — Silva Motors',
        city: 'Belo Horizonte, MG',
    },
    {
        stars: 5,
        text: 'Acabou a dependência das mesas. Agora consigo mais resultados e ainda dou desconto para meus clientes — porque não pago mais comissão para intermediários. Liberdade total.',
        name: 'Mariana Costa',
        role: 'Diretora — Top Car Veículos',
        city: 'Curitiba, PR',
    },
    {
        stars: 5,
        text: 'Economizei mais de R$200 mil no primeiro ano. A plataforma se pagou em menos de uma semana. Resultado surpreendente, suporte impecável.',
        name: 'Paula Souza',
        role: 'Sócia — Premium Auto Center',
        city: 'Porto Alegre, RS',
    },
    {
        stars: 5,
        text: 'Finalmente uma plataforma que pensa no lojista. Dashboard intuitivo, suporte excepcional e resultados reais desde o primeiro mês. Recomendo de olhos fechados.',
        name: 'Amanda Oliveira',
        role: 'Proprietária — Elite Motors',
        city: 'Brasília, DF',
    },
];

// Plans are loaded from DB at runtime

const FAQ_ITEMS = [
    { q: 'O plano Grátis tem limitações de tempo?', a: 'Sim. O acesso grátis permite testar a plataforma por 10 minutos. Depois desse período, é necessário escolher um plano e pagar via PIX ou cartão de crédito para continuar.' },
    { q: 'Posso importar meu estoque via planilha?', a: 'Sim! Os planos pagos incluem importação em massa via CSV. Disponibilizamos um modelo com todos os campos necessários. Suba centenas de veículos em minutos.' },
    { q: 'Como funciona a logística integrada?', a: 'Cadastre transportadoras, registre transferências entre estados, acompanhe status em tempo real e gere relatórios de frete — tudo em um único painel.' },
    { q: 'Existe suporte em português?', a: 'Sim, 100% em português. Atendemos via WhatsApp, e-mail e chat interno. Clientes nos planos pagos têm resposta prioritária com tempo de atendimento garantido.' },
    { q: 'Posso cancelar a qualquer momento?', a: 'Sim. Sem fidelidade ou multa por cancelamento. Cancele pelo próprio painel quando quiser, sem precisar entrar em contato com o suporte.' },
    { q: 'A plataforma funciona no celular?', a: 'Sim. Design responsivo para smartphones, tablets e computadores. Acesse de qualquer lugar, de manhã cedo até a última venda do dia.' },
];

function formatStockValue(val: number): string {
    if (val >= 1_000_000_000) return `R$ ${(val / 1_000_000_000).toFixed(1).replace('.', ',')}B`;
    if (val >= 1_000_000) return `R$ ${Math.round(val / 1_000_000)}M`;
    if (val >= 1_000) return `R$ ${Math.round(val / 1_000)}k`;
    return `R$ ${val.toLocaleString('pt-BR')}`;
}

function formatVehiclePrice(val: number): string {
    if (val >= 1_000_000) return `R$ ${(val / 1_000_000).toFixed(1).replace('.', ',')}M`;
    if (val >= 1_000) return `R$ ${Math.round(val / 1_000)}k`;
    return `R$ ${val.toLocaleString('pt-BR')}`;
}

function formatPrice(price: number) {
    if (price === 0) return 'Grátis';
    return `R$ ${price.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export default async function LandingPage() {
    // Fetch active plans from DB, sorted by price ascending
    let PLANS: PlanData[] = [];

    try {
        await connectDB();
        const dbPlans = await PlanModel.find({ active: true }).sort({ price: 1 }).lean();
        PLANS = dbPlans.map((p, i) => {
            const annualPrice = ((p as any).annualPrice as number | null | undefined) ?? null;
            const features = ((p as any).features as string[] | undefined) ?? [];
            const popular = ((p as any).popular as boolean | undefined) ?? false;
            const period = p.price === 0 ? '' : p.type === 'monthly' ? '/mês' : p.credits ? ` / ${p.credits} créditos` : '';
            return {
                id: (p._id as any).toString(),
                name: p.name,
                desc: p.description || (p.price === 0 ? 'Para explorar a plataforma' : p.type === 'monthly' ? 'Acesso mensal completo à plataforma' : `Pacote de ${p.credits ?? 0} créditos`),
                price: p.price,
                priceFormatted: formatPrice(p.price),
                annualPrice,
                period,
                highlight: popular,
                badge: popular ? 'Mais popular' : undefined,
                cta: p.price === 0 ? 'Começar grátis' : 'Assinar agora',
                features,
            };
        });
    } catch {
        // Fallback if DB is unreachable
        PLANS = [{
            id: 'gratis', name: 'Grátis', desc: 'Para explorar a plataforma',
            price: 0, priceFormatted: 'Grátis', annualPrice: null,
            period: '', highlight: false,
            cta: 'Começar grátis',
            features: [],
        }];
    }

    // Dashboard hero — real data from DB
    type TopModel = { name: string; estado: string; avgPrice: number; count: number };
    let dashData = {
        totalVehicles: 0,
        totalValue: 0,
        totalStates: 0,
        topModels: [] as TopModel[],
    };
    try {
        await connectDB();
        const [vcCount, vcValue, vcStates, vcTop] = await Promise.all([
            Vehicle.countDocuments(),
            Vehicle.aggregate([{ $group: { _id: null, total: { $sum: '$preco' } } }]),
            Vehicle.distinct('estado'),
            Vehicle.aggregate([
                { $group: { _id: '$modelo', count: { $sum: 1 }, avgPrice: { $avg: '$preco' }, estado: { $first: '$estado' } } },
                { $sort: { count: -1 } },
                { $limit: 4 },
            ]),
        ]);
        dashData.totalVehicles = vcCount;
        dashData.totalValue = vcValue[0]?.total ?? 0;
        dashData.totalStates = vcStates.length;
        dashData.topModels = vcTop.map((m: any) => ({
            name: m._id as string,
            estado: (m.estado as string ?? '').slice(0, 2).toUpperCase(),
            avgPrice: m.avgPrice as number,
            count: m.count as number,
        }));
    } catch {
        // keep zeros — UI handles empty gracefully
    }

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

    const marqueeItems = [...MARQUEE, ...MARQUEE];

    return (
        <div className={styles.page}>

            {/* ── NAV ── */}
            <nav className={styles.nav}>
                <div className={styles.navInner}>
                    <Image src="/images/logo.png" alt="CNV — Comércio Nacional de Veículos 0km" width={150} height={50} priority />
                    <div className={styles.navLinks}>
                        <a href="#recursos" className={styles.navLink}>Recursos</a>
                        <a href="#como-funciona" className={styles.navLink}>Como funciona</a>
                        <a href="#planos" className={styles.navLink}>Planos</a>
                        <a href="#faq" className={styles.navLink}>FAQ</a>
                    </div>
                    <div className={styles.navActions}>
                        <Link href="/login" className={styles.btnOutline}>Entrar</Link>
                        <OpenModalButton type="cliente" className={styles.btnPrimary}>Começar grátis</OpenModalButton>
                    </div>
                </div>
            </nav>

            {/* ── HERO ── */}
            <section className={styles.hero}>
                <video className={styles.heroBg} src="/video.mp4" autoPlay muted loop playsInline />
                {/* 3D Orbit rings — between video and overlay */}
                <div className={styles.heroOrbitWrap} aria-hidden="true">
                    <div className={`${styles.heroOrbit} ${styles.heroOrbit1}`} />
                    <div className={`${styles.heroOrbit} ${styles.heroOrbit2}`} />
                    <div className={`${styles.heroOrbit} ${styles.heroOrbit3}`} />
                    <div className={styles.heroParticle} />
                    <div className={styles.heroParticle} />
                    <div className={styles.heroParticle} />
                    <div className={styles.heroParticle} />
                    <div className={styles.heroParticle} />
                    <div className={styles.heroParticle} />
                </div>
                <div className={styles.heroOverlay} />
                <div className={styles.heroInner}>
                    {/* Left */}
                    <div className={styles.heroLeft}>
                        <span className={styles.heroBadge}>
                            <span className={styles.heroBadgeDot} />
                            0% de comissão para intermediários
                        </span>
                        <h1 className={styles.heroTitle}>
                            Pare de pagar<br />
                            comissão para<br />
                            <span className={styles.heroAccent}>mesas</span>
                        </h1>
                        <p className={styles.heroSub}>
                            Conectamos lojistas de carros 0km diretamente com as concessionárias.
                            Sem intermediários. Sem comissões.
                        </p>
                        <div className={styles.heroCtas}>
                            <OpenModalButton type="cliente" className={styles.heroCtaPrimary}>
                                Criar conta grátis
                                <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                                    <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                            </OpenModalButton>
                            <a href="#planos" className={styles.heroCtaSecondary}>Ver planos</a>
                        </div>
                        <div className={styles.heroTrust}>
                            <span className={styles.heroStars}>★★★★★</span>
                            <span className={styles.heroTrustText}><strong>4.9/5</strong> · 500+ lojistas satisfeitos</span>
                        </div>
                    </div>

                    {/* Right — Dashboard preview (3D tilt on hover) */}
                    <div className={styles.heroRight}>
                        <TiltCard className={styles.dashCard} intensity={10}>
                            <div className={styles.dashHeader}>
                                <span className={styles.dashTitle}>CNV Platform</span>
                                <span className={styles.dashLive}>
                                    <span className={styles.dashDot} />
                                    Ao vivo
                                </span>
                            </div>
                            <div className={styles.dashMetrics}>
                                <div className={styles.dashMetric}>
                                    <span className={styles.dashMetricNum}>{dashData.totalVehicles.toLocaleString('pt-BR')}</span>
                                    <span className={styles.dashMetricLabel}>Veículos</span>
                                </div>
                                <div className={styles.dashMetricSep} />
                                <div className={styles.dashMetric}>
                                    <span className={styles.dashMetricNum}>{formatStockValue(dashData.totalValue)}</span>
                                    <span className={styles.dashMetricLabel}>Estoque</span>
                                </div>
                                <div className={styles.dashMetricSep} />
                                <div className={styles.dashMetric}>
                                    <span className={styles.dashMetricNum}>{dashData.totalStates || '—'}</span>
                                    <span className={styles.dashMetricLabel}>Estados</span>
                                </div>
                            </div>
                            <div className={styles.dashProgressRow}>
                                <span className={styles.dashProgressLabel}>Consultas hoje</span>
                                <div className={styles.dashProgressTrack}>
                                    <div className={styles.dashProgressFill} style={{ width: '74%' }} />
                                </div>
                                <span className={styles.dashProgressPct}>74%</span>
                            </div>
                            <div className={styles.dashVehicleList}>
                                {dashData.topModels.length > 0 ? dashData.topModels.map((v, i) => (
                                    <div key={i} className={styles.dashVehicleRow}>
                                        <span className={styles.dashVehicleName}>{v.name}</span>
                                        <span className={styles.dashVehicleUf}>{v.estado}</span>
                                        <span className={styles.dashVehiclePrice}>{formatVehiclePrice(v.avgPrice)}</span>
                                        <span className={`${styles.dashVehicleStatus} ${styles.dashStatusOk}`}>
                                            ● {v.count} un.
                                        </span>
                                    </div>
                                )) : (
                                    <div className={styles.dashVehicleRow}>
                                        <span className={styles.dashVehicleName} style={{ opacity: 0.4 }}>Sem dados</span>
                                    </div>
                                )}
                            </div>
                        </TiltCard>
                    </div>
                </div>
            </section>

            {/* ── MARQUEE ── */}
            <div className={styles.marqueeWrap}>
                <div className={styles.marqueeTrack}>
                    {marqueeItems.map((item, i) => (
                        <span key={i} className={styles.marqueeItem}>
                            {item}
                            <span className={styles.marqueeDot}>·</span>
                        </span>
                    ))}
                </div>
            </div>

            {/* ── VIDEO ── */}
            <section className={styles.videoSection}>
                <div className={styles.sectionInner}>
                    <ScrollReveal>
                        <span className={styles.sectionLabel}>Veja em ação</span>
                        <h2 className={styles.sectionTitle}>A plataforma funcionando<br />na prática</h2>
                        <p className={styles.sectionSub}>Demonstração rápida de como a CNV conecta lojistas diretamente às concessionárias — sem intermediários, sem comissões.</p>
                    </ScrollReveal>
                    <ScrollReveal delay={150}>
                        <div className={styles.videoWrapper}>
                            <div className={styles.videoPhoneFrame}>
                                <iframe
                                    src="https://www.youtube.com/embed/cx0w8ICjMI4?rel=0&modestbranding=1&playsinline=1"
                                    title="CNV em ação"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                    allowFullScreen
                                    className={styles.videoEmbed}
                                />
                            </div>
                        </div>
                    </ScrollReveal>
                </div>
            </section>

            {/* ── FEATURES ── */}
            <section id="recursos" className={styles.features}>
                <div className={styles.sectionInner}>
                    <ScrollReveal>
                        <span className={styles.sectionLabel}>Por que usar a CNV</span>
                        <h2 className={styles.sectionTitle}>O fim das comissões para mesas</h2>
                        <p className={styles.sectionSub}>Conectamos lojistas diretamente com concessionárias. 0% de comissão para intermediários, 100% do lucro para você.</p>
                    </ScrollReveal>
                    <ScrollReveal delay={150}>
                        <div className={styles.featuresGrid}>
                            {FEATURES.map((f, i) => (
                                <TiltCard key={i} className={styles.featureCard}>
                                    <span className={styles.featureTag}>{f.tag}</span>
                                    <h3 className={styles.featureTitle}>{f.title}</h3>
                                    <p className={styles.featureDesc}>{f.desc}</p>
                                </TiltCard>
                            ))}
                        </div>
                    </ScrollReveal>
                </div>
            </section>

            {/* ── HOW IT WORKS ── */}
            <section id="como-funciona" className={styles.howItWorks}>
                <div className={styles.sectionInner}>
                    <ScrollReveal>
                        <span className={styles.sectionLabel}>Como funciona</span>
                        <h2 className={styles.sectionTitle}>Simples de começar,<br />poderoso para crescer</h2>
                        <p className={styles.sectionSub}>Em menos de 24 horas sua concessionária já está operando na plataforma.</p>
                    </ScrollReveal>
                    <ScrollReveal delay={150}>
                        <div className={styles.stepsGrid}>
                            {STEPS.map((s, i) => (
                                <div key={i} className={styles.stepCard}>
                                    <span className={styles.stepNum}>{s.num}</span>
                                    <span className={styles.stepTag}>{s.tag}</span>
                                    <h3 className={styles.stepTitle}>{s.title}</h3>
                                    <p className={styles.stepDesc}>{s.desc}</p>
                                </div>
                            ))}
                        </div>
                    </ScrollReveal>
                    <ScrollReveal delay={200}>
                        <div className={styles.stepsCtaRow}>
                            <OpenModalButton type="cliente" className={styles.heroCtaPrimary}>
                                Começe agora
                                <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                                    <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                            </OpenModalButton>
                        </div>
                    </ScrollReveal>
                </div>
            </section>

            {/* ── PARA QUEM É ── */}
            <section className={styles.audienceSection}>
                <div className={styles.sectionInner}>
                    <ScrollReveal>
                        <span className={styles.sectionLabel}>Para quem é</span>
                        <h2 className={styles.sectionTitle}>Dois lados, um só negócio</h2>
                        <p className={styles.sectionSub}>A CNV conecta os dois lados do mercado — eliminando intermediários e criando negócios diretos.</p>
                    </ScrollReveal>
                    <ScrollReveal delay={150}>
                        <div className={styles.audienceGrid}>
                            {/* Lojistas */}
                            <div className={styles.audienceCard}>
                                <span className={styles.audienceTag}>🚗 &nbsp;PARA LOJISTAS</span>
                                <h3 className={styles.audienceCardTitle}>Tenha acesso ao estoque de mais de 500 concessionárias</h3>
                                <p className={styles.audienceCardDesc}>Compre direto, sem mesa, sem comissão. Todo lucro fica com você.</p>
                                <ul className={styles.audienceList}>
                                    <li>✓ Mais de 12.000 veículos 0km disponíveis</li>
                                    <li>✓ 0% de comissão para intermediários</li>
                                    <li>✓ Economize até R$ 240 mil/ano</li>
                                    <li>✓ Conexão direta e transparente</li>
                                </ul>
                                <OpenModalButton type="cliente" className={styles.audienceCtaOutline}>Começar como lojista →</OpenModalButton>
                            </div>
                            {/* Concessionárias */}
                            <div className={`${styles.audienceCard} ${styles.audienceCardHighlight}`}>
                                <span className={`${styles.audienceTag} ${styles.audienceTagHighlight}`}>🏢 &nbsp;PARA CONCESSIONÁRIAS</span>
                                <h3 className={styles.audienceCardTitle}>Venda seus carros para o Brasil todo</h3>
                                <p className={styles.audienceCardDesc}>Cadastre seu estoque e alcance compradores em todos os 27 estados. Sua vitrine digital 24h no ar.</p>
                                <ul className={styles.audienceList}>
                                    <li>✓ Alcance nacional em um clique</li>
                                    <li>✓ Catálogo digital completo com fotos</li>
                                    <li>✓ Gestão de leads e CRM integrado</li>
                                    <li>✓ Logística e transferência integrada</li>
                                </ul>
                                <OpenModalButton type="concessionaria" className={styles.audienceCtaPrimary}>Cadastrar minha concessionária →</OpenModalButton>
                            </div>
                        </div>
                    </ScrollReveal>
                </div>
            </section>

            {/* ── STATS ── */}
            <section className={styles.statsSection}>
                <ScrollReveal>
                    <div className={styles.statsInner}>
                        {STATS.map((s, i) => (
                            <div key={i} className={styles.statBlock}>
                                <span className={styles.statNum}>{s.num}</span>
                                <span className={styles.statLabel}>{s.label}</span>
                            </div>
                        ))}
                    </div>
                </ScrollReveal>
            </section>

            {/* ── TESTIMONIALS ── */}
            <section className={styles.testimonials}>
                <div className={styles.sectionInner}>
                    <ScrollReveal>
                        <span className={styles.sectionLabel}>Depoimentos</span>
                        <h2 className={styles.sectionTitle}>Quem usa, recomenda</h2>
                        <p className={styles.sectionSub}>Lojistas de todo o Brasil já economizaram mais de R$80 milhões em comissões com a CNV.</p>
                    </ScrollReveal>
                    <ScrollReveal delay={150}>
                        <div className={styles.testimonialsGrid}>
                            {TESTIMONIALS.map((t, i) => (
                                <div key={i} className={styles.testimonialCard}>
                                    <div className={styles.testimonialStars}>{'★'.repeat(t.stars)}</div>
                                    <p className={styles.testimonialText}>&ldquo;{t.text}&rdquo;</p>
                                    <div className={styles.testimonialAuthor}>
                                        <div className={styles.testimonialAvatar}>{t.name[0]}</div>
                                        <div>
                                            <div className={styles.testimonialName}>{t.name}</div>
                                            <div className={styles.testimonialMeta}>{t.role} · {t.city}</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollReveal>
                </div>
            </section>

            {/* ── PLANS ── */}
            <section id="planos" className={styles.plans}>
                <div className={styles.sectionInner}>
                    <ScrollReveal>
                        <span className={styles.sectionLabel}>Planos</span>
                        <h2 className={styles.sectionTitle}>Escolha o plano ideal</h2>
                        <p className={styles.sectionSub}>Comece grátis e escale conforme crescer. Sem fidelidade, cancele quando quiser.</p>
                    </ScrollReveal>
                    <ScrollReveal delay={150}>
                        <PlansSection plans={PLANS} />
                    </ScrollReveal>
                    <p className={styles.planNote}>✓ Sem fidelidade &nbsp;·&nbsp; ✓ Cancele quando quiser &nbsp;·&nbsp; ✓ Suporte em português</p>
                </div>
            </section>

            {/* ── FAQ ── */}
            <section id="faq" className={styles.faqSection}>
                <div className={styles.sectionInner}>
                    <ScrollReveal>
                        <span className={styles.sectionLabel}>FAQ</span>
                        <h2 className={styles.sectionTitle}>Perguntas frequentes</h2>
                        <p className={styles.sectionSub}>Dúvidas sobre a plataforma? Encontre sua resposta aqui.</p>
                    </ScrollReveal>
                    <ScrollReveal delay={150}>
                        <LandingFAQ items={FAQ_ITEMS} />
                        <p className={styles.faqContact}>
                            Não encontrou sua resposta?{' '}
                            <a href="https://wa.me/5511926384826" target="_blank" rel="noopener noreferrer" className={styles.faqLink}>Fale conosco</a>
                        </p>
                    </ScrollReveal>
                </div>
            </section>

            {/* ── CTA FINAL ── */}
            <section className={styles.ctaBanner}>
                <div className={styles.ctaInner}>
                    <span className={styles.sectionLabel}>Pronto para começar?</span>
                    <h2 className={styles.ctaTitle}>Pronto para parar de<br />pagar comissões?</h2>
                    <p className={styles.ctaSub}>Junte-se a mais de 500 lojistas que já deixaram as mesas para trás. Cadastro gratuito, sem cartão de crédito.</p>
                    <div className={styles.ctaActions}>
                        <OpenModalButton type="cliente" className={styles.heroCtaPrimary}>
                            Criar conta grátis
                            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                                <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                        </OpenModalButton>
                        <a href="https://wa.me/5511926384826" target="_blank" rel="noopener noreferrer" className={styles.heroCtaSecondary}>Falar com vendas</a>
                    </div>
                    <div className={styles.ctaTrust}>
                        <span className={styles.ctaTrustItem}>🔒 SSL &amp; LGPD</span>
                        <span className={styles.ctaTrustItem}>🕐 Suporte 24/7</span>
                        <span className={styles.ctaTrustItem}>✓ Sem fidelidade</span>
                        <span className={styles.ctaTrustItem}>💳 Cancele quando quiser</span>
                    </div>
                </div>
            </section>

            {/* ── FOOTER ── */}
            <footer className={styles.footer}>
                <div className={styles.footerInner}>
                    <div className={styles.footerTop}>
                        <div className={styles.footerBrand}>
                            <Image src="/images/logo.png" alt="CNV — Comércio Nacional de Veículos 0km" width={140} height={47} />
                            <p className={styles.footerTagline}>Comércio Nacional de Veículos 0km.<br />A plataforma que conecta concessionárias ao Brasil.</p>
                        </div>
                        <div className={styles.footerCols}>
                            <div className={styles.footerCol}>
                                <h4 className={styles.footerColTitle}>Plataforma</h4>
                                <OpenModalButton type="cliente" className={styles.footerLink}>Criar conta</OpenModalButton>
                                <Link href="/login" className={styles.footerLink}>Entrar</Link>
                                <a href="#planos" className={styles.footerLink}>Planos</a>
                                <a href="#recursos" className={styles.footerLink}>Recursos</a>
                            </div>
                            <div className={styles.footerCol}>
                                <h4 className={styles.footerColTitle}>Suporte</h4>
                                <a href="#faq" className={styles.footerLink}>FAQ</a>
                                {contactConfig.email_support && <a href={`mailto:${contactConfig.email_support}`} className={styles.footerLink}>Suporte</a>}
                                {contactConfig.email_sales && <a href={`mailto:${contactConfig.email_sales}`} className={styles.footerLink}>Vendas</a>}
                            </div>
                            <div className={styles.footerCol}>
                                <h4 className={styles.footerColTitle}>Contato</h4>
                                {contactConfig.whatsapp && (() => {
                                    const raw = contactConfig.whatsapp.replace(/\D/g, '');
                                    let formatted = contactConfig.whatsapp;
                                    if (raw.length === 13 && raw.startsWith('55')) {
                                        formatted = `(${raw.substring(2, 4)}) ${raw.substring(4, 9)}-${raw.substring(9)}`;
                                    } else if (raw.length === 11) {
                                        formatted = `(${raw.substring(0, 2)}) ${raw.substring(2, 7)}-${raw.substring(7)}`;
                                    }
                                    return (
                                        <a href={`https://wa.me/${contactConfig.whatsapp}`} target="_blank" rel="noopener noreferrer" className={styles.footerLink}>
                                            {formatted}
                                        </a>
                                    );
                                })()}
                                {contactConfig.email_general && <a href={`mailto:${contactConfig.email_general}`} className={styles.footerLink}>{contactConfig.email_general}</a>}
                                {contactConfig.address && <span className={styles.footerContactInfo}>{contactConfig.address}</span>}
                                {contactConfig.business_hours && <span className={styles.footerContactInfo}>{contactConfig.business_hours}</span>}
                                {contactConfig.cnpj && <span className={styles.footerContactInfo} style={{ whiteSpace: 'nowrap' }}>CNPJ: {contactConfig.cnpj}</span>}
                            </div>
                        </div>
                    </div>
                    <div className={styles.footerBottom}>
                        <p className={styles.footerCopy}>© {new Date().getFullYear()} CNV — Comércio Nacional de Veículos 0km. Todos os direitos reservados.</p>
                        <LegalButtons />
                    </div>
                    <div className={styles.footerDev}>
                        Desenvolvido por <span className={styles.footerDevName}>Hebert Sandinha</span>
                    </div>
                </div>
            </footer>
            <RegisterModals />
            <LegalModals />
            {contactConfig.whatsapp && <FloatingWhatsAppClient whatsappNumber={contactConfig.whatsapp} />}
        </div>
    );
}
