import {
    collection,
    addDoc,
    getDocs,
    query,
    where,
    orderBy,
    updateDoc,
    doc,
    deleteDoc,
    limit,
    startAfter,
    getCountFromServer,
    Timestamp,
    QueryDocumentSnapshot
} from 'firebase/firestore';
import { db } from '../firebase';

// Interface para os veículos atualizada
export interface Vehicle {
    id?: string;
    dataEntrada: string;
    modelo: string;
    transmissao: 'Manual' | 'Automática' | 'CVT';
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
    lastDoc?: QueryDocumentSnapshot;
}

export interface VehiclePaginationOptions {
    page?: number;
    itemsPerPage?: number;
    lastDoc?: QueryDocumentSnapshot;
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
            console.log('VehicleService: Iniciando addVehicle com dados:', vehicle);
            console.log('VehicleService: Firebase db object:', db);
            // Garantir que todos os campos obrigatórios estejam presentes
            const vehicleData = {
                dataEntrada: vehicle.dataEntrada || new Date().toLocaleDateString('pt-BR'),
                modelo: vehicle.modelo || '',
                transmissao: vehicle.transmissao || 'Manual',
                combustivel: vehicle.combustivel || 'Flex',
                cor: vehicle.cor || '',
                ano: vehicle.ano || '',
                opcionais: vehicle.opcionais || '',
                preco: vehicle.preco || 0,
                status: vehicle.status || 'A faturar',
                observacoes: vehicle.observacoes || '',
                cidade: vehicle.cidade || '',
                estado: vehicle.estado || '',
                concessionaria: vehicle.concessionaria || '',
                telefone: vehicle.telefone || '',
                nomeContato: vehicle.nomeContato || vehicle.vendedor || '',
                operador: vehicle.operador || '',
                fotos: vehicle.fotos || []
            };

            console.log('VehicleService: Dados preparados para Firebase:', vehicleData);
            console.log('VehicleService: Tentando adicionar à coleção:', VEHICLES_COLLECTION);

