import { db } from '../firebase';
import {
    collection,
    addDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    doc,
    query,
    orderBy,
    limit,
    startAfter,
    getCountFromServer,
    Timestamp,
    QueryDocumentSnapshot
} from 'firebase/firestore';

export interface Marca {
    id?: string;
    nome: string;
    criadoEm?: Date | Timestamp;
}

export interface Modelo {
    id?: string;
    nome: string;
    marca: string;
    criadoEm?: Date | Timestamp;
}

export interface Cor {
    id?: string;
    nome: string;
    hex?: string;
    criadoEm?: Date | Timestamp;
}

export interface Concessionaria {
    id?: string;
    nome: string;
    cnpj?: string;
    telefone?: string;
    contato?: string;
    endereco?: string;
    cidade?: string;
    uf?: string;
    cep?: string;
    criadoEm?: Date | Timestamp;
}

export interface PaginationResult<T> {
    data: T[];
    total: number;
    hasNextPage: boolean;
    lastDoc?: QueryDocumentSnapshot;
}

export interface PaginationOptions {
    page?: number;
    itemsPerPage?: number;
    lastDoc?: QueryDocumentSnapshot;
}

class TablesService {
    private marcasCollection = collection(db, 'marcas');
    private modelosCollection = collection(db, 'modelos');
    private coresCollection = collection(db, 'cores');

    // MARCAS
    async addMarca(marcaData: Omit<Marca, 'id'>): Promise<string> {
        try {
            console.log('Adicionando marca:', marcaData);
            const docRef = await addDoc(this.marcasCollection, {
                ...marcaData,
                criadoEm: Timestamp.now()
            });
            console.log('Marca adicionada com ID:', docRef.id);
            return docRef.id;
        } catch (error) {
            console.error('Erro ao adicionar marca:', error);
            throw error;
        }
    }

    async getAllMarcas(): Promise<Marca[]> {
        try {
            console.log('Buscando todas as marcas...');
            const q = query(this.marcasCollection, orderBy('nome'));
            const querySnapshot = await getDocs(q);
            const marcas: Marca[] = [];

            querySnapshot.forEach((doc) => {
                const data = doc.data();
                marcas.push({
                    id: doc.id,
                    nome: data.nome,
                    criadoEm: data.criadoEm
                });
            });

            console.log(`Encontradas ${marcas.length} marcas`);
            return marcas;
        } catch (error) {
            console.error('Erro ao buscar marcas:', error);
            throw error;
        }
    }

    async updateMarca(id: string, marcaData: Omit<Marca, 'id'>): Promise<void> {
        try {
            console.log('Atualizando marca:', id, marcaData);
            const marcaRef = doc(db, 'marcas', id);
            await updateDoc(marcaRef, marcaData);
            console.log('Marca atualizada com sucesso');
        } catch (error) {
            console.error('Erro ao atualizar marca:', error);
            throw error;
        }
    }

    async deleteMarca(id: string): Promise<void> {
        try {
            console.log('Excluindo marca:', id);
            const marcaRef = doc(db, 'marcas', id);
            await deleteDoc(marcaRef);
            console.log('Marca excluída com sucesso');
        } catch (error) {
            console.error('Erro ao excluir marca:', error);
            throw error;
        }
    }

    // MODELOS
    async addModelo(modeloData: Omit<Modelo, 'id'>): Promise<string> {
        try {
            console.log('Adicionando modelo:', modeloData);
            const docRef = await addDoc(this.modelosCollection, {
                ...modeloData,
                criadoEm: Timestamp.now()
            });
            console.log('Modelo adicionado com ID:', docRef.id);
            return docRef.id;
        } catch (error) {
            console.error('Erro ao adicionar modelo:', error);
            throw error;
        }
    }

    async getAllModelos(): Promise<Modelo[]> {
        try {
            console.log('Buscando todos os modelos...');
            const q = query(this.modelosCollection, orderBy('marca'), orderBy('nome'));
            const querySnapshot = await getDocs(q);
            const modelos: Modelo[] = [];

            querySnapshot.forEach((doc) => {
                const data = doc.data();
                modelos.push({
                    id: doc.id,
                    nome: data.nome,
                    marca: data.marca,
                    criadoEm: data.criadoEm
                });
            });

            console.log(`Encontrados ${modelos.length} modelos`);
            return modelos;
        } catch (error) {
            console.error('Erro ao buscar modelos:', error);
            throw error;
        }
    }

