// Interface para os veículos atualizada
export interface Vehicle {
    id?: string;
    dataEntrada: Date | string;
    modelo: string;
    transmissao: 'Manual' | 'Automático' | 'CVT';
    combustivel: 'Flex' | 'Gasolina' | 'Etanol' | 'Diesel' | 'Elétrico' | 'Híbrido';
    cor: string;
    ano: string;
    opcionais: string;
    preco: number;
    status: 'A faturar' | 'Refaturamento' | 'Licenciado';
    observacoes: string;
    cidade: string;
    estado: string;
    concessionaria: string;
    telefone: string;
    nomeContato: string;
    operador: string;

    // Campos opcionais mantidos por compatibilidade ou uso futuro
    fotos?: string[];

    // Campos removidos (mantidos como opcionais para não quebrar código legado imediatamente, mas não serão usados)
    marca?: string;
    versao?: string;
    anoModelo?: string;
    chassi?: string;
    motor?: string;
    vendedor?: string; // Substituído por nomeContato
    quilometragem?: number;
    categoria?: string;
    descricao?: string;
}

export interface VehiclePaginationResult {
    data: Vehicle[];
    total: number;
    hasNextPage: boolean;
    lastDoc?: any; // Changed from QueryDocumentSnapshot to any as we don't use Firestore docs anymore
}

export interface VehiclePaginationOptions {
    page?: number;
    itemsPerPage?: number;
    lastDoc?: any;
    searchTerm?: string;
    filters?: {
        status?: string;
        marca?: string;
        combustivel?: string;
        transmissao?: string;
        ano?: string;
    };
    sortConfig?: {
        key: string;
        direction: 'asc' | 'desc';
    };
}

// Coleção de veículos
const VEHICLES_COLLECTION = 'vehicles';

export class VehicleService {
    // Adicionar um novo veículo
    static async addVehicle(vehicle: Omit<Vehicle, 'id'>): Promise<string> {
        try {
            const response = await fetch('/api/vehicles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(vehicle)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to add vehicle');
            }

            const newVehicle = await response.json();
            return newVehicle.id;
        } catch (error) {
            console.error('Erro ao adicionar veículo:', error);
            throw error;
        }
    }

    // Buscar todos os veículos
    static async getAllVehicles(): Promise<Vehicle[]> {
        try {
            const response = await fetch('/api/vehicles?limit=1000');
            if (!response.ok) throw new Error('Failed to fetch vehicles');
            const result = await response.json();
            return result.data;
        } catch (error) {
            console.error('Erro ao buscar veículos:', error);
            throw error;
        }
    }

    // Atualizar um veículo
    static async updateVehicle(id: string, updates: Partial<Vehicle>): Promise<void> {
        try {
            const response = await fetch(`/api/vehicles/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });
            if (!response.ok) throw new Error('Failed to update vehicle');
        } catch (error) {
            console.error('Erro ao atualizar veículo:', error);
            throw error;
        }
    }

    // Deletar um veículo
    static async deleteVehicle(id: string): Promise<void> {
        try {
            const response = await fetch(`/api/vehicles/${id}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error('Failed to delete vehicle');
        } catch (error) {
            console.error('Erro ao deletar veículo:', error);
            throw error;
        }
    }

    // Deletar múltiplos veículos
    static async deleteVehicles(ids: string[]): Promise<void> {
        try {
            const deletePromises = ids.map(id => this.deleteVehicle(id));
            await Promise.all(deletePromises);
        } catch (error) {
            console.error('Erro ao deletar veículos em massa:', error);
            throw error;
        }
    }

    // Limpar banco e reinserir dados
    static async clearAndResetDatabase(): Promise<void> {
        try {
            console.log('Iniciando limpeza do banco...');
            const allVehicles = await this.getAllVehicles();
            await this.deleteVehicles(allVehicles.map(v => v.id!));
            console.log('Banco limpo com sucesso!');
        } catch (error) {
            console.error('Erro ao limpar e resetar banco:', error);
            throw error;
        }
    }

    // Buscar por termo geral
    static async searchVehicles(term: string): Promise<Vehicle[]> {
        try {
            const response = await fetch(`/api/vehicles?search=${encodeURIComponent(term)}`);
            if (!response.ok) throw new Error('Failed to search vehicles');
            const result = await response.json();
            return result.data;
        } catch (error) {
            console.error('Erro ao buscar veículos:', error);
            throw error;
        }
    }

    // MÉTODOS DE PAGINAÇÃO
    static async getVehiclesPaginated(options: VehiclePaginationOptions = {}): Promise<VehiclePaginationResult> {
        const { page = 1, itemsPerPage = 50, searchTerm, filters = {}, sortConfig = { key: 'dataEntrada', direction: 'desc' } } = options;

        try {
            const params = new URLSearchParams();
            params.set('page', page.toString());
            params.set('limit', itemsPerPage.toString());
            if (searchTerm) params.set('search', searchTerm);
            if (sortConfig) {
                params.set('sortKey', sortConfig.key);
                params.set('sortDir', sortConfig.direction);
            }

            if (filters.status) params.set('status', filters.status);
            if (filters.marca) params.set('marca', filters.marca);
            if (filters.combustivel) params.set('combustivel', filters.combustivel);
            if (filters.transmissao) params.set('transmissao', filters.transmissao);
            if (filters.ano) params.set('ano', filters.ano);

            const response = await fetch(`/api/vehicles?${params.toString()}`);
            if (!response.ok) throw new Error('Failed to fetch paginated vehicles');

            const result = await response.json();

            return {
                data: result.data,
                total: result.total,
                hasNextPage: result.hasNextPage,
                lastDoc: null // Not used with API pagination
            };
        } catch (error) {
            console.error('Erro ao buscar veículos paginados:', error);
            throw error;
        }
    }
}
