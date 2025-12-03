export interface Transportadora {
    id?: string;
    estado: string;
    valor: number;
    ativo: boolean;
    createdAt?: string;
    updatedAt?: string;
}

export class TransportadoraService {
    // Adicionar nova transportadora
    static async addTransportadora(transportadora: Omit<Transportadora, 'id'>): Promise<boolean> {
        try {
            const response = await fetch('/api/transportadoras', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(transportadora)
            });
            if (!response.ok) throw new Error('Failed to add transportadora');
            return true;
        } catch (error) {
            console.error('Erro ao adicionar transportadora:', error);
            throw error;
        }
    }

    // Buscar todas as transportadoras (agora usa paginação com limite alto)
    static async getAllTransportadoras(): Promise<Transportadora[]> {
        try {
            const response = await fetch('/api/transportadoras?limit=1000');
            if (!response.ok) throw new Error('Failed to fetch transportadoras');
            const result = await response.json();
            return result.data || [];
        } catch (error) {
            console.error('Erro ao buscar transportadoras:', error);
            throw error;
        }
    }

    // Buscar transportadoras paginadas
    static async getTransportadorasPaginated(params: {
        page: number;
        itemsPerPage: number;
        searchTerm?: string;
    }): Promise<{ data: Transportadora[]; total: number }> {
        try {
            const queryParams = new URLSearchParams({
                page: params.page.toString(),
                limit: params.itemsPerPage.toString(),
                search: params.searchTerm || ''
            });

            const response = await fetch(`/api/transportadoras?${queryParams.toString()}`);
            if (!response.ok) throw new Error('Failed to fetch transportadoras');

            const result = await response.json();
            return {
                data: result.data,
                total: result.total
            };
        } catch (error) {
            console.error('Erro ao buscar transportadoras paginadas:', error);
            throw error;
        }
    }

    // Atualizar transportadora
    static async updateTransportadora(id: string, updates: Partial<Transportadora>): Promise<void> {
        try {
            const response = await fetch(`/api/transportadoras/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });
            if (!response.ok) throw new Error('Failed to update transportadora');
        } catch (error) {
            console.error('Erro ao atualizar transportadora:', error);
            throw error;
        }
    }

    // Deletar transportadora
    static async deleteTransportadora(id: string): Promise<void> {
        try {
            const response = await fetch(`/api/transportadoras/${id}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error('Failed to delete transportadora');
        } catch (error) {
            console.error('Erro ao deletar transportadora:', error);
            throw error;
        }
    }

    // Buscar transportadoras ativas
    static async getActiveTransportadoras(): Promise<Transportadora[]> {
        try {
            const allTransportadoras = await this.getAllTransportadoras();
            return allTransportadoras.filter(t => t.ativo);
        } catch (error) {
            console.error('Erro ao buscar transportadoras ativas:', error);
            throw error;
        }
    }
}
