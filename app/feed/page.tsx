'use client';

import { useEffect, useState, useCallback } from 'react';
import Loading from '../components/Loading';

// The PM pull interface: pick a competitor, see what they shipped in the last
// 30 days, filtered to product signal, each update carrying a "why it matters
// for us" note grounded in our own strategy documents.
//
// No approval gate here - PMs see updates directly, as confirmed with the client.

type FeedCompetitor = { name: string; count: number; latest: string; ids: string[] };

type FeedUpdate = {
  id: string;
  competitor_name: string;
  update_type: string;
  content: string;
  source_url: string | null;
  published_at: string;
  relevance_note: string | null;
  grounded_document: string | null;
  grounded_section: string | null;
};

const TYPE_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'release', label: 'Release' },
  { value: 'pricing', label: 'Pricing' },
  { value: 'win', label: 'Customer win' },
  { value: 'expansion', label: 'Expansion' },
  { value: 'risk', label: 'Risk' },
];

const TYPE_STYLE: Record<string, string> = {
  release: 'bg-orange-50 text-[#c74a1b]',
  pricing: 'bg-amber-50 text-amber-700',
  win: 'bg-emerald-50 text-emerald-700',
  expansion: 'bg-blue-50 text-blue-700',
  risk: 'bg-red-50 text-red-700',
  other: 'bg-gray-100 text-gray-600',
};

const TYPE_LABEL: Record<string, string> = {
  release: 'Release',
  pricing: 'Pricing',
  win: 'Customer win',
  expansion: 'Expansion',
  risk: 'Risk',
  other: 'Update',
};

// Which updates this browser has already seen, so the left rail can show a
// "new since you last looked" count. Mirrors the pattern used by the
// notification bell elsewhere in the app.
const SEEN_KEY = 'compete_feed_seen';

