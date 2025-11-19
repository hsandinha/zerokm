import { Badge } from '../../../components/Badge';
import { SummaryCard } from '../../../components/SummaryCard';
import styles from '../page.module.css';

export default function AdminDashboard() {
    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1>Dashboard Administrativo</h1>
                <Badge variant="admin">Administrador</Badge>
            </div>

            <div className={styles.grid}>
                <SummaryCard
                    title="Total de Usuários"
                    value="1,234"
                    change="+12%"
                    trend="up"
                    icon="👥"
                />
                <SummaryCard
                    title="Concessionárias Ativas"
                    value="89"
                    change="+5%"
                    trend="up"
                    icon="🏢"
                />
                <SummaryCard
                    title="Veículos Cadastrados"
                    value="15,678"
                    change="+8%"
                    trend="up"
                    icon="🚗"
                />
                <SummaryCard
                    title="Vendas do Mês"
                    value="2,456"
                    change="+15%"
                    trend="up"
                    icon="💰"
                />
            </div>

            <div className={styles.section}>
                <h2>Controle Total do Sistema</h2>
                <p>Como administrador, você tem acesso completo para gerenciar todos os aspectos da plataforma Zero KM.</p>
            </div>
        </div>
    );
}