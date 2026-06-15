'use client';

import { VehicleService } from '../../lib/services/vehicleService';

export default function TestPage() {
    const testDirectFirebase = async () => {
        try {
            console.log('Testando cadastro direto no Firebase...');

            const testVehicle = {
                modelo: 'Corolla XEi',
                opcionais: 'Ar condicionado, Direção hidráulica',
                cor: 'Prata',
                frete: 0,
                preco: 85000,
                ano: '2024',
                status: 'A faturar' as const,
                cidade: 'São Paulo',
                estado: 'SP',
                combustivel: 'Flex' as const,
                transmissao: 'Automático' as const,
                observacoes: 'Teste direto via VehicleService',
                dataEntrada: new Date().toLocaleDateString('pt-BR'),
                nomeContato: 'João Silva',
                telefone: '11987654321',
                operador: 'Sistema'
            };

            const vehicleId = await VehicleService.addVehicle(testVehicle);
            console.log('Sucesso! Veículo cadastrado com ID:', vehicleId);
            alert(`Sucesso! Veículo cadastrado com ID: ${vehicleId}`);
        } catch (error) {
            console.error('Erro no teste direto:', error);
            alert(`Erro no teste: ${error instanceof Error ? error.message : String(error)}`);
        }
    };

    const listVehicles = async () => {
        try {
            console.log('Buscando veículos...');
            const vehicles = await VehicleService.getAllVehicles();
            console.log('Veículos encontrados:', vehicles);
            alert(`Encontrados ${vehicles.length} veículos no banco`);
        } catch (error) {
            console.error('Erro ao listar veículos:', error);
            alert(`Erro ao listar: ${error instanceof Error ? error.message : String(error)}`);
        }
    };

    return (
        <div style={{ padding: '20px' }}>
            <h1>Teste de Cadastro de Veículo</h1>

            <div style={{ marginBottom: '20px' }}>
                <button
                    onClick={testDirectFirebase}
                    style={{
                        padding: '10px 20px',
                        backgroundColor: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        marginRight: '10px'
                    }}
                >
                    Cadastrar Veículo Teste
                </button>

                <button
                    onClick={listVehicles}
                    style={{
                        padding: '10px 20px',
                        backgroundColor: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer'
                    }}
                >
                    Listar Veículos
                </button>
            </div>
        </div>
    );
}