'use client';

import { useEffect, useState, useCallback } from 'react';
import Loading from '../../components/Loading';

type KnownFact = { fact: string; source: string; added_by?: string; added_at?: string };
type Competitor = {
  id: string;
  name: string;
  known_facts: KnownFact[];
  tier: number | null;
  created_at: string;
};

// Tier labels (1 = Primary, 2 = Secondary, 3 = Watching). Data only for now.
const TIER_LABELS: Record<number, string> = { 1: 'Primary', 2: 'Secondary', 3: 'Watching' };

export default function CompetitorsPage() {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/competitors');
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'failed to load');
        return;
      }
      setCompetitors(json.competitors);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addCompetitor() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'create failed');
      setNewName('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function deleteCompetitor(id: string) {
    const res = await fetch(`/api/competitors/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? 'delete failed');
      return;
    }
    load();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="page-title">Competitors</h1>
      <p className="muted text-sm">
        Known facts here ground the interpretation stage — the model treats them as fact, and
        anything beyond them gets flagged as an unverified claim.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="card card-p">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="New competitor name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="input flex-1"
          />
          <button
            onClick={addCompetitor}
            disabled={!newName.trim() || busy}
            className="btn btn-primary"
          >
            Add competitor
          </button>
        </div>
      </div>

      {loading ? (
        <Loading />
      ) : (
        <>
          {competitors.length === 0 && <p className="muted">No competitors yet.</p>}
          {competitors.map((c) => (
            <CompetitorCard key={c.id} competitor={c} onChange={load} onDelete={() => deleteCompetitor(c.id)} />
          ))}
        </>
      )}
    </div>
  );
}

function CompetitorCard({
  competitor,
  onChange,
  onDelete,
}: {
  competitor: Competitor;
  onChange: () => void;
  onDelete: () => void;
}) {
  const [fact, setFact] = useState('');
  const [source, setSource] = useState('internal');
  const [busy, setBusy] = useState(false);

  async function setTier(tier: number | null) {
    await fetch(`/api/competitors/${competitor.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier }),
    });
    onChange();
  }

  async function addFact() {
    setBusy(true);
    try {
      await fetch(`/api/competitors/${competitor.id}/facts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fact, source }),
      });
      setFact('');
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function removeFact(index: number) {
    await fetch(`/api/competitors/${competitor.id}/facts`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fact_index: index }),
    });
    onChange();
  }

  return (
    <div className="card card-p">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="section-title truncate">{competitor.name}</h2>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
              competitor.tier ? 'bg-orange-50 text-[#c74a1b]' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {competitor.tier ? `Tier ${competitor.tier} · ${TIER_LABELS[competitor.tier]}` : 'Unassigned'}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <select
            aria-label="Tier"
            value={competitor.tier ?? ''}
            onChange={(e) => setTier(e.target.value === '' ? null : Number(e.target.value))}
            className="select w-auto text-xs"
          >
            <option value="">Unassigned</option>
            <option value="1">Tier 1 · Primary</option>
            <option value="2">Tier 2 · Secondary</option>
            <option value="3">Tier 3 · Watching</option>
          </select>
          <button onClick={onDelete} className="btn btn-ghost text-red-600">
            Delete
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {(competitor.known_facts ?? []).length === 0 && (
          <p className="muted text-xs">No known facts yet.</p>
        )}
        {(competitor.known_facts ?? []).map((f, i) => (
          <div key={i} className="flex items-start justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
            <div>
              <span className="text-gray-900">{f.fact}</span>
              <span className="ml-2 text-xs text-gray-500">
                ({f.source}{f.added_at ? ` · ${f.added_at}` : ''})
              </span>
            </div>
            <button
              onClick={() => removeFact(i)}
              className="shrink-0 text-xs text-gray-500 hover:text-red-600"
            >
              remove
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          type="text"
          placeholder="Add a known fact…"
          value={fact}
          onChange={(e) => setFact(e.target.value)}
          className="input flex-1"
        />
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="select w-auto"
        >
          <option value="internal">internal</option>
          <option value="public">public</option>
          <option value="verified">verified</option>
        </select>
        <button
          onClick={addFact}
          disabled={!fact.trim() || busy}
          className="btn btn-outline"
        >
          Add fact
        </button>
      </div>
    </div>
  );
}