    async updateModelo(id: string, modeloData: Omit<Modelo, 'id'>): Promise<void> {
        try {
            console.log('Atualizando modelo:', id, modeloData);
            const modeloRef = doc(db, 'modelos', id);
            await updateDoc(modeloRef, modeloData);
            console.log('Modelo atualizado com sucesso');
        } catch (error) {
            console.error('Erro ao atualizar modelo:', error);
            throw error;
        }
    }

    async deleteModelo(id: string): Promise<void> {
        try {
            console.log('Excluindo modelo:', id);
            const modeloRef = doc(db, 'modelos', id);
            await deleteDoc(modeloRef);
            console.log('Modelo excluído com sucesso');
        } catch (error) {
            console.error('Erro ao excluir modelo:', error);
            throw error;
        }
    }

    // CORES
    async addCor(corData: Omit<Cor, 'id'>): Promise<string> {
        try {
            console.log('Adicionando cor:', corData);
            const docRef = await addDoc(this.coresCollection, {
                ...corData,
                criadoEm: Timestamp.now()
            });
            console.log('Cor adicionada com ID:', docRef.id);
            return docRef.id;
        } catch (error) {
            console.error('Erro ao adicionar cor:', error);
            throw error;
        }
    }

    async getAllCores(): Promise<Cor[]> {
        try {
            console.log('Buscando todas as cores...');
            const q = query(this.coresCollection, orderBy('nome'));
            const querySnapshot = await getDocs(q);
            const cores: Cor[] = [];

            querySnapshot.forEach((doc) => {
                const data = doc.data();
                cores.push({
                    id: doc.id,
                    nome: data.nome,
                    hex: data.hex,
                    criadoEm: data.criadoEm
                });
            });

            console.log(`Encontradas ${cores.length} cores`);
            return cores;
        } catch (error) {
            console.error('Erro ao buscar cores:', error);
            throw error;
        }
    }

    async updateCor(id: string, corData: Omit<Cor, 'id'>): Promise<void> {
        try {
            console.log('Atualizando cor:', id, corData);
            const corRef = doc(db, 'cores', id);
            await updateDoc(corRef, corData);
            console.log('Cor atualizada com sucesso');
        } catch (error) {
            console.error('Erro ao atualizar cor:', error);
            throw error;
        }
    }

    async deleteCor(id: string): Promise<void> {
        try {
            console.log('Excluindo cor:', id);
            const corRef = doc(db, 'cores', id);
            await deleteDoc(corRef);
            console.log('Cor excluída com sucesso');
        } catch (error) {
            console.error('Erro ao excluir cor:', error);
            throw error;
        }
    }

