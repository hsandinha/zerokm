/**
 * Backfill do histórico do funil para leads criados antes da coleção `LeadEvent`.
 *
 * Cria um evento `created` para todo lead que não tem nenhum evento, usando a data de
 * criação do próprio lead e a fase em que ele está hoje. É o máximo que dá para
 * reconstruir: as movimentações passadas não foram registradas em lugar nenhum.
 *
 * Sem isso, esses leads não aparecem em "Leads criados" nem na conversão por origem.
 *
 * É idempotente — rodar duas vezes não duplica nada.
 *
 * Uso:  npx tsx scripts/backfill-lead-events.ts [--dry-run]
 */
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const dryRun = process.argv.includes('--dry-run');

const LeadSchema = new mongoose.Schema({}, { collection: 'leads', strict: false });
const LeadEventSchema = new mongoose.Schema({}, { collection: 'leadevents', strict: false });

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('Defina MONGODB_URI em .env.local');

    await mongoose.connect(uri);
    console.log(dryRun ? '— DRY RUN, nada será gravado —' : '— gravando —');

    const Lead = mongoose.model('LeadBackfill', LeadSchema);
    const LeadEvent = mongoose.model('LeadEventBackfill', LeadEventSchema);

    const leads: any[] = await Lead.find({}).lean();
    const comEvento = new Set(
        (await LeadEvent.distinct('leadId')).map((id: any) => id.toString()),
    );

    const faltando = leads.filter(lead => !comEvento.has(lead._id.toString()));

    console.log(`leads: ${leads.length} | já com histórico: ${comEvento.size} | a criar: ${faltando.length}`);

    if (faltando.length === 0 || dryRun) {
        faltando.slice(0, 10).forEach(l => console.log(`  • ${l.name} (${l.createdAt?.toISOString?.() ?? 's/ data'})`));
        await mongoose.disconnect();
        return;
    }

    const docs = faltando.map(lead => ({
        leadId: lead._id,
        concessionariaId: lead.concessionariaId ?? null,
        type: 'created',
        fromStageId: null,
        toStageId: lead.stageId,
        actor: 'user',
        // A data do evento é a do lead: é o que torna o filtro por período correto.
        createdAt: lead.createdAt ?? new Date(),
        updatedAt: lead.createdAt ?? new Date(),
    }));

    const res = await LeadEvent.insertMany(docs);
    console.log(`${res.length} evento(s) 'created' criados.`);

    await mongoose.disconnect();
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
