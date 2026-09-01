'use client';

import { useEffect, useState, useCallback } from 'react';
import Loading from '../components/Loading';
import NotificationBanner from '../components/NotificationBanner';
import { audienceLabel } from '@/lib/audience';

type Row = {
  id: string;
  audience: string;
  output_type: string;
  content: string;
  published_at: string;
  signal_id: string;
  source_type: string | null;
  competitor: string | null;
};

const AUDIENCES = ['sales', 'product', 'marketing', 'leadership'];
const PAGE_SIZE = 12;

// One published-output card. Content is clamped to 3 lines by default so long
// outputs don't blow up the page; a Show more/less toggle expands it.
function DashboardCard({ row: r }: { row: Row }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = r.content.length > 220;
  return (
    <li className="card card-p">
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <span className="pill">{audienceLabel(r.audience)}</span>
        <span>{r.output_type}</span>
        {r.competitor && <span className="text-gray-700">· {r.competitor}</span>}
        {r.source_type && <span>· via {r.source_type}</span>}
        <span className="ml-auto">{new Date(r.published_at).toLocaleDateString()}</span>
      </div>
      <p className={`mt-2 whitespace-pre-wrap text-sm text-gray-700 ${expanded ? '' : 'clamp-3'}`}>
        {r.content}
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs font-medium text-accent hover:text-accent-hover"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </li>
  );
}

export default function DashboardPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [competitors, setCompetitors] = useState<string[]>([]);
  const [audience, setAudience] = useState('');
  const [competitor, setCompetitor] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (audience) qs.set('audience', audience);
    if (competitor) qs.set('competitor', competitor);
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    const res = await fetch(`/api/dashboard?${qs.toString()}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? 'failed to load');
      setLoading(false);
      return;
    }
    setError(null);
    setRows(json.outputs);
    setCompetitors(json.competitors);
    setPage(1); // reset to first page whenever filters change
    setLoading(false);
  }, [audience, competitor, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <NotificationBanner />
      <h1 className="page-title">Dashboard — published outputs</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
        {/* Content — left */}
        <div className="space-y-4">
          {loading ? (
            <div className="card">
              <Loading label="Loading outputs…" />
            </div>
          ) : (
            <>
              <p className="muted text-sm">
                {rows.length} published output(s)
                {rows.length > PAGE_SIZE && ` · showing ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, rows.length)}`}
              </p>

              {rows.length === 0 && (
                <div className="card card-p">
                  <p className="muted">Nothing published yet for these filters.</p>
                </div>
              )}

              <ul className="space-y-3">
                {pageRows.map((r) => (
                  <DashboardCard key={r.id} row={r} />
                ))}
              </ul>

              {pageCount > 1 && (
                <div className="flex items-center justify-center gap-2 pt-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="btn btn-outline"
                  >
                    Previous
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        onClick={() => setPage(n)}
                        className={`h-8 w-8 rounded-lg text-sm font-medium ${
                          n === currentPage
                            ? 'bg-accent text-ink-on'
                            : 'border border-gray-300 bg-surface text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    disabled={currentPage === pageCount}
                    className="btn btn-outline"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Filters — right */}
        <aside>
          <div className="card card-p space-y-4 lg:sticky lg:top-6">
            <h2 className="section-title">Filters</h2>
            <div className="flex flex-col gap-1">
              <label className="field-label">Audience</label>
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                className="select"
              >
                <option value="">All</option>
                {AUDIENCES.map((a) => (
                  <option key={a} value={a}>{audienceLabel(a)}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="field-label">Competitor</label>
              <select
                value={competitor}
                onChange={(e) => setCompetitor(e.target.value)}
                className="select"
              >
                <option value="">All</option>
                {competitors.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="field-label">From</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="input"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="field-label">To</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="input"
              />
            </div>
            {(audience || competitor || from || to) && (
              <button
                onClick={() => {
                  setAudience('');
                  setCompetitor('');
                  setFrom('');
                  setTo('');
                }}
                className="btn btn-outline w-full"
              >
                Clear
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
