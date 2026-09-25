export interface EnderecoCep {
    street: string;
    neighborhood: string;
    city: string;
    state: string;
}

/** Consulta o CEP no ViaCEP. Retorna null para CEP incompleto, inexistente ou falha de rede. */
export async function buscarCep(cep: string): Promise<EnderecoCep | null> {
    const limpo = cep.replace(/\D/g, '');
    if (limpo.length !== 8) return null;
    try {
        const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
        if (!res.ok) return null;
        const data = await res.json();
        if (data.erro) return null;
        return {
            street: data.logradouro || '',
            neighborhood: data.bairro || '',
            city: data.localidade || '',
            state: data.uf || '',
        };
    } catch {
        return null;
    }
}
