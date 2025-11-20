import { useState, useEffect } from 'react';
import { tablesService, Marca, Modelo, Cor } from '../services/tablesService';

export function useTablesDatabase() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // MARCAS
    const [marcas, setMarcas] = useState<Marca[]>([]);

    const addMarca = async (marcaData: Omit<Marca, 'id'>) => {
        try {
            setLoading(true);
            setError(null);
            const id = await tablesService.addMarca(marcaData);
            await refreshMarcas();
            return id;
        } catch (error) {
            setError('Erro ao adicionar marca');
            console.error(error);
            return null;
        } finally {
            setLoading(false);
        }
    };

    const updateMarca = async (id: string, marcaData: Omit<Marca, 'id'>) => {
        try {
            setLoading(true);
            setError(null);
            await tablesService.updateMarca(id, marcaData);
            await refreshMarcas();
            return true;
        } catch (error) {
            setError('Erro ao atualizar marca');
            console.error(error);
            return false;
        } finally {
            setLoading(false);
        }
    };

    const deleteMarca = async (id: string) => {
        try {
            setLoading(true);
            setError(null);
            await tablesService.deleteMarca(id);
            await refreshMarcas();
            return true;
        } catch (error) {
            setError('Erro ao excluir marca');
            console.error(error);
            return false;
        } finally {
            setLoading(false);
        }
    };

    const refreshMarcas = async () => {
        try {
            setLoading(true);
            setError(null);
            const marcasData = await tablesService.getAllMarcas();
            setMarcas(marcasData);
        } catch (error) {
            setError('Erro ao carregar marcas');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    // MODELOS
    const [modelos, setModelos] = useState<Modelo[]>([]);

    const addModelo = async (modeloData: Omit<Modelo, 'id'>) => {
        try {
            setLoading(true);
            setError(null);
            const id = await tablesService.addModelo(modeloData);
            await refreshModelos();
            return id;
        } catch (error) {
            setError('Erro ao adicionar modelo');
            console.error(error);
            return null;
        } finally {
            setLoading(false);
        }
    };

    const updateModelo = async (id: string, modeloData: Omit<Modelo, 'id'>) => {
        try {
            setLoading(true);
            setError(null);
            await tablesService.updateModelo(id, modeloData);
            await refreshModelos();
            return true;
        } catch (error) {
            setError('Erro ao atualizar modelo');
            console.error(error);
            return false;
        } finally {
            setLoading(false);
        }
    };

    const deleteModelo = async (id: string) => {
        try {
            setLoading(true);
            setError(null);
            await tablesService.deleteModelo(id);
            await refreshModelos();
            return true;
        } catch (error) {
            setError('Erro ao excluir modelo');
            console.error(error);
            return false;
        } finally {
            setLoading(false);
        }
    };

    const refreshModelos = async () => {
        try {
            setLoading(true);
            setError(null);
            const modelosData = await tablesService.getAllModelos();
            setModelos(modelosData);
        } catch (error) {
            setError('Erro ao carregar modelos');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    // CORES
    const [cores, setCores] = useState<Cor[]>([]);

    const addCor = async (corData: Omit<Cor, 'id'>) => {
        try {
            setLoading(true);
            setError(null);
            const id = await tablesService.addCor(corData);
            await refreshCores();
            return id;
        } catch (error) {
            setError('Erro ao adicionar cor');
            console.error(error);
            return null;
        } finally {
            setLoading(false);
        }
    };

    const updateCor = async (id: string, corData: Omit<Cor, 'id'>) => {
        try {
            setLoading(true);
            setError(null);
            await tablesService.updateCor(id, corData);
            await refreshCores();
            return true;
        } catch (error) {
            setError('Erro ao atualizar cor');
            console.error(error);
            return false;
        } finally {
            setLoading(false);
        }
    };

    const deleteCor = async (id: string) => {
        try {
            setLoading(true);
            setError(null);
            await tablesService.deleteCor(id);
            await refreshCores();
            return true;
        } catch (error) {
            setError('Erro ao excluir cor');
            console.error(error);
            return false;
        } finally {
            setLoading(false);
        }
    };

    const refreshCores = async () => {
        try {
            setLoading(true);
            setError(null);
            const coresData = await tablesService.getAllCores();
            setCores(coresData);
        } catch (error) {
            setError('Erro ao carregar cores');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    // Função para popular marcas iniciais
    const populateInitialMarcas = async () => {
        try {
            setLoading(true);
            setError(null);
            await tablesService.populateInitialMarcas();
            await refreshMarcas();
            return true;
        } catch (error) {
            setError('Erro ao popular marcas iniciais');
            console.error(error);
            return false;
        } finally {
            setLoading(false);
        }
    };

    // Função para importar modelos do CSV
    const importModelosFromCSV = async (csvData: string, onProgress?: (current: number, total: number) => void) => {
        try {
            setLoading(true);
            setError(null);
            const results = await tablesService.importModelosFromCSV(csvData, onProgress);
            await refreshModelos();
            return results;
        } catch (error) {
            setError('Erro ao importar modelos do CSV');
            console.error(error);
            return { success: 0, errors: [{ line: 0, reason: 'Erro interno na importação' }] };
        } finally {
            setLoading(false);
        }
    };

    // Função para importar veículos do CSV
    const importVeiculosFromCSV = async (csvData: string, onProgress?: (current: number, total: number) => void) => {
        try {
            setLoading(true);
            setError(null);
            const results = await tablesService.importVeiculosFromCSV(csvData, onProgress);
            return results;
        } catch (error) {
            setError('Erro ao importar veículos do CSV');
            console.error(error);
            return { success: 0, errors: [{ line: 0, reason: 'Erro interno na importação' }] } as any;
        } finally {
            setLoading(false);
        }
    };

    // Carregar dados iniciais
    useEffect(() => {
        refreshMarcas();
        refreshModelos();
        refreshCores();
    }, []);

    return {
        // Estados
        loading,
        error,

        // Marcas
        marcas,
        addMarca,
        updateMarca,
        deleteMarca,
        refreshMarcas,
        populateInitialMarcas,

        // Modelos
        modelos,
        addModelo,
        updateModelo,
        deleteModelo,
        refreshModelos,

        // Cores
        cores,
        addCor,
        updateCor,
        deleteCor,
        refreshCores,

        // Importação
        importModelosFromCSV,
        importVeiculosFromCSV
    };
}