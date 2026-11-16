'use client';

import { modalStyles } from './AdminModal';
import type { UserProfile } from '@/lib/types/auth';

/** Perfis da equipe interna. Um diretivo e um operacional, no máximo (lib/utils/userProfiles.ts). */
export const GRUPOS_DE_PERFIS_DA_EQUIPE: Array<{ key: string; label: string; hint: string; profiles: Array<{ value: UserProfile; label: string }> }> = [
    { key: 'diretivo', label: 'Diretivo', hint: 'escolha um', profiles: [{ value: 'administrador', label: 'Administrador' }, { value: 'gerente', label: 'Gerente' }, { value: 'marketing', label: 'Marketing' }] },
    { key: 'operacional', label: 'Operacional', hint: 'escolha um', profiles: [{ value: 'operador', label: 'Operador' }, { value: 'vendedor', label: 'Vendedor' }, { value: 'administrativo', label: 'Administrativo' }] },
];

export const PERFIS_DA_EQUIPE: UserProfile[] = GRUPOS_DE_PERFIS_DA_EQUIPE.flatMap(g => g.profiles.map(p => p.value));

/** Grupos de perfis da equipe. Radio com clique para desmarcar: cada grupo é opcional. */
export function PerfisDaEquipe({ name, selected, restricted = [], onToggle }: {
    name: string;
    selected: UserProfile[];
    /** Perfis que quem está criando não pode conceder. */
    restricted?: UserProfile[];
    onToggle: (profile: UserProfile) => void;
}) {
    return <>
        {GRUPOS_DE_PERFIS_DA_EQUIPE.map(group => (
            <fieldset key={group.key} className={modalStyles.group}>
                <legend className={modalStyles.groupLabel}>{group.label} <span className={modalStyles.groupHint}>· {group.hint}</span></legend>
                <div className={modalStyles.choices}>
                    {group.profiles.map(profile => {
                        const disabled = restricted.includes(profile.value);
                        return (
                            <label key={profile.value} className={modalStyles.choice}>
                                <input type="radio" name={`${name}-${group.key}`} checked={selected.includes(profile.value)} onClick={() => !disabled && onToggle(profile.value)} disabled={disabled} readOnly />
                                {profile.label}
                            </label>
                        );
                    })}
                </div>
            </fieldset>
        ))}
    </>;
}
