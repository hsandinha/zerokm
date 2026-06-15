'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import styles from '@/components/lp/RegisterModals.module.css';
import legalStyles from './LegalModals.module.css';

type LegalType = 'termos' | 'privacidade';

// ── Termos de Uso ────────────────────────────────────────────────

function TermosContent() {
    return (
        <div className={legalStyles.legalBody}>
            <div className={legalStyles.legalHeader}>
                <Image src="/images/logo.png" alt="CNV" width={120} height={40} priority />
                <h1 className={legalStyles.legalTitle}>Termos de Uso</h1>
                <p className={legalStyles.legalMeta}>Última atualização: 03 de abril de 2026</p>
            </div>

            <section className={legalStyles.section}>
                <h2 className={legalStyles.sectionTitle}>1. Aceitação dos Termos</h2>
                <p>Ao acessar ou utilizar a plataforma CNV — Comércio Nacional de Veículos 0km ("Plataforma"), você concorda com estes Termos de Uso. Se não concordar, não utilize a Plataforma.</p>
            </section>

            <section className={legalStyles.section}>
                <h2 className={legalStyles.sectionTitle}>2. Sobre a Plataforma</h2>
                <p>A CNV é uma plataforma digital que conecta concessionárias de veículos zero quilômetro a compradores em todo o Brasil. Oferecemos ferramentas de gestão de estoque, CRM, logística integrada e relatórios de desempenho.</p>
                <p>A plataforma é operada por CNV — Comércio Nacional de Veículos 0km, CNPJ: 64.467.246/0001-50, com sede em São Paulo/SP.</p>
            </section>

            <section className={legalStyles.section}>
                <h2 className={legalStyles.sectionTitle}>3. Cadastro e Conta</h2>
                <ul className={legalStyles.list}>
                    <li>Você é responsável pela veracidade das informações fornecidas no cadastro.</li>
                    <li>É vedado criar conta em nome de terceiros sem autorização expressa.</li>
                    <li>Mantenha suas credenciais de acesso em sigilo. A CNV não se responsabiliza por acessos indevidos decorrentes de negligência do usuário.</li>
                    <li>Cada usuário pode possuir somente uma conta ativa na plataforma.</li>
                </ul>
            </section>

            <section className={legalStyles.section}>
                <h2 className={legalStyles.sectionTitle}>4. Uso Permitido</h2>
                <p>A Plataforma deve ser utilizada exclusivamente para fins legítimos relacionados à compra, venda e gestão de veículos 0km. É expressamente proibido:</p>
                <ul className={legalStyles.list}>
                    <li>Publicar informações falsas, enganosas ou fraudulentas sobre veículos.</li>
                    <li>Utilizar a Plataforma para atividades ilegais ou que violem direitos de terceiros.</li>
                    <li>Realizar engenharia reversa, scraping ou extrair dados da Plataforma sem autorização.</li>
                    <li>Transmitir vírus, malware ou qualquer código malicioso.</li>
                    <li>Tentar acessar áreas restritas da Plataforma sem autorização.</li>
                </ul>
            </section>

            <section className={legalStyles.section}>
                <h2 className={legalStyles.sectionTitle}>5. Responsabilidades das Concessionárias</h2>
                <ul className={legalStyles.list}>
                    <li>As concessionárias são integralmente responsáveis pelas informações sobre veículos cadastrados em seus estoques.</li>
                    <li>Preços, disponibilidade e condições de venda são de exclusiva responsabilidade de cada concessionária.</li>
                    <li>A CNV atua como intermediadora tecnológica e não é parte nas transações comerciais entre concessionárias e compradores.</li>
                </ul>
            </section>

            <section className={legalStyles.section}>
                <h2 className={legalStyles.sectionTitle}>6. Propriedade Intelectual</h2>
                <p>Todo o conteúdo da Plataforma — incluindo textos, logotipos, interfaces, código-fonte e funcionalidades — é propriedade da CNV e está protegido pelas leis de propriedade intelectual.</p>
            </section>

            <section className={legalStyles.section}>
                <h2 className={legalStyles.sectionTitle}>7. Limitação de Responsabilidade</h2>
                <p>A CNV não se responsabiliza por danos diretos, indiretos ou consequenciais decorrentes do uso ou da impossibilidade de uso da Plataforma, incluindo falhas técnicas temporárias, perda de dados ou interrupções de serviço.</p>
            </section>

            <section className={legalStyles.section}>
                <h2 className={legalStyles.sectionTitle}>8. Suspensão e Encerramento</h2>
                <p>A CNV reserva-se o direito de suspender ou encerrar contas que violem estes Termos, sem aviso prévio, a seu exclusivo critério.</p>
            </section>

            <section className={legalStyles.section}>
                <h2 className={legalStyles.sectionTitle}>9. Alterações nos Termos</h2>
                <p>Estes Termos podem ser alterados a qualquer momento. Notificaremos usuários cadastrados sobre mudanças relevantes. O uso continuado da Plataforma após alterações implica aceitação dos novos termos.</p>
            </section>

            <section className={legalStyles.section}>
                <h2 className={legalStyles.sectionTitle}>10. Foro e Lei Aplicável</h2>
                <p>Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro da Comarca de São Paulo/SP para dirimir quaisquer controvérsias.</p>
            </section>

            <section className={legalStyles.section}>
                <h2 className={legalStyles.sectionTitle}>11. Contato</h2>
                <p>Dúvidas sobre estes Termos: <a href="mailto:cnv0kmsp@gmail.com" className={legalStyles.link}>cnv0kmsp@gmail.com</a></p>
            </section>
        </div>
    );
}