    // Função para importação massiva de modelos
    async importModelosFromCSV(
        csvData: string,
        onProgress?: (current: number, total: number) => void
    ): Promise<{ success: number; errors: string[] }> {
        const lines = csvData.split('\n').filter(line => line.trim());
        const totalLines = lines.length - 1; // Exclui cabeçalho
        const results = { success: 0, errors: [] as string[] };

        try {
            console.log('Iniciando importação de modelos...');

            for (let i = 1; i < lines.length; i++) { // Pula cabeçalho
                const line = lines[i].trim();
                if (!line) continue;

                // Atualizar progresso
                if (onProgress) {
                    onProgress(i, totalLines);
                }

                const [marca, modelo] = line.split(',').map(item => item.trim().replace(/"/g, ''));

                if (!marca || !modelo) {
                    results.errors.push(`Linha ${i + 1}: Dados incompletos - Marca: "${marca}", Modelo: "${modelo}"`);
                    continue;
                }

                try {
                    await this.addModelo({
                        nome: modelo.toUpperCase(),
                        marca: marca.toUpperCase()
                    });
                    results.success++;
                    console.log(`Modelo adicionado: ${marca} - ${modelo}`);
                } catch (error) {
                    results.errors.push(`Linha ${i + 1}: Erro ao adicionar ${marca} - ${modelo}: ${error}`);
                }
            }

            console.log(`Importação concluída: ${results.success} sucessos, ${results.errors.length} erros`);
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
        const totalLines = lines.length - 1; // Exclui cabeçalho
        const results = { success: 0, errors: [] as string[] };

        try {
            console.log('Iniciando importação de veículos...');

            for (let i = 1; i < lines.length; i++) { // Pula cabeçalho
                const line = lines[i].trim();
                if (!line) continue;

                // Atualizar progresso
                if (onProgress) {
                    onProgress(i, totalLines);
                }

                // Formato: marca,modelo,versao,cor,preco,concessionaria,cidade,estado,vendedor,telefone
                const columns = line.split(',').map(item => item.trim().replace(/"/g, ''));

                if (columns.length < 10) {
                    results.errors.push(`Linha ${i + 1}: Dados insuficientes - esperado 10 colunas, encontradas ${columns.length}`);
                    continue;
                }

                const [marca, modelo, versao, cor, preco, concessionaria, cidade, estado, vendedor, telefone] = columns;

                if (!marca || !modelo || !concessionaria || !cidade || !estado || !vendedor || !telefone) {
                    results.errors.push(`Linha ${i + 1}: Campos obrigatórios em branco`);
                    continue;
                }

                try {
                    // Simular adição de veículo (será integrado com o serviço real)
                    console.log(`Veículo processado: ${marca} ${modelo} - ${concessionaria}`);
                    results.success++;

                    // Pequeno delay para simular processamento
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (error) {
                    results.errors.push(`Linha ${i + 1}: Erro ao adicionar ${marca} ${modelo}: ${error}`);
                }
            }

            console.log(`Importação concluída: ${results.success} sucessos, ${results.errors.length} erros`);
            return results;
        } catch (error) {
            console.error('Erro na importação:', error);
            throw error;
        }
    }

    // Função para popular marcas iniciais
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

    // MÉTODOS DE PAGINAÇÃO
    async getMarcasPaginated(options: PaginationOptions = {}): Promise<PaginationResult<Marca>> {
        const { page = 1, itemsPerPage = 50, lastDoc } = options;

        try {
            console.log('Iniciando busca paginada otimizada de marcas...');

            // Verificar se há marcas (busca otimizada apenas para verificar existência)
            if (page === 1 && !lastDoc) {
                const checkQuery = query(this.marcasCollection, limit(1));
                const checkSnapshot = await getDocs(checkQuery);

                if (checkSnapshot.empty) {
                    console.log('Nenhuma marca encontrada, populando marcas iniciais...');
                    await this.populateInitialMarcas();
                }
            }

            // Query otimizada - busca apenas os itens da página
            let dataQuery = query(
                this.marcasCollection,
                orderBy('nome'),
                limit(itemsPerPage + 1) // +1 para verificar se há próxima página
            );

            if (lastDoc) {
                dataQuery = query(
                    this.marcasCollection,
                    orderBy('nome'),
                    startAfter(lastDoc),
                    limit(itemsPerPage + 1)
                );
            } else if (page > 1) {
                // Para páginas intermediárias, usar skip simulado
                const skip = (page - 1) * itemsPerPage;
                const skipQuery = query(
                    this.marcasCollection,
                    orderBy('nome'),
                    limit(skip)
                );
                const skipSnapshot = await getDocs(skipQuery);
                const lastVisible = skipSnapshot.docs[skipSnapshot.docs.length - 1];

                if (lastVisible) {
                    dataQuery = query(
                        this.marcasCollection,
                        orderBy('nome'),
                        startAfter(lastVisible),
                        limit(itemsPerPage + 1)
                    );
                }
            }

            const querySnapshot = await getDocs(dataQuery);
            const docs = querySnapshot.docs;

            // Verificar se há próxima página
            const hasNextPage = docs.length > itemsPerPage;

            // Pegar apenas os itens da página atual
            const pageData = hasNextPage ? docs.slice(0, itemsPerPage) : docs;

            const data: Marca[] = pageData.map(doc => ({
                id: doc.id,
                ...doc.data(),
                criadoEm: doc.data().criadoEm?.toDate()
            } as Marca));

            const newLastDoc = pageData[pageData.length - 1];

            // Total estimado (não preciso para paginação cursor-based)
            const total = page * itemsPerPage + (hasNextPage ? 1 : 0);

            console.log(`Marcas página ${page} carregadas:`, data.length, 'hasNextPage:', hasNextPage);

            return {
                data,
                total,
                hasNextPage,
                lastDoc: newLastDoc
            };
        } catch (error) {
            console.error('Erro ao buscar marcas paginadas:', error);
            throw error;
        }
    }

    async getModelosPaginated(options: PaginationOptions = {}): Promise<PaginationResult<Modelo>> {
        const { page = 1, itemsPerPage = 50, lastDoc } = options;

        try {
            console.log('Iniciando busca paginada otimizada de modelos...');

            // Query otimizada - busca apenas os itens da página
            let dataQuery = query(
                this.modelosCollection,
                orderBy('marca'),
                orderBy('nome'),
                limit(itemsPerPage + 1) // +1 para verificar se há próxima página
            );

            if (lastDoc) {
                dataQuery = query(
                    this.modelosCollection,
                    orderBy('marca'),
                    orderBy('nome'),
                    startAfter(lastDoc),
                    limit(itemsPerPage + 1)
                );
            } else if (page > 1) {
                // Para páginas intermediárias, usar skip simulado
                const skip = (page - 1) * itemsPerPage;
                const skipQuery = query(
                    this.modelosCollection,
                    orderBy('marca'),
                    orderBy('nome'),
                    limit(skip)
                );
                const skipSnapshot = await getDocs(skipQuery);
                const lastVisible = skipSnapshot.docs[skipSnapshot.docs.length - 1];

                if (lastVisible) {
                    dataQuery = query(
                        this.modelosCollection,
                        orderBy('marca'),
                        orderBy('nome'),
                        startAfter(lastVisible),
                        limit(itemsPerPage + 1)
                    );
                }
            }

            const querySnapshot = await getDocs(dataQuery);
            const docs = querySnapshot.docs;

            // Verificar se há próxima página
            const hasNextPage = docs.length > itemsPerPage;

            // Pegar apenas os itens da página atual
            const pageData = hasNextPage ? docs.slice(0, itemsPerPage) : docs;

            const data: Modelo[] = pageData.map(doc => ({
                id: doc.id,
                ...doc.data(),
                criadoEm: doc.data().criadoEm?.toDate()
            } as Modelo));

            const newLastDoc = pageData[pageData.length - 1];

            // Total estimado (não preciso para paginação cursor-based)
            const total = page * itemsPerPage + (hasNextPage ? 1 : 0);

            console.log(`Modelos página ${page} carregados:`, data.length, 'hasNextPage:', hasNextPage);

            return {
                data,
                total,
                hasNextPage,
                lastDoc: newLastDoc
            };
        } catch (error) {
            console.error('Erro ao buscar modelos paginados:', error);
            throw error;
        }
    }

    async getCoresPaginated(options: PaginationOptions = {}): Promise<PaginationResult<Cor>> {
        const { page = 1, itemsPerPage = 50, lastDoc } = options;

        try {
            console.log('Iniciando busca paginada otimizada de cores...');

            // Query otimizada - busca apenas os itens da página
            let dataQuery = query(
                this.coresCollection,
                orderBy('nome'),
                limit(itemsPerPage + 1) // +1 para verificar se há próxima página
            );

            if (lastDoc) {
                dataQuery = query(
                    this.coresCollection,
                    orderBy('nome'),
                    startAfter(lastDoc),
                    limit(itemsPerPage + 1)
                );
            } else if (page > 1) {
                // Para páginas intermediárias, usar skip simulado
                const skip = (page - 1) * itemsPerPage;
                const skipQuery = query(
                    this.coresCollection,
                    orderBy('nome'),
                    limit(skip)
                );
                const skipSnapshot = await getDocs(skipQuery);
                const lastVisible = skipSnapshot.docs[skipSnapshot.docs.length - 1];

                if (lastVisible) {
                    dataQuery = query(
                        this.coresCollection,
                        orderBy('nome'),
                        startAfter(lastVisible),
                        limit(itemsPerPage + 1)
                    );
                }
            }

            const querySnapshot = await getDocs(dataQuery);
            const docs = querySnapshot.docs;

            // Verificar se há próxima página
            const hasNextPage = docs.length > itemsPerPage;

            // Pegar apenas os itens da página atual
            const pageData = hasNextPage ? docs.slice(0, itemsPerPage) : docs;

            const data: Cor[] = pageData.map(doc => ({
                id: doc.id,
                ...doc.data(),
                criadoEm: doc.data().criadoEm?.toDate()
            } as Cor));

            const newLastDoc = pageData[pageData.length - 1];

            // Total estimado (não preciso para paginação cursor-based)
            const total = page * itemsPerPage + (hasNextPage ? 1 : 0);

            console.log(`Cores página ${page} carregadas:`, data.length, 'hasNextPage:', hasNextPage);

            return {
                data,
                total,
                hasNextPage,
                lastDoc: newLastDoc
            };
        } catch (error) {
            console.error('Erro ao buscar cores paginadas:', error);
            throw error;
        }
    }

    // ============= MÉTODOS DE CONCESSIONÁRIAS =============

    async getAllConcessionarias(): Promise<Concessionaria[]> {
        try {
            console.log('Buscando todas as concessionárias...');
            const q = query(
                collection(db, 'concessionarias'),
                orderBy('nome')
            );
            const querySnapshot = await getDocs(q);
            const concessionarias = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                criadoEm: doc.data().criadoEm?.toDate()
            } as Concessionaria));

            console.log(`Carregadas ${concessionarias.length} concessionárias`);
            return concessionarias;
        } catch (error) {
            console.error('Erro ao buscar concessionárias:', error);
            throw error;
        }
    }

    async addConcessionaria(concessionaria: Omit<Concessionaria, 'id'>): Promise<string> {
        try {
            const docData = {
                ...concessionaria,
                criadoEm: new Date()
            };

            const docRef = await addDoc(collection(db, 'concessionarias'), docData);
            console.log('Concessionária criada com ID:', docRef.id);
            return docRef.id;
        } catch (error) {
            console.error('Erro ao adicionar concessionária:', error);
            throw error;
        }
    }

    async updateConcessionaria(id: string, updates: Partial<Concessionaria>): Promise<void> {
        try {
            const concessionariaRef = doc(db, 'concessionarias', id);
            await updateDoc(concessionariaRef, updates);
            console.log('Concessionária atualizada:', id);
        } catch (error) {
            console.error('Erro ao atualizar concessionária:', error);
            throw error;
        }
    }

    async deleteConcessionaria(id: string): Promise<void> {
        try {
            const concessionariaRef = doc(db, 'concessionarias', id);
            await deleteDoc(concessionariaRef);
            console.log('Concessionária deletada:', id);
        } catch (error) {
            console.error('Erro ao deletar concessionária:', error);
            throw error;
        }
    }

    // Método para popular concessionárias iniciais (baseado no mock do operator/page.tsx)
    async populateInitialConcessionarias(): Promise<void> {
        try {
            console.log('Verificando se há concessionárias cadastradas...');
            const existing = await this.getAllConcessionarias();

            if (existing.length > 0) {
                console.log('Concessionárias já existem, não precisa popular');
                return;
            }

            console.log('Populando concessionárias iniciais...');
            const concessionariasIniciais = [
                {
                    nome: "Concessionária Premium Motors",
                    cnpj: "12.345.678/0001-90",
                    telefone: "(11) 3456-7890",
                    contato: "João Silva",
                    endereco: "Rua das Flores, 123",
                    cidade: "São Paulo",
                    uf: "SP",
                    cep: "01234-567"
                },
                {
                    nome: "Auto Center Sul",
                    cnpj: "23.456.789/0001-01",
                    telefone: "(21) 2345-6789",
                    contato: "Maria Santos",
                    endereco: "Av. Copacabana, 456",
                    cidade: "Rio de Janeiro",
                    uf: "RJ",
                    cep: "22070-012"
                },
                {
                    nome: "Veículos Minas Gerais Ltda",
                    cnpj: "34.567.890/0001-12",
                    telefone: "(31) 4567-8901",
                    contato: "Pedro Costa",
                    endereco: "Rua Bahia, 789",
                    cidade: "Belo Horizonte",
                    uf: "MG",
                    cep: "30112-000"
                },
                {
                    nome: "Toyota Prime São Paulo",
                    cnpj: "45.678.901/0001-23",
                    telefone: "(11) 5678-9012",
                    contato: "Ana Lima",
                    endereco: "Av. Paulista, 1000",
                    cidade: "São Paulo",
                    uf: "SP",
                    cep: "01310-100"
                },
                {
                    nome: "Honda Centro Oeste",
                    cnpj: "56.789.012/0001-34",
                    telefone: "(62) 6789-0123",
                    contato: "Carlos Pereira",
                    endereco: "Setor Central, 200",
                    cidade: "Goiânia",
                    uf: "GO",
                    cep: "74010-010"
                }
            ];

            for (const concessionaria of concessionariasIniciais) {
                await this.addConcessionaria(concessionaria);
            }

            console.log('Concessionárias iniciais populadas com sucesso!');
        } catch (error) {
            console.error('Erro ao popular concessionárias iniciais:', error);
            throw error;
        }
    }
}

export const tablesService = new TablesService();