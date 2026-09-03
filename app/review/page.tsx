import { supabaseForRequest } from '@/lib/supabase/server';
import NeedsAttention from './NeedsAttention';
import ReviewList, { type ReviewItem } from './ReviewList';
import NotificationBanner from '../components/NotificationBanner';

const URGENCY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

export default async function ReviewPage() {
  const supabase = supabaseForRequest();

  // Mirrors the query in 05-HUMAN-REVIEW-WORKFLOW.md; ordering is applied
  // client-side here since Supabase's query builder doesn't do CASE ORDER BY.
  const { data: outputs, error } = await supabase
    .from('signal_outputs')
    .select('id, audience, output_type, unverified_claims, created_at, signal_id, signals(raw_text, source_type), signal_id')
    .eq('approved', false)
    .is('published_at', null);

  if (error) {
    return <p className="text-red-600">Failed to load review queue: {error.message}</p>;
  }

  const signalIds = Array.from(new Set((outputs ?? []).map((o: any) => o.signal_id)));
  const { data: classifications } = await supabase
    .from('signal_classification')
    .select('signal_id, urgency')
    .in('signal_id', signalIds.length ? signalIds : ['00000000-0000-0000-0000-000000000000']);

  const urgencyBySignal = new Map((classifications ?? []).map((c) => [c.signal_id, c.urgency]));

  const sorted = [...(outputs ?? [])].sort((a: any, b: any) => {
    const ua = URGENCY_ORDER[urgencyBySignal.get(a.signal_id) ?? 'low'] ?? 2;
    const ub = URGENCY_ORDER[urgencyBySignal.get(b.signal_id) ?? 'low'] ?? 2;
    if (ua !== ub) return ua - ub;
    return a.created_at.localeCompare(b.created_at);
  });

  const highCount = sorted.filter((o: any) => (urgencyBySignal.get(o.signal_id) ?? 'low') === 'high').length;
  const mediumCount = sorted.filter((o: any) => (urgencyBySignal.get(o.signal_id) ?? 'low') === 'medium').length;
  const lowCount = sorted.filter((o: any) => (urgencyBySignal.get(o.signal_id) ?? 'low') === 'low').length;
  const unverifiedCount = sorted.filter((o: any) => (o.unverified_claims ?? []).length > 0).length;

  // Flatten to a serializable shape for the client list (pagination lives there).
  const items: ReviewItem[] = sorted.map((o: any) => ({
    id: o.id,
    signalId: o.signal_id,
    audience: o.audience,
    outputType: o.output_type,
    urgency: urgencyBySignal.get(o.signal_id) ?? 'low',
    hasUnverified: (o.unverified_claims ?? []).length > 0,
    sourceType: o.signals?.source_type ?? null,
    createdAt: o.created_at,
    preview: o.signals?.raw_text ?? '',
  }));

  return (
    <div className="space-y-5">
      <NotificationBanner />
      <h1 className="page-title">Review queue</h1>

      {/* Summary - a clean row of stat tiles at the top */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Pending" value={sorted.length} tone="slate" />
        <StatTile label="High" value={highCount} tone="red" />
        <StatTile label="Medium" value={mediumCount} tone="amber" />
        <StatTile label="Low" value={lowCount} tone="gray" />
        <StatTile label="Unverified" value={unverifiedCount} tone="orange" />
      </div>

      <NeedsAttention />

      <ReviewList items={items} />
    </div>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'slate' | 'red' | 'amber' | 'gray' | 'orange';
}) {
  const color =
    tone === 'red'
      ? 'text-red-600'
      : tone === 'amber'
      ? 'text-amber-600'
      : tone === 'orange'
      ? 'text-neon-orange'
      : tone === 'gray'
      ? 'text-gray-500'
      : 'text-gray-900';
  return (
    <div className="card card-p">
      <div className={`text-2xl font-semibold ${color}`}>{value}</div>
      <div className="mt-0.5 text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
    </div>
  );
}
