const asId = (value: any): string | null => (value ? value.toString() : null);

export function serializeLead(doc: any) {
    const obj = typeof doc.toObject === 'function' ? doc.toObject() : doc;
    return {
        id: obj._id.toString(),
        name: obj.name,
        phone: obj.phone,
        email: obj.email ?? null,
        source: obj.source ?? null,
        campaign: obj.campaign ?? null,
        tags: obj.tags ?? [],
        firstMessage: obj.firstMessage ?? null,
        stageId: obj.stageId.toString(),
        ownerId: asId(obj.ownerId),
        ownerName: obj.ownerName ?? null,
        lostReason: obj.lostReason ?? null,
        lostReasonNote: obj.lostReasonNote ?? null,
        notes: obj.notes ?? null,
        iaPausedAt: obj.iaPausedAt ?? null,
        iaResumeAt: obj.iaResumeAt ?? null,
        createdAt: obj.createdAt,
        updatedAt: obj.updatedAt,
    };
}

export function serializeStage(doc: any) {
    const obj = typeof doc.toObject === 'function' ? doc.toObject() : doc;
    return {
        id: obj._id.toString(),
        name: obj.name,
        order: obj.order,
        color: obj.color ?? '#E5E7EB',
        type: obj.type ?? 'open',
    };
}

export function serializeEvent(doc: any, stageNames: Map<string, string>) {
    const obj = typeof doc.toObject === 'function' ? doc.toObject() : doc;
    const from = asId(obj.fromStageId);
    const to = asId(obj.toStageId);
    return {
        id: obj._id.toString(),
        type: obj.type,
        fromStageId: from,
        fromStageName: from ? stageNames.get(from) ?? 'Fase removida' : null,
        toStageId: to,
        toStageName: to ? stageNames.get(to) ?? 'Fase removida' : null,
        actor: obj.actor,
        actorEmail: obj.actorEmail ?? null,
        lostReason: obj.lostReason ?? null,
        createdAt: obj.createdAt,
    };
}
