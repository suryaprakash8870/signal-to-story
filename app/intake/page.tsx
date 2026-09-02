'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

// Source options shown in the intake dropdown. `value` must stay one of the
// DB-allowed source_type values; only the shown label changes. `teams`,
// `website`, and `news` are hidden for now (commented out below).
const SOURCE_TYPES: { value: string; label: string }[] = [
  { value: 'gong', label: 'Gong' },
  { value: 'salesforce', label: 'Salesforce' },
  { value: 'crayon', label: 'Crayon' },
  // { value: 'teams', label: 'Teams' },
  // { value: 'website', label: 'Website' },
  // { value: 'news', label: 'News' },
  { value: 'manual', label: 'Direct entry' },
];

export default function IntakePage() {
  const [rawText, setRawText] = useState('');
  const [sourceType, setSourceType] = useState('manual');
  const [sourceRef, setSourceRef] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the composer like ChatGPT: starts small, expands with content up
  // to a max height (then scrolls).
  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, Math.round(window.innerHeight * 0.45))}px`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: rawText, source_type: sourceType, source_ref: sourceRef || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'submit failed');
      router.push(`/signals/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative isolate">
      {/* Ambient background — a single centered blue glow that gently breathes */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="animate-breathe absolute left-1/2 top-1/2 h-[420px] w-[600px] rounded-full bg-accent/20 blur-3xl" />
      </div>

      <div className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center justify-center">
        <h1 className="mb-6 text-center text-2xl font-semibold text-gray-900">
          What signal do you want to analyze?
        </h1>
      <form onSubmit={handleSubmit} className="w-full">
        {/* Chat-style composer: borderless textarea with a toolbar + send button */}
        <div className="rounded-2xl border border-gray-200 bg-surface p-3 shadow-sm transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
          <textarea
            ref={taRef}
            placeholder="Paste a competitive signal — a call snippet, a competitor move, some news…"
            value={rawText}
            onChange={(e) => {
              setRawText(e.target.value);
              autoGrow(e.target);
            }}
            rows={2}
            className="max-h-[45vh] w-full resize-none overflow-y-auto border-0 bg-transparent px-2 py-1 text-sm leading-relaxed text-gray-900 placeholder-gray-400 outline-none focus:ring-0"
            required
          />
          <div className="mt-2 flex items-center gap-2">
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
              aria-label="Source"
              className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-600 outline-none focus:border-accent"
            >
              {SOURCE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Source link (optional)"
              value={sourceRef}
              onChange={(e) => setSourceRef(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700 outline-none placeholder:text-gray-400 focus:border-accent"
            />
            <button
              type="submit"
              disabled={submitting}
              aria-label="Submit signal"
              className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-action text-action-ink transition-colors hover:bg-action-hover disabled:opacity-50"
            >
              {submitting ? (
                <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              )}
            </button>
          </div>
        </div>
        {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}
        <p className="mt-3 text-center text-xs text-gray-400">
          The pipeline will classify, interpret, route, and package it for each team.
        </p>
      </form>
      </div>
    </div>
  );
}
