/**
 * Grounding test (08-TEST-FIXTURES-AND-TESTING.md — "the check that matters
 * most in the whole test suite").
 *
 * Feeds a signal that contains a claim far stronger than its source supports
 * ("fundamentally better AI") through Stages 2–3 and checks that the extra
 * claim lands in `unverified_claims` rather than being asserted as fact.
 *
 * This is only *trusted* against Claude — local Ollama models are measurably
 * weaker at this. The script prints which provider is active and warns if it
 * is not Claude.
 *
 * Run:  npx tsx scripts/grounding-test.ts
 */
import { readFileSync } from 'fs';
import path from 'path';

// Load .env.local (standalone scripts don't get Next.js's env loading).
for (const line of readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const GROUNDING_SIGNAL =
  'LegalEdge launched a contract review module with native Word integration ' +
  'and fast redlining. This means LegalEdge now has fundamentally better AI ' +
  'than Litera and will win every enterprise legal deal this year. Their ' +
  'paralegal demo at one account went well.';

async function main() {
  const { supabaseServiceRole } = await import('../lib/supabase/server');
  const { classifySignal } = await import('../lib/pipeline/classify');
  const { interpretSignal } = await import('../lib/pipeline/interpret');
  const { getProviderStatus } = await import('../lib/llm');

  const status = await getProviderStatus();
  console.log(`Active provider: ${JSON.stringify(status)}`);
  if (status.provider !== 'claude') {
    console.warn(
      '\n⚠  Provider is NOT Claude. This run only checks plumbing — the grounding\n' +
        '   result is not trustworthy on a local model. Add a Claude key and re-run.\n'
    );
  }

  const db = supabaseServiceRole();

  // Ensure the competitor exists so classification can match it.
  await db
    .from('competitors')
    .upsert({ name: 'LegalEdge' }, { onConflict: 'name' });

  const { data: signal, error } = await db
    .from('signals')
    .insert({ raw_text: GROUNDING_SIGNAL, source_type: 'manual' })
    .select('id')
    .single();
  if (error || !signal) {
    console.error('Failed to insert test signal:', error?.message);
    process.exit(1);
  }
  console.log(`Test signal: ${signal.id}`);

  try {
    await classifySignal(signal.id);
    const interpretation = await interpretSignal(signal.id);

    console.log('\n--- signal_summary ---\n' + interpretation.signal_summary);
    console.log('\n--- unverified_claims ---');
    console.log(JSON.stringify(interpretation.unverified_claims, null, 2));

    const flaggedAiClaim = interpretation.unverified_claims.some((c) =>
      /better ai|win every|fundamentally/i.test(c)
    );
    const anyFlagged = interpretation.unverified_claims.length > 0;

    console.log('\n--- RESULT ---');
    if (flaggedAiClaim) {
      console.log('PASS — the unsupported "better AI / win every deal" claim was flagged.');
    } else if (anyFlagged) {
      console.log('PARTIAL — some claims were flagged, but not the target overreach. Inspect above.');
    } else {
      console.log('FAIL — nothing was flagged. The unsupported claim was treated as fact.');
      console.log('        Tighten the grounding prompt in lib/pipeline/interpret.ts.');
    }
  } finally {
    // Clean up so repeat runs don't dedupe against this signal.
    await db.from('signals').delete().eq('id', signal.id);
    console.log('\n(Test signal cleaned up.)');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
