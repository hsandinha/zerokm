import { vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import React from 'react';

// Mock next/navigation
vi.mock('next/navigation', () => ({
    useRouter: () => ({
        push: vi.fn(),
        replace: vi.fn(),
        back: vi.fn(),
        prefetch: vi.fn(),
    }),
    useSearchParams: () => new URLSearchParams(),
    usePathname: () => '/',
}));

// Mock next/image
vi.mock('next/image', () => ({
    default: (props: any) => {
        return React.createElement('img', props);
    },
}));

// Mock next/link
vi.mock('next/link', () => ({
    default: ({ children, href, ...props }: any) => {
        return React.createElement('a', { href, ...props }, children);
    },
}));

// Mock next-auth
vi.mock('next-auth', () => ({
    getServerSession: vi.fn(),
}));

afterEach(() => {
    vi.restoreAllMocks();
});
