import { useState, useEffect } from 'react';
import { VehicleService, Vehicle } from '../services/vehicleService';
// import { useSession } from 'next-auth/react';

export const useVehicleDatabase = () => {
    // const { data: session } = useSession();
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Inicializar banco com dados de exemplo se estiver vazio
    const initializeDatabase = async () => {
        try {
            // Buscar todos os veículos do banco
            const allVehicles = await VehicleService.getAllVehicles();
            setVehicles(allVehicles);
            setLoading(false);
        } catch (err) {
            console.error('Erro ao inicializar banco:', err);
            setError('Erro ao carregar veículos');
            setLoading(false);
        }
    };

    // Buscar veículos com filtros
    const searchVehicles = async (filters: any) => {
        try {
            setLoading(true);
            const results = await VehicleService.searchVehicles(filters);
            setVehicles(results);
            setLoading(false);
        } catch (err) {
            console.error('Erro ao buscar veículos:', err);
            setError('Erro ao buscar veículos');
            setLoading(false);
        }
    };

    // Adicionar novo veículo
    const addVehicle = async (vehicle: Omit<Vehicle, 'id'>) => {
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
    };

    // Atualizar veículo
    const updateVehicle = async (id: string, updates: Partial<Vehicle>) => {
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
    };

    // Deletar veículo
    const deleteVehicle = async (id: string) => {
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
    };

    useEffect(() => {
        initializeDatabase();
    }, []);

    return {
        vehicles,
        loading,
        error,
        searchVehicles,
        addVehicle,
        updateVehicle,
        deleteVehicle,
        refreshVehicles: initializeDatabase
    };
};