// ── Política de Privacidade & LGPD ──────────────────────────────

function PrivacidadeContent() {
    return (
        <div className={legalStyles.legalBody}>
            <div className={legalStyles.legalHeader}>
                <Image src="/images/logo.png" alt="CNV" width={120} height={40} priority />
                <h1 className={legalStyles.legalTitle}>Política de Privacidade e LGPD</h1>
                <p className={legalStyles.legalMeta}>Última atualização: 03 de abril de 2026</p>
            </div>

            <section className={legalStyles.section}>
                <h2 className={legalStyles.sectionTitle}>1. Controlador dos Dados</h2>
                <p>CNV — Comércio Nacional de Veículos 0km<br />CNPJ: 64.467.246/0001-50<br />São Paulo, SP<br />E-mail: <a href="mailto:cnv0kmsp@gmail.com" className={legalStyles.link}>cnv0kmsp@gmail.com</a><br />Telefone: (11) 92638-4826</p>
            </section>

            <section className={legalStyles.section}>
                <h2 className={legalStyles.sectionTitle}>2. Dados Coletados</h2>
                <p>Coletamos as seguintes categorias de dados pessoais:</p>
                <ul className={legalStyles.list}>
                    <li><strong>Dados de identificação:</strong> nome completo, CPF/CNPJ, razão social.</li>
                    <li><strong>Dados de contato:</strong> e-mail, telefone, celular, endereço.</li>
                    <li><strong>Dados de acesso:</strong> log de autenticação, endereço IP, dispositivo e navegador.</li>
                    <li><strong>Dados transacionais:</strong> histórico de consultas, pedidos e operações realizadas na Plataforma.</li>
                    <li><strong>Dados de uso:</strong> interações com a interface, páginas visitadas e tempo de sessão.</li>
                </ul>
            </section>

            <section className={legalStyles.section}>
                <h2 className={legalStyles.sectionTitle}>3. Finalidade do Tratamento</h2>
                <p>Seus dados são tratados para:</p>
                <ul className={legalStyles.list}>
                    <li>Criação e gestão de conta na Plataforma.</li>
                    <li>Prestação dos serviços contratados.</li>
                    <li>Comunicações sobre atualizações, novidades e suporte.</li>
                    <li>Cumprimento de obrigações legais e regulatórias.</li>
                    <li>Prevenção a fraudes e segurança da Plataforma.</li>
                    <li>Melhoria contínua dos serviços mediante análise de dados agregados.</li>
                </ul>
            </section>

            <section className={legalStyles.section}>
                <h2 className={legalStyles.sectionTitle}>4. Base Legal (LGPD — Lei 13.709/2018)</h2>
                <p>O tratamento de dados é realizado com base nas seguintes hipóteses legais previstas na LGPD:</p>
                <ul className={legalStyles.list}>
                    <li><strong>Execução de contrato</strong> (art. 7º, V) — para a prestação dos serviços acordados.</li>
                    <li><strong>Legítimo interesse</strong> (art. 7º, IX) — para segurança, prevenção a fraudes e melhorias na Plataforma.</li>
                    <li><strong>Cumprimento de obrigação legal</strong> (art. 7º, II) — quando exigido por lei ou autoridade competente.</li>
                    <li><strong>Consentimento</strong> (art. 7º, I) — para comunicações de marketing, quando aplicável.</li>
                </ul>
            </section>

            <section className={legalStyles.section}>
                <h2 className={legalStyles.sectionTitle}>5. Compartilhamento de Dados</h2>
                <p>Seus dados podem ser compartilhados com:</p>
                <ul className={legalStyles.list}>
                    <li><strong>Concessionárias parceiras</strong> — apenas quando necessário para concluir uma operação solicitada pelo usuário.</li>
                    <li><strong>Prestadores de serviço</strong> — como provedores de infraestrutura em nuvem, sujeitos a obrigações contratuais de confidencialidade.</li>
                    <li><strong>Autoridades competentes</strong> — quando exigido por lei, decisão judicial ou regulatória.</li>
                </ul>
                <p>Não vendemos, alugamos ou cedemos dados pessoais para fins publicitários de terceiros.</p>
            </section>

            <section className={legalStyles.section}>
                <h2 className={legalStyles.sectionTitle}>6. Retenção de Dados</h2>
                <p>Os dados são mantidos pelo período necessário à prestação dos serviços ou ao cumprimento de obrigações legais, e eliminados de forma segura quando não mais necessários.</p>
            </section>

            <section className={legalStyles.section}>
                <h2 className={legalStyles.sectionTitle}>7. Seus Direitos (LGPD, art. 18)</h2>
                <p>Como titular dos dados, você tem direito a:</p>
                <ul className={legalStyles.list}>
                    <li>Confirmar a existência e acessar seus dados.</li>
                    <li>Solicitar correção de dados incompletos, inexatos ou desatualizados.</li>
                    <li>Solicitar a anonimização, bloqueio ou eliminação de dados desnecessários.</li>
                    <li>Revogar o consentimento a qualquer momento.</li>
                    <li>Solicitar a portabilidade dos dados a outro fornecedor.</li>
                    <li>Peticionar perante a Autoridade Nacional de Proteção de Dados (ANPD).</li>
                </ul>
                <p>Para exercer seus direitos, entre em contato: <a href="mailto:cnv0kmsp@gmail.com" className={legalStyles.link}>cnv0kmsp@gmail.com</a></p>
            </section>

            <section className={legalStyles.section}>
                <h2 className={legalStyles.sectionTitle}>8. Segurança</h2>
                <p>Adotamos medidas técnicas e organizacionais adequadas para proteger seus dados contra acesso não autorizado, alteração, divulgação ou destruição, incluindo criptografia e controle de acesso baseado em perfis.</p>
            </section>

            <section className={legalStyles.section}>
                <h2 className={legalStyles.sectionTitle}>9. Cookies</h2>
                <p>Utilizamos cookies e tecnologias similares para manter sessões autenticadas, analisar o uso da Plataforma e melhorar a experiência do usuário. Você pode desabilitar cookies nas configurações do seu navegador, o que pode afetar funções da Plataforma.</p>
            </section>

            <section className={legalStyles.section}>
                <h2 className={legalStyles.sectionTitle}>10. Alterações nesta Política</h2>
                <p>Esta Política pode ser atualizada periodicamente. Recomendamos revisá-la regularmente. Alterações significativas serão comunicadas por e-mail ou notificação na Plataforma.</p>
            </section>
        </div>
    );
}

// ── Modal wrapper ────────────────────────────────────────────────

export function LegalModals() {
    const [open, setOpen] = useState<LegalType | null>(null);

    const onOpen = useCallback((e: Event) => {
        const type = (e as CustomEvent<{ type: LegalType }>).detail?.type;
        if (type) setOpen(type);
    }, []);

    useEffect(() => {
        window.addEventListener('open-legal', onOpen);
        return () => window.removeEventListener('open-legal', onOpen);
    }, [onOpen]);

    useEffect(() => {
        if (open) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [open]);

    if (!open) return null;

    return (
        <div className={styles.backdrop} onClick={() => setOpen(null)}>
            <div
                className={styles.modal}
                style={{ maxWidth: 720 }}
                onClick={e => e.stopPropagation()}
            >
                <button
                    className={styles.closeBtn}
                    onClick={() => setOpen(null)}
                    aria-label="Fechar"
                >
                    ✕
                </button>
                <div className={styles.modalBody}>
                    {open === 'termos' && <TermosContent />}
                    {open === 'privacidade' && <PrivacidadeContent />}
                </div>
            </div>
        </div>
    );
}
