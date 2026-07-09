import { NextResponse } from 'next/server';
import { supabaseForRequest } from '@/lib/supabase/server';

/**
 * Phase 3 reporting view. All metrics are computed from data already captured
 * in signal_outputs (05-HUMAN-REVIEW-WORKFLOW.md / 09-BUILD-PHASES-AND-TASKS.md):
 *  - approval rate without edits — clearest proxy for pipeline quality
 *  - edit rate — how often reviewers change content before approving
 *  - review-queue throughput — created_at → reviewed_at, watch for upward trend
 * Broken down per output_type. Selects only needed columns (optimization note).
 */
export async function GET() {
  const supabase = supabaseForRequest();
  const { data, error } = await supabase
    .from('signal_outputs')
    .select('output_type, approved, rejected, edited_at, created_at, reviewed_at, published_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];

  const summarize = (subset: typeof rows) => {
    const total = subset.length;
    const approved = subset.filter((r) => r.approved).length;
    const rejected = subset.filter((r) => r.rejected).length;
    const published = subset.filter((r) => r.published_at).length;
    const pending = subset.filter((r) => !r.approved && !r.rejected).length;
    const edited = subset.filter((r) => r.edited_at).length;
    const approvedNoEdit = subset.filter((r) => r.approved && !r.edited_at).length;

    // Throughput: mean minutes from creation to first review decision.
    const reviewed = subset.filter((r) => r.reviewed_at);
    const throughputMin =
      reviewed.length > 0
        ? reviewed.reduce(
            (sum, r) =>
              sum + (new Date(r.reviewed_at!).getTime() - new Date(r.created_at).getTime()) / 60000,
            0
          ) / reviewed.length
        : null;

    return {
      total,
      approved,
      rejected,
      published,
      pending,
      edited,
      // Of approved items, how many needed no edit — the key quality proxy.
      approval_rate_without_edits: approved > 0 ? approvedNoEdit / approved : null,
      edit_rate: total > 0 ? edited / total : null,
      avg_review_minutes: throughputMin,
    };
  };

  const byType: Record<string, ReturnType<typeof summarize>> = {};
  for (const type of Array.from(new Set(rows.map((r) => r.output_type)))) {
    byType[type] = summarize(rows.filter((r) => r.output_type === type));
  }

  return NextResponse.json({ overall: summarize(rows), by_output_type: byType });
}
