import { Badge } from '../../../components/Badge';
import { SummaryCard } from '../../../components/SummaryCard';
import styles from '../page.module.css';

export default function ClientDashboard() {
    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1>Meus Veículos Zero KM</h1>
                <Badge variant="client">Cliente</Badge>
            </div>

            <div className={styles.grid}>
                <SummaryCard
                    title="Favoritos"
                    value="8"
                    change="+2"
                    trend="up"
                    icon="❤️"
                />
                <SummaryCard
                    title="Propostas Enviadas"
                    value="3"
                    change="0"
                    trend="neutral"
                    icon="📤"
                />
                <SummaryCard
                    title="Test Drives Agendados"
                    value="2"
                    change="+1"
                    trend="up"
                    icon="🗓️"
                />
                <SummaryCard
                    title="Orçamento Máximo"
                    value="R$ 85k"
                    change="0"
                    trend="neutral"
                    icon="💳"
                />
            </div>

            <div className={styles.section}>
                <h2>Encontre seu Carro dos Sonhos</h2>
                <p>Explore nossa seleção de veículos zero quilômetro, compare preços e faça propostas diretamente às concessionárias.</p>
            </div>
        </div>
    );
}