import { NextResponse } from 'next/server';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    return NextResponse.json({ error: 'Edição desativada. Use a tela de Catálogo/Preços para gerenciar seus veículos.' }, { status: 405 });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    return NextResponse.json({ error: 'Exclusão desativada. Use a tela de Catálogo/Preços e zere o valor para remover o veículo.' }, { status: 405 });
}
