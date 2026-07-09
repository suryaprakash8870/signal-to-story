/**
 * Single-call demo of the NEW Sales packaging prompt (tone calibration +
 * battlecard rewrite). One model call only — safe on a low-memory machine.
 * Mirrors the exact prompt assembly in lib/pipeline/package.ts.
 *
 * Run:  npx tsx scripts/prompt-demo.ts
 */
import { readFileSync } from 'fs';
import path from 'path';
for (const line of readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

// Same grounding tail as package.ts (kept in sync by hand for this demo).
const GROUNDING_TAIL =
  'Do not state the unverified claims as fact. If a claim is unverified, ' +
  'simply leave it out of the content — do NOT mention it, and do NOT write ' +
  'meta-instructions such as "confirm any unverified claims" or "verify ' +
  'pricing details". Write concise, ORIGINAL text in your own words — do NOT ' +
  'copy or paste sentences, headers, or dialogue from the source signal. ' +
  'MATCH YOUR CERTAINTY TO THE EVIDENCE: a product launch, webpage, or ' +
  'announcement is an EARLY signal to watch, NOT a proven market threat. Do ' +
  'not use alarmist or absolute language ("will upend", "dominate", "destroy ' +
  'our stronghold", "direct threat") unless the signal actually proves it. ' +
  'Prefer measured, factual phrasing ("worth watching", "a new entrant in", ' +
  '"early-stage"). The content must read as finished, ready-to-send copy for ' +
  'the reader, with no notes about the writing or review process. Return only ' +
  'the JSON object.';

async function main() {
  const { getLLMProvider, getProviderStatus } = await import('../lib/llm');
  const { salesPackagingSchema } = await import('../lib/llm/schemas');

  console.log('Provider:', JSON.stringify(await getProviderStatus()), '\n');

  const interp = {
    signal_summary:
      'SignForge published a product page for a new e-signature module with a ' +
      'native Salesforce add-in and AI-assisted clause tagging. It shows a demo ' +
      'CTA and a pricing teaser but no actual price, and names no customers.',
    why_it_matters:
      'A competitor is moving into Salesforce-native e-signature — worth ' +
      'tracking, though it is an early launch with no proof of traction.',
    unverified_claims: ['SignForge has real customer traction or a proven price point'],
  };

  const userPrompt = `You are writing Sales-facing content from a competitive signal.

Signal summary: ${interp.signal_summary}
Why it matters: ${interp.why_it_matters}
Unverified claims (do not present these as settled fact): ${JSON.stringify(interp.unverified_claims)}

Return a JSON object with:
- talk_track: a short, confident talking point a Sales rep can use in a
  live conversation, grounded only in the signal summary above
- battlecard_snippet: an objection/response pair formatted as
  "Objection: ... Response: ...". The objection MUST be the specific
  competitive angle raised by THIS signal (name the competitor and their
  actual hook — e.g. their integration, their pricing move, their new
  feature), phrased as a prospect would raise it. The response MUST directly
  counter that specific angle with a concrete differentiator — never generic
  filler like "we offer training" or "we ensure a smooth transition"
- live_talking_points: a 1-2 minute spoken-style summary suitable for a
  live meeting update (e.g. a weekly revenue sync), not a written post

${GROUNDING_TAIL}`;

  const llm = await getLLMProvider();
  const t = Date.now();
  const result = await llm.generateStructured({
    systemPrompt: 'You write Sales-facing content from a competitive signal. Respond with JSON only.',
    userPrompt,
    schema: salesPackagingSchema,
  });
  console.log(`(one call, ${Math.round((Date.now() - t) / 1000)}s)\n`);
  console.log('--- talk_track ---\n' + result.talk_track);
  console.log('\n--- battlecard_snippet ---\n' + result.battlecard_snippet);
  console.log('\n--- live_talking_points ---\n' + result.live_talking_points);
}

main().catch((e) => { console.error('ERROR:', e instanceof Error ? e.message : e); process.exit(1); });
