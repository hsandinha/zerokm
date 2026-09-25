import type { MetadataRoute } from 'next';

/** Ícone e nome ao salvar o site na tela inicial do celular. */
export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'CNV - Comércio Nacional de Veículos 0KM',
        short_name: 'CNV',
        start_url: '/',
        display: 'standalone',
        background_color: '#102333',
        theme_color: '#102333',
        icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
    };
}
