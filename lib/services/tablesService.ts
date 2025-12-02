import { VehicleService } from './vehicleService';

export interface Marca {
    id?: string;
    nome: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
}

export interface Modelo {
    id?: string;
    nome: string;
    marca: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
}

export interface Cor {
    id?: string;
    nome: string;
    hex?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
}

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

export interface PaginationResult<T> {
    data: T[];
    total: number;
    hasNextPage: boolean;
    lastDoc?: any;
}

export interface PaginationOptions {
    page?: number;
    itemsPerPage?: number;
    lastDoc?: any;
}

class TablesService {
    // MARCAS
    async addMarca(marcaData: Omit<Marca, 'id'>): Promise<string> {
        try {
            const response = await fetch('/api/tables/marcas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(marcaData)
            });
            if (!response.ok) throw new Error('Failed to add marca');
            const data = await response.json();
            return data.id;
        } catch (error) {
            console.error('Erro ao adicionar marca:', error);
            throw error;
        }
    }

    async getAllMarcas(): Promise<Marca[]> {
        try {
            const response = await fetch('/api/tables/marcas');
            if (!response.ok) throw new Error('Failed to fetch marcas');
            return await response.json();
        } catch (error) {
            console.error('Erro ao buscar marcas:', error);
            throw error;
        }
    }

    async updateMarca(id: string, marcaData: Omit<Marca, 'id'>): Promise<void> {
        try {
            const response = await fetch(`/api/tables/marcas/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(marcaData)
            });
            if (!response.ok) throw new Error('Failed to update marca');
        } catch (error) {
            console.error('Erro ao atualizar marca:', error);
            throw error;
        }
    }

    async deleteMarca(id: string): Promise<void> {
        try {
            const response = await fetch(`/api/tables/marcas/${id}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error('Failed to delete marca');
        } catch (error) {
            console.error('Erro ao excluir marca:', error);
            throw error;
        }
    }

    // MODELOS
    async addModelo(modeloData: Omit<Modelo, 'id'>): Promise<string> {
        try {
            const response = await fetch('/api/tables/modelos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(modeloData)
            });
            if (!response.ok) throw new Error('Failed to add modelo');
            const data = await response.json();
            return data.id;
        } catch (error) {
            console.error('Erro ao adicionar modelo:', error);
            throw error;
        }
    }

    async getAllModelos(): Promise<Modelo[]> {
        try {
            const response = await fetch('/api/tables/modelos');
            if (!response.ok) throw new Error('Failed to fetch modelos');
            return await response.json();
        } catch (error) {
            console.error('Erro ao buscar modelos:', error);
            throw error;
        }
    }

    async updateModelo(id: string, modeloData: Omit<Modelo, 'id'>): Promise<void> {
        try {
            const response = await fetch(`/api/tables/modelos/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(modeloData)
            });
            if (!response.ok) throw new Error('Failed to update modelo');
        } catch (error) {
            console.error('Erro ao atualizar modelo:', error);
            throw error;
        }
    }

    async deleteModelo(id: string): Promise<void> {
        try {
            const response = await fetch(`/api/tables/modelos/${id}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error('Failed to delete modelo');
        } catch (error) {
            console.error('Erro ao excluir modelo:', error);
            throw error;
        }
    }

    // CORES
    async addCor(corData: Omit<Cor, 'id'>): Promise<string> {
        try {
            const response = await fetch('/api/tables/cores', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(corData)
            });
            if (!response.ok) throw new Error('Failed to add cor');
            const data = await response.json();
            return data.id;
        } catch (error) {
            console.error('Erro ao adicionar cor:', error);
            throw error;
        }
    }

    async getAllCores(): Promise<Cor[]> {
        try {
            const response = await fetch('/api/tables/cores');
            if (!response.ok) throw new Error('Failed to fetch cores');
            return await response.json();
        } catch (error) {
            console.error('Erro ao buscar cores:', error);
            throw error;
        }
    }

    async updateCor(id: string, corData: Omit<Cor, 'id'>): Promise<void> {
        try {
            const response = await fetch(`/api/tables/cores/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(corData)
            });
            if (!response.ok) throw new Error('Failed to update cor');
        } catch (error) {
            console.error('Erro ao atualizar cor:', error);
            throw error;
        }
    }

    async deleteCor(id: string): Promise<void> {
        try {
            const response = await fetch(`/api/tables/cores/${id}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error('Failed to delete cor');
        } catch (error) {
            console.error('Erro ao excluir cor:', error);
            throw error;
        }
    }

    // Função para importação massiva de modelos
    async importModelosFromCSV(
        csvData: string,
        onProgress?: (current: number, total: number) => void
    ): Promise<{ success: number; headers?: string[]; errors: Array<{ line: number; reason: string; raw?: string; columns?: string[] }> }> {
        const lines = csvData.split('\n').filter(line => line.trim());
        const totalLines = lines.length - 1; // Exclui cabeçalho
        const headerLine = lines[0] || '';
        const separator = headerLine.includes(';') ? ';' : ',';
        const headers = headerLine.split(separator).map(h => h.trim().replace(/"/g, ''));
        const results: { success: number; headers?: string[]; errors: Array<{ line: number; reason: string; raw?: string; columns?: string[] }> } = { success: 0, headers, errors: [] };

        try {
            console.log('Iniciando importação de modelos...');

            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                if (onProgress) {
                    onProgress(i, totalLines);
                }

                const [marca, modelo] = line.split(separator).map(item => item.trim().replace(/"/g, ''));

                if (!marca || !modelo) {
                    results.errors.push({ line: i + 1, reason: `Dados incompletos - Marca: "${marca}", Modelo: "${modelo}"`, raw: line });
                    continue;
                }

                try {
                    await this.addModelo({
                        nome: modelo.toUpperCase(),
                        marca: marca.toUpperCase()
                    });
                    results.success++;
                } catch (error) {
                    results.errors.push({ line: i + 1, reason: `Erro ao adicionar ${marca} - ${modelo}: ${error}`, raw: line });
                }
            }

            return results;
        } catch (error) {
            console.error('Erro na importação:', error);
            throw error;
        }
    }

    // Função para importação massiva de veículos
    async importVeiculosFromCSV(
        csvData: string,
        onProgress?: (current: number, total: number) => void
    ): Promise<{ success: number; errors: string[] }> {
        const lines = csvData.split('\n').filter(line => line.trim());
        const totalLines = lines.length - 1;
        const headerLine = lines[0] || '';
        const separator = headerLine.includes(';') ? ';' : ',';
        const headers = headerLine.split(separator).map(h => h.trim().replace(/"/g, ''));
        const results = { success: 0, headers, errors: [] as Array<{ line: number; reason: string; raw?: string; columns?: string[] }> };

        try {
            console.log('Iniciando importação de veículos...');

            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                if (onProgress) {
                    onProgress(i, totalLines);
                }

                const columns = line.split(separator).map(item => item.trim().replace(/"/g, ''));

                if (columns.length < 16) {
                    results.errors.push({ line: i + 1, reason: `Dados insuficientes - esperado 16 colunas, encontradas ${columns.length}`, raw: line, columns });
                    continue;
                }

                const [
                    dataEntrada, modelo, transmissao, combustivel, cor, ano, opcionais, precoStr,
                    status, observacoes, cidade, estado, concessionaria, telefone, nomeContato, operador
                ] = columns;

                if (!modelo || !concessionaria || !cidade || !estado || !nomeContato || !telefone) {
                    results.errors.push({ line: i + 1, reason: 'Campos obrigatórios em branco', raw: line, columns });
                    continue;
                }

                try {
                    const preco = precoStr ? parseFloat(precoStr.replace(/[^\d.-]/g, '')) : 0;

                    // Normaliza e valida STATUS - gera erro se inválido
                    const normalizeStatus = (s?: string): 'A faturar' | 'Refaturamento' | 'Licenciado' => {
                        if (!s || !s.trim()) {
                            throw new Error('Status não pode ser vazio');
                        }
                        const normalized = s.trim().toUpperCase();
                        if (normalized === 'A FATURAR' || normalized === 'AFATURAR') return 'A faturar';
                        if (normalized === 'REFATURAMENTO') return 'Refaturamento';
                        if (normalized === 'LICENCIADO') return 'Licenciado';
                        throw new Error(`Status inválido: "${s}". Use: A FATURAR, REFATURAMENTO ou LICENCIADO`);
                    };

                    // Normaliza e valida COMBUSTÍVEL - gera erro se inválido
                    const normalizeCombustivel = (c?: string): 'Flex' | 'Gasolina' | 'Etanol' | 'Diesel' | 'Elétrico' | 'Híbrido' => {
                        if (!c || !c.trim()) {
                            throw new Error('Combustível não pode ser vazio');
                        }
                        const normalized = c.trim().toUpperCase();
                        if (normalized === 'FLEX') return 'Flex';
                        if (normalized === 'GASOLINA') return 'Gasolina';
                        if (normalized === 'ETANOL' || normalized === 'ÁLCOOL' || normalized === 'ALCOOL') return 'Etanol';
                        if (normalized === 'DIESEL') return 'Diesel';
                        if (normalized === 'ELÉTRICO' || normalized === 'ELETRICO') return 'Elétrico';
                        if (normalized === 'HÍBRIDO' || normalized === 'HIBRIDO') return 'Híbrido';
                        throw new Error(`Combustível inválido: "${c}". Use: FLEX, GASOLINA, ETANOL/ALCOOL, DIESEL, ELÉTRICO ou HÍBRIDO`);
                    };

                    // Normaliza e valida TRANSMISSÃO - gera erro se não for reconhecida
                    const normalizeTransmissao = (t?: string): 'Manual' | 'Automático' | 'CVT' => {
                        if (!t || !t.trim()) {
                            throw new Error('Transmissão não pode ser vazia');
                        }
                        const s = t.trim().toUpperCase();
                        if (s === 'AUTOMATICO' || s === 'AUTOMÁTICO' || s === 'AUT.' || s === 'AUTO' || s === 'AUTOMATICA' || s === 'AUTOMÁTICA') return 'Automático';
                        if (s === 'MANUAL') return 'Manual';
                        if (s === 'CVT') return 'CVT';
                        throw new Error(`Transmissão inválida: "${t}". Use: AUTOMATICO, MANUAL ou CVT`);
                    };

                    const statusFinal = normalizeStatus(status);
                    const combustivelFinal = normalizeCombustivel(combustivel);
                    const transmissaoFinal = normalizeTransmissao(transmissao);

                    // Converte data brasileira DD/MM/YYYY ou ISO YYYY-MM-DD para objeto Date
                    const parseDataEntrada = (dateStr?: string): Date => {
                        if (!dateStr || !dateStr.trim()) return new Date();
                        
                        const cleanDate = dateStr.trim();
                        
                        // Tenta formato DD/MM/YYYY, MM/DD/YYYY ou YYYY/MM/DD
                        if (cleanDate.includes('/')) {
                            const parts = cleanDate.split('/');
                            if (parts.length === 3) {
                                // Verifica se é YYYY/MM/DD
                                if (parts[0].length === 4) {
                                    const [year, month, day] = parts;
                                    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                                    if (!isNaN(date.getTime())) return date;
                                } else {
                                    // Assume DD/MM/YYYY ou MM/DD/YYYY
                                    let day = parseInt(parts[0]);
                                    let month = parseInt(parts[1]);
                                    let year = parseInt(parts[2]);

                                    // Detecção de formato americano (MM/DD/YYYY)
                                    // Se o segundo número > 12 (não pode ser mês) e o primeiro <= 12 (pode ser mês)
                                    if (month > 12 && day <= 12) {
                                        const temp = day;
                                        day = month;
                                        month = temp;
                                    }

                                    const date = new Date(year, month - 1, day);
                                    if (!isNaN(date.getTime())) return date;
                                }
                            }
                        }
                        
                        // Tenta formato YYYY-MM-DD, DD-MM-YYYY ou MM-DD-YYYY
                        if (cleanDate.includes('-')) {
                            const parts = cleanDate.split('-');
                            if (parts.length === 3) {
                                // Verifica se é YYYY-MM-DD
                                if (parts[0].length === 4) {
                                    const [year, month, day] = parts;
                                    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                                    if (!isNaN(date.getTime())) return date;
                                } else {
                                    // Assume DD-MM-YYYY ou MM-DD-YYYY
                                    let day = parseInt(parts[0]);
                                    let month = parseInt(parts[1]);
                                    let year = parseInt(parts[2]);

                                    // Detecção de formato americano (MM-DD-YYYY)
                                    if (month > 12 && day <= 12) {
                                        const temp = day;
                                        day = month;
                                        month = temp;
                                    }

                                    const date = new Date(year, month - 1, day);
                                    if (!isNaN(date.getTime())) return date;
                                }
                            }
                        }

                        // Tenta construtor padrão como fallback
                        const date = new Date(cleanDate);
                        if (!isNaN(date.getTime())) return date;

                        // Se não conseguiu ler a data, usa a data atual (hoje)
                        return new Date();
                    };

                    const vehicleData = {
                        dataEntrada: parseDataEntrada(dataEntrada),
                        modelo: modelo.toUpperCase(),
                        transmissao: transmissaoFinal as 'Manual' | 'Automático' | 'CVT',
                        combustivel: combustivelFinal as 'Flex' | 'Gasolina' | 'Etanol' | 'Diesel' | 'Elétrico' | 'Híbrido',
                        cor: cor || '',
                        ano: ano || '',
                        opcionais: opcionais || '',
                        preco: preco,
                        status: statusFinal as 'A faturar' | 'Refaturamento' | 'Licenciado',
                        observacoes: observacoes || `Importado via CSV em ${new Date().toLocaleDateString('pt-BR')}`,
                        cidade: cidade,
                        estado: estado,
                        concessionaria: concessionaria,
                        telefone: telefone,
                        nomeContato: nomeContato,
                        operador: operador || ''
                    };

                    await VehicleService.addVehicle(vehicleData);
                    results.success++;
                } catch (error) {
                    results.errors.push({ line: i + 1, reason: `Erro ao adicionar ${modelo}: ${error}`, raw: line, columns });
                }
            }

            return results as unknown as { success: number; errors: string[] };
        } catch (error) {
            console.error('Erro na importação:', error);
            throw error;
        }
    }

    async populateInitialMarcas(): Promise<void> {
        const marcasIniciais = [
            'Acura', 'Agrale', 'Alfa Romeo', 'AM Gen', 'Asia Motors', 'ASTON MARTIN',
            'Audi', 'Baby', 'BMW', 'BRM', 'Bugre', 'BYD', 'CAB Motors', 'Cadillac',
            'Caoa Chery', 'Caoa Chery/Chery', 'CBT Jipe', 'CHANA', 'CHANGAN',
            'Chrysler', 'Citroën', 'Cross Lander', 'D2D Motors', 'Daewoo', 'Daihatsu',
            'DFSK', 'Dodge', 'EFFA', 'Engesa', 'Envemo', 'Ferrari', 'FEVER', 'Fiat',
            'Fibravan', 'Ford', 'FOTON', 'Fyber', 'GAC', 'GEELY', 'GM - Chevrolet',
            'GREAT WALL', 'Gurgel', 'GWM', 'HAFEI', 'HITECH ELECTRIC', 'Honda',
            'Hyundai', 'Isuzu', 'IVECO', 'JAC', 'Jaecoo', 'Jaguar', 'Jeep', 'JINBEI',
            'JPX', 'Kia Motors', 'Lada', 'LAMBORGHINI', 'Land Rover', 'Lexus', 'LIFAN',
            'LOBINI', 'Lotus', 'Mahindra', 'Maserati', 'Matra', 'Mazda', 'Mclaren',
            'Mercedes-Benz', 'Mercury', 'MG', 'MINI', 'Mitsubishi', 'Miura', 'NETA',
            'Nissan', 'Omoda', 'Peugeot', 'Plymouth', 'Pontiac', 'Porsche', 'RAM',
            'RELY', 'Renault', 'Rolls-Royce', 'Rover', 'Saab', 'Saturn', 'Seat',
            'SERES', 'SHINERAY', 'smart', 'SSANGYONG', 'Subaru', 'Suzuki', 'TAC',
            'Toyota', 'Troller', 'Volvo', 'VW - VolksWagen', 'Wake', 'Walk', 'ZEEKR'
        ];

        try {
            console.log('Iniciando população de marcas...');
            for (const marca of marcasIniciais) {
                await this.addMarca({ nome: marca });
            }
            console.log(`${marcasIniciais.length} marcas adicionadas com sucesso!`);
        } catch (error) {
            console.error('Erro ao popular marcas:', error);
            throw error;
        }
    }

    // MÉTODOS DE PAGINAÇÃO (Simulados com fetch all)
    async getMarcasPaginated(options: PaginationOptions = {}): Promise<PaginationResult<Marca>> {
        const { page = 1, itemsPerPage = 50 } = options;
        try {
            const all = await this.getAllMarcas();
            const start = (page - 1) * itemsPerPage;
            const end = start + itemsPerPage;
            const data = all.slice(start, end);

            return {
                data,
                total: all.length,
                hasNextPage: end < all.length,
                lastDoc: null
            };
        } catch (error) {
            console.error('Erro ao buscar marcas paginadas:', error);
            throw error;
        }
    }

    async getModelosPaginated(options: PaginationOptions = {}): Promise<PaginationResult<Modelo>> {
        const { page = 1, itemsPerPage = 50 } = options;
        try {
            const all = await this.getAllModelos();
            const start = (page - 1) * itemsPerPage;
            const end = start + itemsPerPage;
            const data = all.slice(start, end);

            return {
                data,
                total: all.length,
                hasNextPage: end < all.length,
                lastDoc: null
            };
        } catch (error) {
            console.error('Erro ao buscar modelos paginados:', error);
            throw error;
        }
    }

    async getCoresPaginated(options: PaginationOptions = {}): Promise<PaginationResult<Cor>> {
        const { page = 1, itemsPerPage = 50 } = options;
        try {
            const all = await this.getAllCores();
            const start = (page - 1) * itemsPerPage;
            const end = start + itemsPerPage;
            const data = all.slice(start, end);

            return {
                data,
                total: all.length,
                hasNextPage: end < all.length,
                lastDoc: null
            };
        } catch (error) {
            console.error('Erro ao buscar cores paginadas:', error);
            throw error;
        }
    }

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