            const docRef = await addDoc(collection(db, VEHICLES_COLLECTION), vehicleData);
            console.log('VehicleService: Documento criado com ID:', docRef.id);
            return docRef.id;
        } catch (error) {
            console.error('Erro ao adicionar veículo:', error);
            throw error;
        }
    }

    // Buscar todos os veículos
    static async getAllVehicles(): Promise<Vehicle[]> {
        try {
            const q = query(
                collection(db, VEHICLES_COLLECTION),
                orderBy('dataEntrada', 'desc')
            );

            const querySnapshot = await getDocs(q);
            const vehicles = querySnapshot.docs.map(doc => {
                const data = doc.data();
                console.log('Dados do veículo carregado:', { id: doc.id, ...data });
                return {
                    id: doc.id,
                    ...data
                } as Vehicle;
            });

            console.log(`Carregados ${vehicles.length} veículos do Firebase`);
            return vehicles;
        } catch (error) {
            console.error('Erro ao buscar veículos:', error);
            throw error;
        }
    }

    // Atualizar um veículo
    static async updateVehicle(id: string, updates: Partial<Vehicle>): Promise<void> {
        try {
            const vehicleRef = doc(db, VEHICLES_COLLECTION, id);
            await updateDoc(vehicleRef, updates);
        } catch (error) {
            console.error('Erro ao atualizar veículo:', error);
            throw error;
        }
    }

    // Deletar um veículo
    static async deleteVehicle(id: string): Promise<void> {
        try {
            await deleteDoc(doc(db, VEHICLES_COLLECTION, id));
        } catch (error) {
            console.error('Erro ao deletar veículo:', error);
            throw error;
        }
    }

    // Deletar múltiplos veículos
    static async deleteVehicles(ids: string[]): Promise<void> {
        try {
            const deletePromises = ids.map(id => deleteDoc(doc(db, VEHICLES_COLLECTION, id)));
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

            // Buscar todos os veículos
            const allVehicles = await this.getAllVehicles();

            // Deletar todos os veículos existentes
            for (const vehicle of allVehicles) {
                if (vehicle.id) {
                    await this.deleteVehicle(vehicle.id);
                }
            }

            console.log('Banco limpo com sucesso! O banco está agora vazio e pronto para novos dados.');
        } catch (error) {
            console.error('Erro ao limpar e resetar banco:', error);
            throw error;
        }
    }

    // Buscar por termo geral
    static async searchVehicles(term: string): Promise<Vehicle[]> {
        try {
            const allVehicles = await this.getAllVehicles();

            if (!term || term.length < 3) {
                return allVehicles;
            }

            const searchTerm = term.toLowerCase();
            return allVehicles.filter(vehicle => {
                const searchFields = [
                    vehicle.marca,
                    vehicle.modelo,
                    vehicle.versao,
                    vehicle.cor,
                    vehicle.concessionaria,
                    vehicle.cidade,
                    vehicle.estado,
                    vehicle.vendedor,
                    vehicle.observacoes
                ];

                return searchFields.some(field =>
                    field?.toLowerCase().includes(searchTerm)
                );
            });
        } catch (error) {
            console.error('Erro ao buscar veículos:', error);
            throw error;
        }
    }

    // MÉTODOS DE PAGINAÇÃO
    static async getVehiclesPaginated(options: VehiclePaginationOptions = {}): Promise<VehiclePaginationResult> {
        const { page = 1, itemsPerPage = 50, lastDoc, searchTerm, filters = {}, sortConfig = { key: 'dataEntrada', direction: 'desc' } } = options;

        try {
            const vehiclesCollection = collection(db, VEHICLES_COLLECTION);

            // Se houver termo de busca, usamos a busca em memória (limitação do Firestore)
            if (searchTerm) {
                const allVehicles = await this.searchVehicles(searchTerm);
                // Aplicar filtros em memória também
                let filtered = allVehicles;
                if (filters.status) filtered = filtered.filter(v => v.status === filters.status);
                if (filters.marca) filtered = filtered.filter(v => v.marca === filters.marca);
                if (filters.combustivel) filtered = filtered.filter(v => v.combustivel === filters.combustivel);
                if (filters.transmissao) filtered = filtered.filter(v => v.transmissao === filters.transmissao);
                if (filters.ano) filtered = filtered.filter(v => v.ano === filters.ano);

                // Ordenação em memória
                filtered.sort((a: any, b: any) => {
                    const aVal = a[sortConfig.key];
                    const bVal = b[sortConfig.key];
                    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                    return 0;
                });

                return {
                    data: filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage),
                    total: filtered.length,
                    hasNextPage: (page * itemsPerPage) < filtered.length
                };
            }

            // Query base
            let dataQuery = query(vehiclesCollection);

            // Aplicar filtros
            if (filters.status) dataQuery = query(dataQuery, where('status', '==', filters.status));
            if (filters.marca) dataQuery = query(dataQuery, where('marca', '==', filters.marca));
            if (filters.combustivel) dataQuery = query(dataQuery, where('combustivel', '==', filters.combustivel));
            if (filters.transmissao) dataQuery = query(dataQuery, where('transmissao', '==', filters.transmissao));
            if (filters.ano) dataQuery = query(dataQuery, where('ano', '==', filters.ano));

            // Contar total (com filtros)
            let total = 0;
            try {
                const countSnapshot = await getCountFromServer(dataQuery);
                total = countSnapshot.data().count;
            } catch (error) {
                console.warn('Não foi possível obter o total de veículos (cota excedida ou erro):', error);
                total = -1; // Indica que o total é desconhecido
            }

            // Ordenação
            dataQuery = query(dataQuery, orderBy(sortConfig.key, sortConfig.direction));

            // Paginação
            if (lastDoc) {
                dataQuery = query(dataQuery, startAfter(lastDoc));
            } else if (page > 1) {
                // Se não tiver lastDoc mas for página > 1, precisamos pular os registros anteriores
                // Isso é menos eficiente que usar lastDoc, mas necessário para "pular para página X"
                // Nota: Isso consome leituras para os documentos pulados
                const skip = (page - 1) * itemsPerPage;

                // Recriar a query base para encontrar o cursor
                let cursorQuery = query(vehiclesCollection);
                if (filters.status) cursorQuery = query(cursorQuery, where('status', '==', filters.status));
                if (filters.marca) cursorQuery = query(cursorQuery, where('marca', '==', filters.marca));
                if (filters.combustivel) cursorQuery = query(cursorQuery, where('combustivel', '==', filters.combustivel));
                if (filters.transmissao) cursorQuery = query(cursorQuery, where('transmissao', '==', filters.transmissao));
                if (filters.ano) cursorQuery = query(cursorQuery, where('ano', '==', filters.ano));

                cursorQuery = query(cursorQuery, orderBy(sortConfig.key, sortConfig.direction));
                cursorQuery = query(cursorQuery, limit(skip));

                const cursorSnapshot = await getDocs(cursorQuery);
                const lastVisible = cursorSnapshot.docs[cursorSnapshot.docs.length - 1];

                if (lastVisible) {
                    dataQuery = query(dataQuery, startAfter(lastVisible));
                }
            }

            // Buscar um item a mais para saber se tem próxima página
            dataQuery = query(dataQuery, limit(itemsPerPage + 1));

            const querySnapshot = await getDocs(dataQuery);
            const docs = querySnapshot.docs;
            const hasNextPage = docs.length > itemsPerPage;

            // Remover o item extra se existir
            const paginatedDocs = hasNextPage ? docs.slice(0, itemsPerPage) : docs;

            const data: Vehicle[] = paginatedDocs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Vehicle));

            const newLastDoc = paginatedDocs[paginatedDocs.length - 1];

            return {
                data,
                total,
                hasNextPage,
                lastDoc: newLastDoc
            };
        } catch (error) {
            console.error('Erro ao buscar veículos paginados:', error);
            throw error;
        }
    }


}
