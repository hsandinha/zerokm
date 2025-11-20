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
            const concessionariaData = {
                ...concessionaria,
                dataCadastro: concessionaria.dataCadastro || new Date().toISOString(),
                criadoEm: new Date().toISOString(),
                ativo: concessionaria.ativo !== undefined ? concessionaria.ativo : true
            };

            await addDoc(collection(db, COLLECTION_NAME), concessionariaData);
            return true;
        } catch (error) {
            console.error('Erro ao adicionar concessionária:', error);
            throw error;
        }
    }

    // Buscar todas as concessionárias
    static async getAllConcessionarias(): Promise<Concessionaria[]> {
        try {
            const q = query(collection(db, COLLECTION_NAME), orderBy('nome', 'asc'));
            const querySnapshot = await getDocs(q);

            return querySnapshot.docs.map(doc => {
                const data = doc.data();
                // Converter Timestamps para strings se necessário
                const dataCadastro = data.dataCadastro?.toDate ? data.dataCadastro.toDate().toISOString() : data.dataCadastro;
                const criadoEm = data.criadoEm?.toDate ? data.criadoEm.toDate().toISOString() : data.criadoEm;
                const atualizadoEm = data.atualizadoEm?.toDate ? data.atualizadoEm.toDate().toISOString() : data.atualizadoEm;

                return {
                    ...data,
                    id: doc.id,
                    dataCadastro,
                    criadoEm,
                    atualizadoEm
                } as unknown as Concessionaria;
            });
        } catch (error) {
            console.error('Erro ao buscar concessionárias:', error);
            throw error;
        }
    }

    // Atualizar concessionária
    static async updateConcessionaria(id: string, updates: Partial<Concessionaria>): Promise<void> {
        try {
            const concessionariaRef = doc(db, COLLECTION_NAME, id);
            await updateDoc(concessionariaRef, updates);
        } catch (error) {
            console.error('Erro ao atualizar concessionária:', error);
            throw error;
        }
    }

    // Deletar concessionária
    static async deleteConcessionaria(id: string): Promise<void> {
        try {
            await deleteDoc(doc(db, COLLECTION_NAME, id));
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