function getSeen(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function markSeen(ids: string[]) {
  if (typeof window === 'undefined' || ids.length === 0) return;
  const seen = getSeen();
  ids.forEach((id) => seen.add(id));
  localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
}

export default function FeedPage() {
  const [competitors, setCompetitors] = useState<FeedCompetitor[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [updates, setUpdates] = useState<FeedUpdate[]>([]);
  const [typeFilter, setTypeFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [loadingUpdates, setLoadingUpdates] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [notingId, setNotingId] = useState<string | null>(null);

  // Ask box - queries Crayon directly, so it reaches past the 30-day feed window.
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<{ answer: string; sources: { name?: string; url?: string }[] } | null>(null);
  const [askError, setAskError] = useState<string | null>(null);

  useEffect(() => {
    setSeen(getSeen());
  }, []);

  const loadCompetitors = useCallback(async () => {
    try {
      const res = await fetch('/api/feed');
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'failed to load');
        return;
      }
      setCompetitors(json.competitors ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCompetitors();
  }, [loadCompetitors]);

  const loadUpdates = useCallback(async (name: string, type: string) => {
    setLoadingUpdates(true);
    try {
      const res = await fetch(`/api/feed?competitor=${encodeURIComponent(name)}&type=${type}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'failed to load updates');
        return;
      }
      const rows: FeedUpdate[] = json.updates ?? [];
      setUpdates(rows);
      // Viewing a competitor clears its unread count.
      markSeen(rows.map((r) => r.id));
      setSeen(getSeen());
    } finally {
      setLoadingUpdates(false);
    }
  }, []);

  function selectCompetitor(name: string) {
    setSelected(name);
    setTypeFilter('all');
    loadUpdates(name, 'all');
  }

  function changeFilter(type: string) {
    setTypeFilter(type);
    if (selected) loadUpdates(selected, type);
  }

  async function refresh() {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch('/api/feed/refresh', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'refresh failed');
        return;
      }
      await loadCompetitors();
      if (selected) await loadUpdates(selected, typeFilter);
    } finally {
      setRefreshing(false);
    }
  }

  async function generateNote(id: string) {
    setNotingId(id);
    try {
      const res = await fetch(`/api/feed/${id}/note`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'could not generate the note');
        return;
      }
      setUpdates((prev) =>
        prev.map((u) =>
          u.id === id
            ? {
                ...u,
                relevance_note: json.note,
                grounded_document: json.groundedIn?.documentTitle ?? null,
                grounded_section: json.groundedIn?.heading ?? null,
              }
            : u
        )
      );
    } finally {
      setNotingId(null);
    }
  }

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setAsking(true);
    setAskError(null);
    setAnswer(null);
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAskError(json.error ?? 'the question could not be answered');
        return;
      }
      setAnswer({ answer: json.answer, sources: json.sources ?? [] });
    } catch (err) {
      setAskError(err instanceof Error ? err.message : String(err));
    } finally {
      setAsking(false);
    }
  }

  function unreadCount(c: FeedCompetitor) {
    return c.ids.filter((id) => !seen.has(id)).length;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Competitor feed</h1>
          <p className="muted mt-1 text-sm">
            What competitors shipped in the last 30 days, with what it means for us.
          </p>
        </div>
        <button onClick={refresh} disabled={refreshing} className="btn btn-primary disabled:opacity-50">
          {refreshing ? 'Refreshing…' : 'Refresh from Crayon'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Ask box - queries Crayon directly, so unlike the feed it is not limited
          to the last 30 days. */}
      <div className="card card-p space-y-3">
        <form onSubmit={ask} className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about any competitor, e.g. what changed in pricing last quarter?"
            className="input min-w-0 flex-1"
          />
          <button
            type="submit"
            disabled={!question.trim() || asking}
            className="btn btn-primary shrink-0 disabled:opacity-50"
          >
            {asking ? 'Asking…' : 'Ask'}
          </button>
        </form>
        <p className="muted text-xs">
          Searches the full competitive history, not just the last 30 days.
        </p>

        {askError && <p className="text-sm text-red-600">{askError}</p>}

        {answer && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
              {answer.answer}
            </p>
            {answer.sources.length > 0 && (
              <div className="mt-3 border-t border-gray-200 pt-2">
                <div className="field-label mb-1.5">Sources</div>
                <ul className="space-y-1">
                  {answer.sources.map((s, i) => (
                    <li key={i} className="text-xs">
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#c74a1b] hover:underline"
                      >
                        {s.name || s.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <Loading />
      ) : competitors.length === 0 ? (
        <div className="card card-p muted text-sm">
          No updates yet. Click “Refresh from Crayon” to pull the latest competitor activity.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[240px_1fr]">
          {/* Left rail - competitors with unread counts */}
          <aside className="space-y-1">
            {competitors.map((c) => {
              const unread = unreadCount(c);
              const active = selected === c.name;
              return (
                <button
                  key={c.name}
                  onClick={() => selectCompetitor(c.name)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    active ? 'bg-orange-50 font-medium text-[#c74a1b]' : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <span className="min-w-0 truncate">{c.name}</span>
                  {unread > 0 ? (
                    <span className="shrink-0 rounded-full bg-[#c74a1b] px-1.5 py-0.5 text-[11px] font-semibold text-white">
                      {unread}
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs text-gray-400">{c.count}</span>
                  )}
                </button>
              );
            })}
          </aside>

          {/* Feed */}
          <div className="min-w-0 space-y-3">
            {!selected ? (
              <div className="card card-p muted text-sm">
                Select a competitor to see what they have shipped recently.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {TYPE_FILTERS.map((f) => (
                    <button
                      key={f.value}
                      onClick={() => changeFilter(f.value)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        typeFilter === f.value
                          ? 'border-[#c74a1b] bg-orange-50 text-[#c74a1b]'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {loadingUpdates ? (
                  <Loading />
                ) : updates.length === 0 ? (
                  <div className="card card-p muted text-sm">
                    No {typeFilter === 'all' ? '' : TYPE_LABEL[typeFilter]?.toLowerCase()} updates for{' '}
                    {selected} in the last 30 days.
                  </div>
                ) : (
                  updates.map((u) => (
                    <div key={u.id} className="card card-p space-y-3">
                      <div className="flex items-center gap-2 text-xs">
                        <span
                          className={`rounded-full px-2 py-0.5 font-medium ${
                            TYPE_STYLE[u.update_type] ?? TYPE_STYLE.other
                          }`}
                        >
                          {TYPE_LABEL[u.update_type] ?? 'Update'}
                        </span>
                        <span className="text-gray-400">
                          {new Date(u.published_at).toLocaleDateString()}
                        </span>
                        {!seen.has(u.id) && (
                          <span className="rounded-full bg-[#c74a1b] px-2 py-0.5 text-[11px] font-semibold text-white">
                            New
                          </span>
                        )}
                      </div>

                      <p className="text-sm leading-relaxed text-gray-800">{u.content}</p>

                      {/* Why it matters for us - the core of the tool */}
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <div className="field-label mb-1">Why it matters for us</div>
                        {u.relevance_note ? (
                          <>
                            <p className="text-sm leading-relaxed text-gray-700">{u.relevance_note}</p>
                            {u.grounded_document && (
                              <p className="mt-1.5 text-xs text-gray-500">
                                Based on <span className="font-medium">{u.grounded_document}</span>
                                {u.grounded_section ? ` → ${u.grounded_section}` : ''}
                              </p>
                            )}
                          </>
                        ) : (
                          <button
                            onClick={() => generateNote(u.id)}
                            disabled={notingId === u.id}
                            className="text-xs font-medium text-[#c74a1b] hover:text-[#a83e16] disabled:opacity-50"
                          >
                            {notingId === u.id ? 'Generating…' : 'Generate note'}
                          </button>
                        )}
                      </div>

                      {u.source_url && (
                        <a
                          href={u.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block text-xs font-medium text-[#c74a1b] hover:underline"
                        >
                          View source →
                        </a>
                      )}
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
