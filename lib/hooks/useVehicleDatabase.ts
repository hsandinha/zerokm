import { useState, useEffect, useCallback } from 'react';
import { VehicleService, Vehicle } from '../services/vehicleService';
// import { useSession } from 'next-auth/react';

export const useVehicleDatabase = () => {
    // const { data: session } = useSession();
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [totalItems, setTotalItems] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Inicializar banco com dados de exemplo se estiver vazio
    const initializeDatabase = useCallback(async () => {
        try {
            // Buscar todos os veículos do banco (limitado a 50 por padrão para não pesar)
            const result = await VehicleService.getVehiclesPaginated({ page: 1, itemsPerPage: 50 });
            setVehicles(result.data);
            setTotalItems(result.total);
            setLoading(false);
        } catch (err) {
            console.error('Erro ao inicializar banco:', err);
            setError('Erro ao carregar veículos');
            setLoading(false);
        }
    }, []);

    // Buscar veículos paginados
    const getVehiclesPaginated = useCallback(async (options: any) => {
        try {
            setLoading(true);
            const result = await VehicleService.getVehiclesPaginated(options);
            setVehicles(result.data);
            setTotalItems(result.total);
            setLoading(false);
            return result;
        } catch (err) {
            console.error('Erro ao buscar veículos paginados:', err);
            setError('Erro ao buscar veículos');
            setLoading(false);
            throw err;
        }
    }, []);

    // Buscar veículos com filtros (mantido por compatibilidade, mas redirecionando para paginado)
    const searchVehicles = useCallback(async (filters: any) => {
        try {
            setLoading(true);
            const result = await VehicleService.getVehiclesPaginated({ filters, page: 1, itemsPerPage: 50 });
            setVehicles(result.data);
            setTotalItems(result.total);
            setLoading(false);
        } catch (err) {
            console.error('Erro ao buscar veículos:', err);
            setError('Erro ao buscar veículos');
            setLoading(false);
        }
    }, []);

    // Adicionar novo veículo
    const addVehicle = useCallback(async (vehicle: Omit<Vehicle, 'id'>) => {
        try {
            console.log('Hook: Tentando adicionar veículo:', vehicle);
            // console.log('Hook: Sessão atual:', session);

            // Comentando temporariamente a verificação de autenticação para teste
            // if (!session) {
            //     throw new Error('Usuário não autenticado');
            // }

            const vehicleId = await VehicleService.addVehicle(vehicle);
            console.log('Hook: Veículo adicionado com ID:', vehicleId);

            // Recarregar lista
            const allVehicles = await VehicleService.getAllVehicles();
            setVehicles(allVehicles);
            console.log('Hook: Lista de veículos atualizada');
            return true;
        } catch (err) {
            console.error('Hook: Erro ao adicionar veículo:', err);
            setError('Erro ao adicionar veículo');
            return false;
        }
    }, []);

    // Atualizar veículo
    const updateVehicle = useCallback(async (id: string, updates: Partial<Vehicle>) => {
        try {
            await VehicleService.updateVehicle(id, updates);
            // Recarregar lista
            const allVehicles = await VehicleService.getAllVehicles();
            setVehicles(allVehicles);
            return true;
        } catch (err) {
            console.error('Erro ao atualizar veículo:', err);
            setError('Erro ao atualizar veículo');
            return false;
        }
    }, []);

    // Deletar veículo
    const deleteVehicle = useCallback(async (id: string) => {
        try {
            await VehicleService.deleteVehicle(id);
            // Remover da lista local
            setVehicles(prev => prev.filter(v => v.id !== id));
            return true;
        } catch (err) {
            console.error('Erro ao deletar veículo:', err);
            setError('Erro ao deletar veículo');
            return false;
        }
    }, []);

    // Deletar múltiplos veículos
    const deleteVehicles = useCallback(async (ids: string[]) => {
        try {
            await VehicleService.deleteVehicles(ids);
            // Remover da lista local
            setVehicles(prev => prev.filter(v => v.id && !ids.includes(v.id)));
            return true;
        } catch (err) {
            console.error('Erro ao deletar veículos em massa:', err);
            setError('Erro ao deletar veículos em massa');
            return false;
        }
    }, []);

    useEffect(() => {
        initializeDatabase();
    }, [initializeDatabase]);

    return {
        vehicles,
        totalItems,
        loading,
        error,
        searchVehicles,
        getVehiclesPaginated,
        addVehicle,
        updateVehicle,
        deleteVehicle,
        deleteVehicles,
        refreshVehicles: initializeDatabase
    };
};