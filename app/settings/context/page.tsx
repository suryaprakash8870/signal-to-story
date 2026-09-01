'use client';

import { useEffect, useState, useCallback } from 'react';
import Loading from '../../components/Loading';

// The context library: Litera's own strategy documents. These ground the
// "why it matters for us" note, so keeping them current is the whole point of
// the "last updated" date shown against each one.

type ContextDoc = {
  id: string;
  doc_type: string;
  title: string;
  file_name: string | null;
  word_count: number | null;
  section_count?: number;
  updated_at: string;
};

const DOC_TYPES: { value: string; label: string; hint: string }[] = [
  { value: 'roadmap', label: 'Product Roadmap', hint: 'What we are building and when' },
  { value: 'gtm_strategy', label: 'GTM Strategy', hint: 'Go-to-market plan and priorities' },
  { value: 'positioning', label: 'Positioning', hint: 'How we position and differentiate' },
  { value: 'growth_story', label: 'Growth Story', hint: 'The GrowthTech narrative' },
  { value: 'company_profile', label: 'Company Profile', hint: 'Products, facts, and context' },
  { value: 'other', label: 'Other', hint: 'Any other strategy document' },
];

function labelFor(t: string) {
  return DOC_TYPES.find((d) => d.value === t)?.label ?? t;
}

export default function ContextLibraryPage() {
  const [docs, setDocs] = useState<ContextDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [docType, setDocType] = useState('roadmap');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/context');
      const json = await res.json();
      if (!res.ok) setError(json.error ?? 'failed to load');
      else setDocs(json.documents ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('doc_type', docType);
      const res = await fetch('/api/context', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'upload failed');
      setMessage(
        `Uploaded. ${json.words} words, split into ${json.sections} sections the agent can reference.`
      );
      setFile(null);
      const input = document.getElementById('context-file') as HTMLInputElement | null;
      if (input) input.value = '';
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/context/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? 'delete failed');
      return;
    }
    load();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="page-title">Context library</h1>
        <p className="muted mt-1 text-sm">
          Our own strategy documents. The agent reads these to explain what a competitor update
          means for us specifically, and names the document it drew on. Upload a newer version of a
          document to replace the current one.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-emerald-700">{message}</p>}

      <div className="card card-p space-y-3">
        <div>
          <label className="field-label">Document type</label>
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="select mt-1 w-full"
          >
            {DOC_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label} — {t.hint}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">File</label>
          <input
            id="context-file"
            type="file"
            accept=".docx,.txt,.md"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="input mt-1 w-full text-sm"
          />
          <p className="muted mt-1 text-xs">Word (.docx), plain text, or markdown.</p>
        </div>
        <button onClick={upload} disabled={!file || busy} className="btn btn-primary disabled:opacity-50">
          {busy ? 'Processing…' : 'Upload document'}
        </button>
      </div>

      {loading ? (
        <Loading />
      ) : docs.length === 0 ? (
        <div className="card card-p muted text-sm">
          No documents yet. Until something is uploaded, relevance notes stay general rather than
          referencing our strategy.
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map((d) => (
            <div key={d.id} className="card card-p">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                      {labelFor(d.doc_type)}
                    </span>
                  </div>
                  <h2 className="section-title mt-1 truncate">{d.title}</h2>
                  <p className="muted mt-1 text-xs">
                    {d.word_count ?? 0} words · {d.section_count ?? 0} sections · last updated{' '}
                    {new Date(d.updated_at).toLocaleDateString()}
                  </p>
                </div>
                <button onClick={() => remove(d.id)} className="btn btn-ghost shrink-0 text-red-600">
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
