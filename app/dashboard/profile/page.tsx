'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getUserProfile, updateUserProfile, UserProfileData } from './actions';
import styles from './profile.module.css';
import { MaskedInput } from '@/components/operator/MaskedInput';

export default function ProfilePage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [formData, setFormData] = useState<UserProfileData>({
        displayName: '',
        email: '',
        phoneNumber: '',
        cpf: '',
        address: {
            street: '',
            number: '',
            complement: '',
            neighborhood: '',
            city: '',
            state: '',
            zipCode: ''
        }
    });

    useEffect(() => {
        async function loadProfile() {
            try {
                const data = await getUserProfile();
                if (data) {
                    setFormData(data);
                }
            } catch (error) {
                console.error('Error loading profile:', error);
                alert('Erro ao carregar perfil');
            } finally {
                setLoading(false);
            }
        }

        loadProfile();
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        if (name.includes('.')) {
            const [parent, child] = name.split('.');
            setFormData(prev => ({
                ...prev,
                [parent]: {
                    ...(prev as any)[parent],
                    [child]: value
                }
            }));
        } else {
            setFormData(prev => ({
                ...prev,
                [name]: value
            }));
        }
    };

    const handleAddressChange = (field: string, value: string) => {
        setFormData(prev => ({
            ...prev,
            address: {
                ...prev.address!,
                [field]: value
            }
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const result = await updateUserProfile(formData);
            if (result.success) {
                alert('Perfil atualizado com sucesso!');
                router.refresh();
            } else {
                alert('Erro ao atualizar perfil: ' + result.error);
            }
        } catch (error) {
            console.error('Error updating profile:', error);
            alert('Erro ao atualizar perfil');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.content}>
                    <div className={styles.form}>
                        <p>Carregando...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.content}>
                <div className={styles.header}>
                    <h1 className={styles.title}>Meu Perfil</h1>
                    <p className={styles.subtitle}>Gerencie suas informações pessoais e de contato</p>
                </div>

                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.section}>
                        <h2 className={styles.sectionTitle}>Informações Pessoais</h2>
                        <div className={styles.grid}>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Nome Completo</label>
                                <input
                                    type="text"
                                    name="displayName"
                                    value={formData.displayName || ''}
                                    onChange={handleChange}
                                    className={styles.input}
                                    required
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.label}>Email</label>
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email || ''}
                                    className={styles.input}
                                    disabled
                                    title="O email não pode ser alterado"
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.label}>CPF</label>
                                <MaskedInput
                                    mask="cpf"
                                    value={formData.cpf || ''}
                                    onChange={(value: string) => setFormData(prev => ({ ...prev, cpf: value }))}
                                    placeholder="000.000.000-00"
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.label}>Telefone</label>
                                <MaskedInput
                                    mask="phone"
                                    value={formData.phoneNumber || ''}
                                    onChange={(value: string) => setFormData(prev => ({ ...prev, phoneNumber: value }))}
                                    placeholder="(00) 00000-0000"
                                />
                            </div>
                        </div>
                    </div>

                    <div className={styles.section}>
                        <h2 className={styles.sectionTitle}>Endereço</h2>
                        <div className={styles.grid}>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>CEP</label>
                                <MaskedInput
                                    mask="cep"
                                    value={formData.address?.zipCode || ''}
                                    onChange={(value: string) => handleAddressChange('zipCode', value)}
                                    placeholder="00000-000"
                                />
                            </div>

                            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                                <label className={styles.label}>Rua</label>
                                <input
                                    type="text"
                                    value={formData.address?.street || ''}
                                    onChange={(e) => handleAddressChange('street', e.target.value)}
                                    className={styles.input}
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.label}>Número</label>
                                <input
                                    type="text"
                                    value={formData.address?.number || ''}
                                    onChange={(e) => handleAddressChange('number', e.target.value)}
                                    className={styles.input}
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.label}>Complemento</label>
                                <input
                                    type="text"
                                    value={formData.address?.complement || ''}
                                    onChange={(e) => handleAddressChange('complement', e.target.value)}
                                    className={styles.input}
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.label}>Bairro</label>
                                <input
                                    type="text"
                                    value={formData.address?.neighborhood || ''}
                                    onChange={(e) => handleAddressChange('neighborhood', e.target.value)}
                                    className={styles.input}
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.label}>Cidade</label>
                                <input
                                    type="text"
                                    value={formData.address?.city || ''}
                                    onChange={(e) => handleAddressChange('city', e.target.value)}
                                    className={styles.input}
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.label}>Estado</label>
                                <input
                                    type="text"
                                    value={formData.address?.state || ''}
                                    onChange={(e) => handleAddressChange('state', e.target.value)}
                                    className={styles.input}
                                    maxLength={2}
                                    placeholder="UF"
                                />
                            </div>
                        </div>
                    </div>

                    <div className={styles.actions}>
                        <button
                            type="button"
                            onClick={() => router.back()}
                            className={`${styles.button} ${styles.cancelButton}`}
                            disabled={saving}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className={`${styles.button} ${styles.saveButton}`}
                            disabled={saving}
                        >
                            {saving ? 'Salvando...' : 'Salvar Alterações'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
