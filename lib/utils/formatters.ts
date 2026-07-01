export const normalizeString = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export const formatDate = (dateInput: string | Date | undefined) => {
    if (!dateInput) return '';
    try {
        if (dateInput instanceof Date) {
            return dateInput.toLocaleDateString('pt-BR');
        }
        const date = new Date(dateInput);
        if (isNaN(date.getTime())) return dateInput;
        return date.toLocaleDateString('pt-BR');
    } catch (e) {
        return typeof dateInput === 'string' ? dateInput : '';
    }
};

export const formatDateForInput = (dateInput: string | Date | undefined) => {
    if (!dateInput) return '';
    if (dateInput instanceof Date) {
        if (isNaN(dateInput.getTime())) return '';
        return dateInput.toISOString().slice(0, 10);
    }
    const trimmed = dateInput.trim();
    const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match) {
        const [, dd, mm, yyyy] = match;
        return `${yyyy}-${mm}-${dd}`;
    }
    const parsed = new Date(trimmed);
    if (isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
};

export const calculateDaysSinceUpdate = (updatedAt: string | Date | undefined): number => {
    if (!updatedAt) return 0;
    const now = new Date();
    now.setHours(0, 0, 0, 0); 
    const updateDate = new Date(updatedAt);
    updateDate.setHours(0, 0, 0, 0); 
    const diffTime = Math.abs(now.getTime() - updateDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
};

export const getUpdateStatusColor = (days: number): string => {
    if (days <= 1) return '#10b981'; // Verde
    if (days <= 3) return '#f59e0b'; // Amarelo
    return '#ef4444'; // Vermelho
};

export const getStatusColor = (status: string | undefined) => {
    switch (status?.toLowerCase()) {
        case 'a faturar':
            return 'bg-green-100 text-green-800';
        case 'faturar':
            return 'bg-green-100 text-green-800';
        case 'refaturamento':
            return 'bg-yellow-100 text-yellow-800';
        case 'licenciado':
            return 'bg-blue-100 text-blue-800';
        case 'pedido de fabrica':
            return 'bg-purple-100 text-purple-800';
        case 'pedido de fábrica':
            return 'bg-purple-100 text-purple-800';
        case 'pedido':
            return 'bg-purple-100 text-purple-800';
        default:
            return 'bg-gray-100 text-gray-800';
    }
};
