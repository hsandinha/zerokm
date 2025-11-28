export interface Concessionaria {
    id?: string;
    nome: string;
    razaoSocial: string;
    cnpj: string;
    inscricaoEstadual?: string;
    telefone: string;
    celular?: string;
    contato: string;
    email: string;
    endereco: string;
    numero: string;
    complemento?: string;
    bairro: string;
    cidade: string;
    uf: string;
    cep: string;
    nomeResponsavel: string;
    telefoneResponsavel: string;
    emailResponsavel?: string;
    observacoes?: string;
    ativo: boolean;
    dataCadastro?: string;
    criadoEm?: string;
}

const COLLECTION_NAME = 'concessionarias';

export class ConcessionariaService {
    // Adicionar nova concessionária
    static async addConcessionaria(concessionaria: Omit<Concessionaria, 'id'>): Promise<boolean> {
        try {
            const response = await fetch('/api/concessionarias', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(concessionaria)
            });
            if (!response.ok) throw new Error('Failed to add concessionaria');
            return true;
        } catch (error) {
            console.error('Erro ao adicionar concessionária:', error);
            throw error;
        }
    }

    // Buscar todas as concessionárias
    static async getAllConcessionarias(): Promise<Concessionaria[]> {
        try {
            const response = await fetch('/api/concessionarias');
            if (!response.ok) throw new Error('Failed to fetch concessionarias');
            return await response.json();
        } catch (error) {
            console.error('Erro ao buscar concessionárias:', error);
            throw error;
        }
    }

    // Atualizar concessionária
    static async updateConcessionaria(id: string, updates: Partial<Concessionaria>): Promise<void> {
        try {
            const response = await fetch(`/api/concessionarias/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });
            if (!response.ok) throw new Error('Failed to update concessionaria');
        } catch (error) {
            console.error('Erro ao atualizar concessionária:', error);
            throw error;
        }
    }

    // Deletar concessionária
    static async deleteConcessionaria(id: string): Promise<void> {
        try {
            const response = await fetch(`/api/concessionarias/${id}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error('Failed to delete concessionaria');
        } catch (error) {
            console.error('Erro ao deletar concessionária:', error);
            throw error;
        }
    }

    // Buscar concessionárias ativas
    static async getActiveConcessionarias(): Promise<Concessionaria[]> {
        try {
            const allConcessionarias = await this.getAllConcessionarias();
            return allConcessionarias.filter(c => c.ativo);
        } catch (error) {
            console.error('Erro ao buscar concessionárias ativas:', error);
            throw error;
        }
    }
}
