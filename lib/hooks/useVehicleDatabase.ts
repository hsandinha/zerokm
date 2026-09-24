import { useState, useEffect, useCallback, useRef } from 'react';
import { VehicleService, Vehicle } from '../services/vehicleService';
// import { useSession } from 'next-auth/react';

/**
 * `favoritos`: toda busca paginada traz só os favoritos do usuário logado.
 * `tipoInicial`: segmento da primeira carga (ex.: 'carro'), igual ao filtro que a tela abre selecionado.
 */
export const useVehicleDatabase = (accessProfile?: string, { favoritos = false, tipoInicial }: { favoritos?: boolean; tipoInicial?: string } = {}) => {
    // const { data: session } = useSession();
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [totalItems, setTotalItems] = useState(0);
    const [totalQuantidade, setTotalQuantidade] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    // Só a resposta da busca mais recente é aplicada: uma resposta antiga que chegue
    // depois (ex.: a carga inicial) não pode sobrescrever a lista filtrada.
    const seq = useRef(0);
    const ultimaBusca = useRef<any>(null);

    // Inicializar banco com dados de exemplo se estiver vazio
    const initializeDatabase = useCallback(async () => {
        try {
            // Buscar todos os veículos do banco (limitado a 50 por padrão para não pesar)
            const id = ++seq.current;
            const result = await VehicleService.getVehiclesPaginated({ page: 1, itemsPerPage: 50, accessProfile, favoritos, ...(tipoInicial ? { filters: { tipo: tipoInicial } } : {}) });
            if (id !== seq.current) return;
            setVehicles(result.data);
            setTotalItems(result.total);
            setTotalQuantidade(result.totalQuantidade || 0);
            setLoading(false);
        } catch (err) {
            console.error('Erro ao inicializar banco:', err);
            setError('Erro ao carregar veículos');
            setLoading(false);
        }
    }, [accessProfile, favoritos, tipoInicial]);

    // Buscar veículos paginados
    const getVehiclesPaginated = useCallback(async (options: any) => {
        try {
            setLoading(true);
            ultimaBusca.current = options;
            const id = ++seq.current;
            const result = await VehicleService.getVehiclesPaginated({ favoritos, ...options, accessProfile: options?.accessProfile || accessProfile });
            if (id !== seq.current) return result;
            setVehicles(result.data);
            setTotalItems(result.total);
            setTotalQuantidade(result.totalQuantidade || 0);
            setLoading(false);
            return result;
        } catch (err) {
            console.error('Erro ao buscar veículos paginados:', err);
            setError('Erro ao buscar veículos');
            setLoading(false);
            throw err;
        }
    }, [accessProfile, favoritos]);

    // Buscar veículos com filtros (mantido por compatibilidade, mas redirecionando para paginado)
    const searchVehicles = useCallback(async (filters: any) => {
        try {
            setLoading(true);
            const result = await VehicleService.getVehiclesPaginated({ filters, page: 1, itemsPerPage: 50, accessProfile });
            setVehicles(result.data);
            setTotalItems(result.total);
            setTotalQuantidade(result.totalQuantidade || 0);
            setLoading(false);
        } catch (err) {
            console.error('Erro ao buscar veículos:', err);
            setError('Erro ao buscar veículos');
            setLoading(false);
        }
    }, [accessProfile]);

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
            const allVehicles = await VehicleService.getAllVehicles(accessProfile);
            setVehicles(allVehicles);
            console.log('Hook: Lista de veículos atualizada');
            return true;
        } catch (err) {
            console.error('Hook: Erro ao adicionar veículo:', err);
            setError('Erro ao adicionar veículo');
            return false;
        }
    }, [accessProfile]);

    // Atualizar veículo
    const updateVehicle = useCallback(async (id: string, updates: Partial<Vehicle>) => {
        try {
            await VehicleService.updateVehicle(id, updates);
            // Recarregar lista
            const allVehicles = await VehicleService.getAllVehicles(accessProfile);
            setVehicles(allVehicles);
            return true;
        } catch (err) {
            console.error('Erro ao atualizar veículo:', err);
            setError('Erro ao atualizar veículo');
            return false;
        }
    }, [accessProfile]);

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

    // Recarrega a última busca feita pela tela (mantém filtros e página).
    const refreshVehicles = useCallback(
        () => (ultimaBusca.current ? getVehiclesPaginated(ultimaBusca.current).then(() => undefined) : initializeDatabase()),
        [getVehiclesPaginated, initializeDatabase],
    );

    return {
        vehicles,
        totalItems,
        totalQuantidade,
        loading,
        error,
        searchVehicles,
        getVehiclesPaginated,
        addVehicle,
        updateVehicle,
        deleteVehicle,
        deleteVehicles,
        refreshVehicles
    };
};