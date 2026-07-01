export const BRAZIL_STATES = [
    'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO',
    'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR',
    'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'
];

export const STATUS_OPTIONS = ['A faturar', 'Refaturamento', 'Licenciado', 'Pedido de fábrica'];

export const YEAR_REGEX = /^\d{4}$/;

export const fuelLookup: Record<string, string> = {
    'flex': 'Flex',
    'gasolina': 'Gasolina',
    'etanol': 'Etanol',
    'alcool': 'Etanol',
    'álcool': 'Etanol',
    'diesel': 'Diesel',
    'eletrico': 'Elétrico',
    'elétrico': 'Elétrico',
    'hibrido': 'Híbrido',
    'híbrido': 'Híbrido'
};

export const transmissionLookup: Record<string, string> = {
    'manual': 'Manual',
    'automatico': 'Automático',
    'automático': 'Automático',
    'cvt': 'CVT'
};

export const statusLookup: Record<string, string> = {
    'a faturar': 'A faturar',
    'faturar': 'A faturar',
    'refaturamento': 'Refaturamento',
    'licenciado': 'Licenciado',
    'pedido de fabrica': 'Pedido de fábrica',
    'pedido de fábrica': 'Pedido de fábrica',
    'pedido': 'Pedido de fábrica'
};
