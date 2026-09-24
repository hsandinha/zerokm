/**
 * Serviço de concessionárias usado pelo cadastro de veículos.
 * As antigas tabelas manuais de Marcas, Modelos e Cores foram removidas:
 * o catálogo (padronizado pela FIPE) é a referência.
 */
export interface Concessionaria {
    id?: string;
    nome: string;
    razaoSocial?: string;
    cnpj?: string;
    telefone?: string;
    celular?: string;
    contato?: string;
    email?: string;
    endereco?: string;
    numero?: string;
    complemento?: string;
    inscricaoEstadual?: string;
    bairro?: string;
    cidade?: string;
    uf?: string;
    cep?: string;
    nomeResponsavel?: string;
    telefoneResponsavel?: string;
    emailResponsavel?: string;
    observacoes?: string;
    ativo?: boolean;
    createdAt?: Date | string;
    updatedAt?: Date | string;
}

class TablesService {
    // ============= MÉTODOS DE CONCESSIONÁRIAS =============

    async getAllConcessionarias(): Promise<Concessionaria[]> {
        try {
            const response = await fetch('/api/concessionarias');
            if (!response.ok) throw new Error('Failed to fetch concessionarias');
            return await response.json();
        } catch (error) {
            console.error('Erro ao buscar concessionárias:', error);
            throw error;
        }
    }

    async addConcessionaria(concessionaria: Omit<Concessionaria, 'id'>): Promise<string> {
        try {
            const response = await fetch('/api/concessionarias', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(concessionaria)
            });
            if (!response.ok) throw new Error('Failed to add concessionaria');
            const data = await response.json();
            return data.id;
        } catch (error) {
            console.error('Erro ao adicionar concessionária:', error);
            throw error;
        }
    }

    async updateConcessionaria(id: string, updates: Partial<Concessionaria>): Promise<void> {
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

    async deleteConcessionaria(id: string): Promise<void> {
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

    async populateInitialConcessionarias(): Promise<void> {
        try {
            const existing = await this.getAllConcessionarias();
            if (existing.length > 0) return;

            const concessionariasIniciais = [
                {
                    nome: "Concessionária Premium Motors",
                    cnpj: "12.345.678/0001-90",
                    telefone: "(11) 3456-7890",
                    contato: "João Silva",
                    endereco: "Rua das Flores",
                    numero: "123",
                    cidade: "São Paulo",
                    bairro: "Jardins",
                    uf: "SP",
                    complemento: "Loja 1",
                    cep: "01234-567",
                    email: "contato@premium.com",
                    inscricaoEstadual: "123.456.789.000",
                    nomeResponsavel: "João Silva",
                    telefoneResponsavel: "(11) 99999-9999",
                    emailResponsavel: "joao@premium.com"
                },
                {
                    nome: "Auto Center Sul",
                    cnpj: "23.456.789/0001-01",
                    telefone: "(21) 2345-6789",
                    contato: "Maria Santos",
                    endereco: "Av. Copacabana",
                    numero: "456",
                    cidade: "Rio de Janeiro",
                    bairro: "Copacabana",
                    uf: "RJ",
                    complemento: "Sala 5",
                    cep: "22070-012",
                    email: "contato@autocenter.com",
                    inscricaoEstadual: "234.567.890.000",
                    nomeResponsavel: "Maria Santos",
                    telefoneResponsavel: "(21) 98888-8888",
                    emailResponsavel: "maria@autocenter.com"
                }
            ];

            for (const concessionaria of concessionariasIniciais) {
                await this.addConcessionaria(concessionaria);
            }
        } catch (error) {
            console.error('Erro ao popular concessionárias iniciais:', error);
            throw error;
        }
    }
}

export const tablesService = new TablesService();
