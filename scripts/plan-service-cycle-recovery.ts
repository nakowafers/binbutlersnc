import fs from 'fs';

const { buildBackfillPlan } = await import(new URL('../src/lib/reports/serviceCycleRecovery.ts', import.meta.url).href);

async function main(): Promise<void> {
    const inputPath = process.argv.at(2);
    if (!inputPath || inputPath.startsWith('--')) {
        throw new Error('Usage: npx tsx scripts/plan-service-cycle-recovery.ts INPUT.json [--apply]');
    }
    if (process.argv.includes('--apply')) {
        throw new Error('This planner never writes. Review the dry-run plan and provide an allowlisted execution store separately.');
    }
    const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    const plan = buildBackfillPlan(input);
    console.log(JSON.stringify({ mode: 'dry_run', plan }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
