import { NextResponse } from 'next/server';
import { supabaseServiceRole } from '@/lib/supabase/server';
import { DISTRIBUTORS, requireRole } from '@/lib/auth/roles';
import {
  findExistingSignalBySourceRef,
  findExistingSignalByText,
  rerunSignal,
} from '@/lib/pipeline/orchestrate';

// Reads request state and live data, so it must never be statically
// evaluated at build time.
export const dynamic = 'force-dynamic';

/**
 * The bridge between the two jobs the tool does.
 *
 * The Feed is the newspaper - a PM reads it, nobody approves anything, per
 * Dale's PRD ("No approval step - notes shown directly to PMs"). Signals is
 * the drafting desk - a PMM writes four team-specific versions of an update
 * and each one is approved before it goes out. Those stay separate screens on
 * purpose; merging them would put an approval step on the Feed, which the PRD
 * explicitly rules out.
 *
 * What was missing was a way to get a Feed item onto the drafting desk without
 * a PMM retyping it into the (deliberately hidden) manual-entry screen. This
 * is that one step: take a Feed item's own text, hand it to the same pipeline
 * every other signal goes through, and send the PMM straight to the result.
 *
 * PMM/Admin only - a Product Manager reads the Feed and was never meant to
 * trigger distribution from it.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireRole(DISTRIBUTORS);
  if (!guard.ok) return guard.response;

  const db = supabaseServiceRole();
  const { data: update, error } = await db
    .from('competitor_updates')
    .select('content, competitor_name, source_url, relevance_note, grounded_document')
    .eq('id', params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!update) return NextResponse.json({ error: 'That update no longer exists.' }, { status: 404 });

  // Same "Competitor: X\n\n<text>" shape the relevance-note generator already
  // uses (lib/feed/ingest.ts) - it is what lets the classify stage identify
  // the right competitor from plain text, since no competitor_id is passed at
  // signal creation.
  //
  // The note is carried across too. Producing it already cost a model call and
  // it was written against Litera's own roadmap and positioning, so the feed
  // knows things the raw Crayon text does not - which Litera product answers
  // this, and which document says so. Sending only `content` made the pipeline
  // start from less than we already had, and it showed: on the Cosmos DB vector
  // search item the feed named Lito's Firm AI Search, while the packaged
  // version named no Litera product at all and simply restated the advice
  // Crayon's own analyst had written into the source text.
  //
  // It is kept separate from the source text rather than pasted into it, so the
  // grounding rules still treat Crayon's words as the only thing that counts as
  // fact about the competitor.
  //
  // The heading says "do not refer to this section" because the first attempt
  // did exactly that: the summary came back reading "the signal advises
  // positioning Litera's differentiation around…", which talks about its own
  // input instead of the competitor, and is the kind of meta-sentence the
  // packaging prompts already forbid.
  const raw_text = [
    `Competitor: ${update.competitor_name}`,
    '',
    update.content,
    ...(update.relevance_note
      ? [
          '',
          '--- Background for your own reasoning. Use it to judge what matters,',
          '--- but never quote it or refer to it. It is not part of the source.',
          update.grounded_document
            ? `(from ${update.grounded_document}) ${update.relevance_note}`
            : update.relevance_note,
        ]
      : []),
  ].join('\n');

  // One feed item raises one signal, keyed on the item itself rather than on
  // its text. Text is too fragile a key here: any change to how the text is
  // assembled - carrying the note across did exactly this - makes every
  // previously escalated item look new and escalate a second time.
  //
  // The text check stays as a fallback, for signals raised before this key
  // existed and for the same wording arriving through another route.
  const sourceRef = `feed:${params.id}`;
  const existing =
    (await findExistingSignalBySourceRef(sourceRef)) ?? (await findExistingSignalByText(raw_text));
  if (existing) {
    if (existing.status === 'error') {
      rerunSignal(existing.id).catch((err) => console.error('[send-to-signals] rerun error:', err));
      return NextResponse.json({ id: existing.id, rerun: true }, { status: 202 });
    }
    return NextResponse.json({ id: existing.id, deduped: true });
  }

  const { data: signal, error: insertErr } = await db
    .from('signals')
    .insert({
      raw_text,
      source_type: 'crayon',
      source_ref: sourceRef,
      // The Crayon link moves here rather than being lost to the new ref. It
      // is what the signal page shows as the source, and several feed items
      // can share one link, which is why it cannot be the key.
      ...(update.source_url
        ? { source_links: [{ ref: 'Crayon', url: update.source_url }] }
        : {}),
      submitted_by: guard.actor.id,
    })
    .select('id')
    .single();

  if (insertErr || !signal) {
    return NextResponse.json({ error: insertErr?.message ?? 'could not create the signal' }, { status: 500 });
  }

  // Deliberately NOT started here. The signal is left as a draft and the page
  // we redirect to runs it - that page already auto-processes anything it finds
  // in draft, because opening a pending signal is the intent to process it.
  //
  // Starting it here as well produced two concurrent runs: this one fired, the
  // redirect landed before the status had moved off 'draft', and the page
  // started a second. Each wrote a full set of outputs, so every escalated feed
  // item came back with twelve cards instead of six.
  return NextResponse.json({ id: signal.id }, { status: 201 });
}
