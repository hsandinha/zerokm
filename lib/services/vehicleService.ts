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

// Interface para os veículos com todos os 19 campos originais
export interface Vehicle {
    id?: string;
    marca: string;
    modelo: string;
    versao: string;
    opcionais: string;
    cor: string;
    concessionaria: string;
    preco: number;
    ano: string;
    anoModelo: string;
    status: 'Disponível' | 'Vendido' | 'Reservado' | 'Manutenção';
    cidade: string;
    estado: string;
    chassi: string;
    motor: string;
    combustivel: 'Flex' | 'Gasolina' | 'Etanol' | 'Diesel' | 'Elétrico' | 'Híbrido';
    transmissao: 'Manual' | 'Automática' | 'CVT';
    observacoes: string;
    dataEntrada: string;
    vendedor: string;
    telefone: string;
    // Campos opcionais para compatibilidade
    quilometragem?: number;
    categoria?: string;
    descricao?: string;
    fotos?: string[];
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
                marca: vehicle.marca || '',
                modelo: vehicle.modelo || '',
                versao: vehicle.versao || '',
                opcionais: vehicle.opcionais || '',
                cor: vehicle.cor || '',
                concessionaria: vehicle.concessionaria || '',
                preco: vehicle.preco || 0,
                ano: vehicle.ano || '',
                anoModelo: vehicle.anoModelo || '',
                status: vehicle.status || 'Disponível',
                cidade: vehicle.cidade || '',
                estado: vehicle.estado || '',
                chassi: vehicle.chassi || '',
                motor: vehicle.motor || '',
                combustivel: vehicle.combustivel || 'Flex',
                transmissao: vehicle.transmissao || 'Manual',
                observacoes: vehicle.observacoes || '',
                dataEntrada: vehicle.dataEntrada || new Date().toLocaleDateString('pt-BR'),
                vendedor: vehicle.vendedor || '',
                telefone: vehicle.telefone || '',
                // Campos opcionais
                quilometragem: vehicle.quilometragem ?? 0,
                categoria: vehicle.categoria ?? '',
                descricao: vehicle.descricao ?? '',
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
        const { page = 1, itemsPerPage = 50, lastDoc, searchTerm } = options;

        try {
            const vehiclesCollection = collection(db, VEHICLES_COLLECTION);

            // Contar total de documentos
            let countQuery = query(vehiclesCollection);
            if (searchTerm) {
                // Para busca, precisamos buscar todos e filtrar (Firebase não suporta busca por texto)
                const allVehicles = await this.searchVehicles(searchTerm);
                return {
                    data: allVehicles.slice((page - 1) * itemsPerPage, page * itemsPerPage),
                    total: allVehicles.length,
                    hasNextPage: (page * itemsPerPage) < allVehicles.length
                };
            }

            const snapshot = await getCountFromServer(countQuery);
            const total = snapshot.data().count;

            // Query para buscar dados
            let dataQuery = query(
                vehiclesCollection,
                orderBy('dataEntrada', 'desc'),
                limit(itemsPerPage)
            );

            if (lastDoc) {
                dataQuery = query(
                    vehiclesCollection,
                    orderBy('dataEntrada', 'desc'),
                    startAfter(lastDoc),
                    limit(itemsPerPage)
                );
            } else if (page > 1) {
                const skip = (page - 1) * itemsPerPage;
                const initialQuery = query(
                    vehiclesCollection,
                    orderBy('dataEntrada', 'desc'),
                    limit(skip)
                );
                const initialSnapshot = await getDocs(initialQuery);
                const lastVisible = initialSnapshot.docs[initialSnapshot.docs.length - 1];

                if (lastVisible) {
                    dataQuery = query(
                        vehiclesCollection,
                        orderBy('dataEntrada', 'desc'),
                        startAfter(lastVisible),
                        limit(itemsPerPage)
                    );
                }
            }

            const querySnapshot = await getDocs(dataQuery);
            const data: Vehicle[] = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Vehicle));

            const hasNextPage = querySnapshot.docs.length === itemsPerPage &&
                ((page * itemsPerPage) < total);
            const newLastDoc = querySnapshot.docs[querySnapshot.docs.length - 1];

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
