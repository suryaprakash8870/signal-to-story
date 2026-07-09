'use client';

import { useEffect, useState } from 'react';
import Loading from '../components/Loading';

type Metrics = {
  total: number;
  approved: number;
  rejected: number;
  published: number;
  pending: number;
  edited: number;
  approval_rate_without_edits: number | null;
  edit_rate: number | null;
  avg_review_minutes: number | null;
};

type AnalyticsData = { overall: Metrics; by_output_type: Record<string, Metrics> };

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
const mins = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)} min`);

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/analytics');
        const json = await res.json();
        if (!res.ok) setError(json.error ?? 'failed to load');
        else setData(json);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (error) return <p className="text-red-600">{error}</p>;
  if (loading || !data) return <Loading />;

  const o = data.overall;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Analytics</h1>
        <p className="muted mt-1 text-sm">
          Approval and edit rates are the clearest signal of whether pipeline quality is good enough.
          Watch review throughput for an upward trend — if it climbs, the queue is backing up.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Approval rate (no edits)" value={pct(o.approval_rate_without_edits)} />
        <Stat label="Edit rate" value={pct(o.edit_rate)} />
        <Stat label="Avg review time" value={mins(o.avg_review_minutes)} />
        <Stat label="Published" value={String(o.published)} />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat small label="Total outputs" value={String(o.total)} />
        <Stat small label="Approved" value={String(o.approved)} />
        <Stat small label="Rejected" value={String(o.rejected)} />
        <Stat small label="Pending" value={String(o.pending)} />
      </div>

      <div className="card card-p">
        <h2 className="section-title mb-3">By output type</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="field-label text-gray-500">
              <tr>
                <th className="py-1 pr-4 font-medium">Output type</th>
                <th className="py-1 pr-4 font-medium">Total</th>
                <th className="py-1 pr-4 font-medium">Approved</th>
                <th className="py-1 pr-4 font-medium">Approval (no edits)</th>
                <th className="py-1 pr-4 font-medium">Edit rate</th>
                <th className="py-1 pr-4 font-medium">Avg review</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.by_output_type).map(([type, m]) => (
                <tr key={type} className="border-t border-gray-200 text-gray-900">
                  <td className="py-2 pr-4">{type}</td>
                  <td className="py-2 pr-4">{m.total}</td>
                  <td className="py-2 pr-4">{m.approved}</td>
                  <td className="py-2 pr-4">{pct(m.approval_rate_without_edits)}</td>
                  <td className="py-2 pr-4">{pct(m.edit_rate)}</td>
                  <td className="py-2 pr-4">{mins(m.avg_review_minutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="muted text-xs">
        Note: Teams adoption/engagement (reactions) is the intended primary adoption metric, but
        Teams Incoming Webhooks are one-way and can't report reactions — that requires the Microsoft
        Graph API and a registered bot (out of scope). Gmail SMTP has no open tracking either.
      </p>
    </div>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="card card-p">
      <div className={`font-semibold text-gray-900 ${small ? 'text-xl' : 'text-3xl'}`}>{value}</div>
      <div className="field-label mt-1">{label}</div>
    </div>
  );
}
