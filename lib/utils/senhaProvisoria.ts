import { randomInt } from 'crypto';

/** Sem 0/o, 1/l: a senha é ditada por telefone ou WhatsApp. */
const ALFABETO = 'abcdefghijkmnpqrstuvwxyz23456789';

/** Senha provisória para o primeiro acesso; a troca é obrigatória ao entrar. */
export function gerarSenhaProvisoria(tamanho = 8): string {
    let senha = '';
    for (let i = 0; i < tamanho; i++) senha += ALFABETO[randomInt(ALFABETO.length)];
    return senha;
}
