import {
    collection,
    addDoc,
    getDocs,
    updateDoc,
    doc,
    deleteDoc,
    orderBy,
    query
} from 'firebase/firestore';
import { db } from '../firebase';

export interface Transportadora {
    id?: string;
    nome: string;
    cnpj: string;
    razaoSocial: string;
    inscricaoEstadual?: string;
    telefone: string;
    celular?: string;
    email: string;
    endereco: string;
    numero: string;
    complemento?: string;
    bairro: string;
    cidade: string;
    estado: string;
    cep: string;
    nomeResponsavel: string;
    telefoneResponsavel: string;
    emailResponsavel?: string;
    observacoes?: string;
    ativo: boolean;
    dataCreated: string;
}

const COLLECTION_NAME = 'transportadoras';

export class TransportadoraService {
    // Adicionar nova transportadora
    static async addTransportadora(transportadora: Omit<Transportadora, 'id'>): Promise<boolean> {
        try {
            const transportadoraData = {
                ...transportadora,
                dataCreated: transportadora.dataCreated || new Date().toLocaleDateString('pt-BR'),
                ativo: transportadora.ativo !== undefined ? transportadora.ativo : true
            };

            await addDoc(collection(db, COLLECTION_NAME), transportadoraData);
            return true;
        } catch (error) {
            console.error('Erro ao adicionar transportadora:', error);
            throw error;
        }
    }

    // Buscar todas as transportadoras
    static async getAllTransportadoras(): Promise<Transportadora[]> {
        try {
            const q = query(collection(db, COLLECTION_NAME), orderBy('nome', 'asc'));
            const querySnapshot = await getDocs(q);

            return querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Transportadora));
        } catch (error) {
            console.error('Erro ao buscar transportadoras:', error);
            throw error;
        }
    }

    // Atualizar transportadora
    static async updateTransportadora(id: string, updates: Partial<Transportadora>): Promise<void> {
        try {
            const transportadoraRef = doc(db, COLLECTION_NAME, id);
            await updateDoc(transportadoraRef, updates);
        } catch (error) {
            console.error('Erro ao atualizar transportadora:', error);
            throw error;
        }
    }

    // Deletar transportadora
    static async deleteTransportadora(id: string): Promise<void> {
        try {
            await deleteDoc(doc(db, COLLECTION_NAME, id));
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