'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Loading from '../../components/Loading';
import { markSignalSeen } from '../../components/useNotifications';
import { audienceLabel } from '@/lib/audience';

// Small "Back" control shown at the top of the signal detail page — returns to
// the previous view (Signals list, Review queue, etc.) without using the nav.
function BackButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.back()}
      className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m15 18-6-6 6-6" />
      </svg>
      Back
    </button>
  );
}

type SignalOutput = {
  id: string;
  audience: string;
  output_type: string;
  content: string;
  unverified_claims: string[];
  approved: boolean;
  published_at: string | null;
};

type SignalDetail = {
  signal: {
    id: string;
    raw_text: string;
    source_type: string;
    status: string;
    source_links?: { ref: string; url: string }[] | null;
    interpretation?: {
      signal_summary?: string;
      why_it_matters?: string;
      what_to_do_next?: string;
    } | null;
  };
  classification: {
    competitor_id: string | null;
    signal_type: string;
    business_area: string;
    urgency: string;
    audience_relevance: Record<string, string>;
  } | null;
  outputs: SignalOutput[];
};

const AUDIENCE_INITIAL: Record<string, string> = {
  sales: 'S',
  product: 'P',
  marketing: 'M',
  leadership: 'E',
};

// Default recipient per audience — prefilled in the "Send via Email" box, but
// always editable before sending.
const AUDIENCE_EMAIL: Record<string, string> = {
  sales: 'antony.onegtmlab@outlook.com',
  product: 'antony.onegtmlab@outlook.com',
  marketing: 'antony.onegtmlab@outlook.com',
  leadership: 'ajay@onegtmlab.com',
};

function levelBadge(level: string) {
  const l = level?.toLowerCase();
  if (l === 'high') return 'bg-orange-50 text-[#c74a1b]';
  if (l === 'medium') return 'bg-amber-50 text-amber-700';
  return 'bg-gray-100 text-gray-500';
}

function urgencyBadge(level: string) {
  const l = level?.toLowerCase();
  if (l === 'high') return 'bg-red-50 text-red-700';
  if (l === 'medium') return 'bg-amber-50 text-amber-700';
  return 'bg-gray-100 text-gray-600';
}

// Signal ids already auto-processed this page session — module-level so it
// survives StrictMode remounts and prevents duplicate pipeline runs.
const autoProcessedIds = new Set<string>();

export default function SignalDetailPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<SignalDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/signals/${params.id}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? 'failed to load');
      return;
    }
    setData(json);
    // Once processing has actually moved the signal past 'draft', drop the
    // local busy flag so the real pipeline progress (or error prompt) shows.
    if (json?.signal?.status && json.signal.status !== 'draft') setBusy(false);
  }, [params.id]);

  // Run the pipeline for this one signal (draft → generate, or retry an error).
  async function handleProcess() {
    setBusy(true);
    const res = await fetch(`/api/signals/${params.id}/process`, { method: 'POST' });
    const json = await res.json();
    if (!res.ok) {
      alert(json.error ?? 'process failed');
      setBusy(false);
      return;
    }
    load();
  }

  async function approve(outputId: string) {
    const res = await fetch(`/api/outputs/${outputId}/approve`, { method: 'PATCH' });
    const json = await res.json();
    if (!res.ok) {
      alert(json.error ?? 'approve failed');
      return;
    }
    load();
  }

  async function reject(outputId: string) {
    await fetch(`/api/outputs/${outputId}/reject`, { method: 'PATCH' });
    load();
  }

  async function saveEdit(outputId: string, content: string) {
    await fetch(`/api/outputs/${outputId}/edit`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    load();
  }

  async function saveInterpretation(what_to_do_next: string) {
    await fetch(`/api/signals/${params.id}/interpretation`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ what_to_do_next }),
    });
    load();
  }

  async function publish(outputId: string) {
    const res = await fetch(`/api/outputs/${outputId}/publish`, { method: 'POST' });
    const json = await res.json();
    if (!res.ok) {
      alert(json.error ?? 'publish failed');
      return;
    }
    load();
  }

  async function sendEmail(outputId: string, to: string) {
    const res = await fetch(`/api/outputs/${outputId}/publish-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to }),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error ?? 'email send failed');
    }
    load();
  }

  // Auto-process on open: opening a pending ('draft') signal IS the intent to
  // process it — no separate "Process" button. The module-level autoProcessedIds
  // set survives React StrictMode's double-mount, so a draft is never processed
  // twice (which is what created duplicate outputs). Errors are not auto-retried.
  useEffect(() => {
    if (!data) return;
    if (data.signal.status === 'draft' && !autoProcessedIds.has(params.id)) {
      autoProcessedIds.add(params.id);
      handleProcess();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Opening this signal marks it "seen" — drops it from the notification
  // badge/bell/banner immediately (Jira/GitHub-style read behavior).
  useEffect(() => {
    markSignalSeen(params.id);
  }, [params.id]);

  // On open, always play a short live "generating" sequence before revealing the
  // outputs — so the agent is visibly seen working, even for a signal whose
  // content is already in the DB. Genuinely in-flight signals show real progress
  // until packaged (see realProcessing below); this only adds the reveal step.
  const [revealed, setRevealed] = useState(false);
  const [simStatus, setSimStatus] = useState('draft');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setRevealed(false);
    setSimStatus('draft');
    const t1 = setTimeout(() => setSimStatus('classified'), 1200);
    const t2 = setTimeout(() => setSimStatus('interpreted'), 2600);
    const t3 = setTimeout(() => setRevealed(true), 5000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [params.id]);

  useEffect(() => {
    load();
    // Poll while the pipeline is still running — statuses before
    // 'packaged'/'error' mean Stages 2-5 are in flight server-side.
    const interval = setInterval(() => {
      setData((current) => {
        if (current && !['classified', 'interpreted', 'draft'].includes(current.signal.status)) {
          clearInterval(interval);
        }
        return current;
      });
      load();
    }, 2000);
    return () => clearInterval(interval);
  }, [load]);

  if (error)
    return (
      <div>
        <BackButton />
        <p className="text-red-600">{error}</p>
      </div>
    );
  if (!data)
    return (
      <div>
        <BackButton />
        <Loading />
      </div>
    );

  const { signal, classification, outputs } = data;
  const byAudience = outputs.reduce<Record<string, SignalOutput[]>>((acc, o) => {
    (acc[o.audience] ??= []).push(o);
    return acc;
  }, {});
  const approvedCount = outputs.filter((o) => o.approved).length;

  // A draft auto-processes on open; classified/interpreted = actively running.
  const realProcessing = ['classified', 'interpreted'].includes(signal.status);

  return (
    <div className="space-y-5">
      <BackButton />
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs">
          <span className="pill capitalize">{signal.source_type}</span>
          <span className="pill capitalize">{signal.status}</span>
        </div>
        <h1 className="page-title mt-2">Review &amp; approve</h1>
        <p className="muted mt-1 text-sm">
          {outputs.length} output(s) · {approvedCount} approved
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main — outputs */}
        <div className="space-y-5">
          <SourceSignal text={signal.raw_text} links={signal.source_links} />

          {signal.status === 'draft' || busy || realProcessing ? (
            <PipelineProgress status={realProcessing ? signal.status : 'draft'} />
          ) : signal.status === 'error' ? (
            <div className="card card-p flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm text-red-600">Processing failed — the AI provider may be busy.</p>
              <button onClick={handleProcess} className="btn btn-primary text-sm">Retry</button>
            </div>
          ) : !revealed ? (
            <PipelineProgress status={simStatus} />
          ) : (
            <>
              {signal.interpretation && (
                <InterpretationPanel
                  interp={signal.interpretation}
                  onSave={saveInterpretation}
                />
              )}
              {Object.entries(byAudience).map(([audience, rows]) => (
                <div key={audience} className="space-y-3">
                  <h2 className="section-title">{audienceLabel(audience)}</h2>
                  {rows.map((o) => (
                    <OutputCard
                      key={o.id}
                      output={o}
                      onApprove={() => approve(o.id)}
                      onReject={() => reject(o.id)}
                      onSaveEdit={(content) => saveEdit(o.id, content)}
                      onPublish={() => publish(o.id)}
                      onSendEmail={(to) => sendEmail(o.id, to)}
                    />
                  ))}
                </div>
              ))}
            </>
          )}
        </div>

        {/* Right — details */}
        <aside>
          <div className="card card-p space-y-4 lg:sticky lg:top-6">
            <h2 className="section-title">Details</h2>

            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="muted">Status</span>
                <span className="pill capitalize">{signal.status}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="muted">Source</span>
                <span className="capitalize text-gray-800">{signal.source_type}</span>
              </div>
            </div>

            {classification && (
              <>
                <div className="space-y-2 border-t border-gray-200 pt-4 text-sm">
                  <div className="field-label">Classification</div>
                  <div className="flex items-center justify-between">
                    <span className="muted">Type</span>
                    <span className="text-gray-800">{classification.signal_type}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="muted shrink-0">Business area</span>
                    <span className="text-right text-gray-800">{classification.business_area}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="muted">Urgency</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${urgencyBadge(classification.urgency)}`}>
                      {classification.urgency}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 border-t border-gray-200 pt-4 text-sm">
                  <div className="field-label">Audience relevance</div>
                  {Object.entries(classification.audience_relevance).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between gap-3">
                      <span className="text-gray-600">{audienceLabel(k)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${levelBadge(v)}`}>
                        {v}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

// Live, staged progress shown while the AI pipeline is still running — so a
// freshly-detected signal visibly moves through Classify → Interpret → Generate
// (driven by the 2s status poll) instead of the finished content just appearing.
// Clean centered spinner (the "Pipeline running…" look), with a live-updating
// label that reflects the current stage while the pipeline runs.
function PipelineProgress({ status }: { status: string }) {
  const label =
    status === 'interpreted'
      ? 'Generating tailored updates…'
      : status === 'classified'
      ? 'Interpreting the signal…'
      : 'Pipeline running…';
  return (
    <div className="card">
      <Loading label={label} />
    </div>
  );
}

// Collapsible source-signal panel (the raw text the outputs were generated from).
// The stored interpretation: what changed / why it matters / what to do next.
// Only "what to do next" is reviewer-editable; it is not required for approval.
function InterpretationPanel({
  interp,
  onSave,
}: {
  interp: { signal_summary?: string; why_it_matters?: string; what_to_do_next?: string };
  onSave: (v: string) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(interp.what_to_do_next ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await onSave(draft);
    setSaving(false);
    setEditing(false);
  }

  return (
    <div className="card space-y-3 p-4">
      {interp.signal_summary && (
        <div>
          <div className="field-label mb-1">What changed</div>
          <p className="text-sm leading-relaxed text-gray-700">{interp.signal_summary}</p>
        </div>
      )}
      {interp.why_it_matters && (
        <div>
          <div className="field-label mb-1">Why it matters</div>
          <p className="text-sm leading-relaxed text-gray-700">{interp.why_it_matters}</p>
        </div>
      )}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <div className="field-label">What to do next</div>
          {!editing && (
            <button
              onClick={() => {
                setDraft(interp.what_to_do_next ?? '');
                setEditing(true);
              }}
              className="text-xs font-medium text-[#c74a1b] hover:text-[#a83e16]"
            >
              Edit
            </button>
          )}
        </div>
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              className="input w-full text-sm"
            />
            <div className="flex gap-2">
              <button onClick={save} disabled={saving} className="btn btn-primary text-xs disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setEditing(false)} className="btn btn-outline text-xs">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-gray-700">
            {interp.what_to_do_next?.trim() || <span className="text-gray-400">No recommendation.</span>}
          </p>
        )}
      </div>
    </div>
  );
}

function SourceSignal({
  text,
  links,
}: {
  text: string;
  links?: { ref: string; url: string }[] | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card p-4">
      <div className="field-label mb-1">Source signal</div>
      <p className={`whitespace-pre-wrap text-sm leading-relaxed text-gray-700 ${open ? '' : 'clamp-3'}`}>
        {text}
      </p>
      {text.length > 200 && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="mt-1 text-xs font-medium text-[#c74a1b] hover:text-[#a83e16]"
        >
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
      {links && links.length > 0 && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <div className="field-label mb-1.5">Sources</div>
          <ul className="space-y-1">
            {links.map((l) => (
              <li key={l.url} className="flex items-start gap-1.5 text-xs">
                <span className="shrink-0 text-gray-400">[{l.ref}]</span>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-[#c74a1b] hover:underline"
                >
                  {l.url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// A Crayon-insight-style output card: source badge + type tag, editable content,
// and an action footer (approve / reject / publish / save edit).
function OutputCard({
  output,
  onApprove,
  onReject,
  onSaveEdit,
  onPublish,
  onSendEmail,
}: {
  output: SignalOutput;
  onApprove: () => void;
  onReject: () => void;
  onSaveEdit: (content: string) => void;
  onPublish: () => void;
  onSendEmail: (to: string) => Promise<void>;
}) {
  const [content, setContent] = useState(output.content);
  const dirty = content !== output.content;
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState(AUDIENCE_EMAIL[output.audience] ?? '');
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  async function handleSendEmail() {
    setEmailSending(true);
    setEmailError(null);
    try {
      await onSendEmail(emailTo);
      setEmailSent(true);
      setEmailOpen(false);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'email send failed');
    } finally {
      setEmailSending(false);
    }
  }

  return (
    <div className="card p-4">
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#c74a1b] text-[10px] font-bold text-white">
          {AUDIENCE_INITIAL[output.audience] ?? output.audience.charAt(0).toUpperCase()}
        </span>
        <span className="text-sm font-semibold text-gray-900">{audienceLabel(output.audience)}</span>
        <span className="text-xs text-gray-300">·</span>
        <span className="text-xs text-gray-500">{output.output_type}</span>
        {output.published_at ? (
          <span className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            Published
          </span>
        ) : output.approved ? (
          <span className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            Approved
          </span>
        ) : (
          <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
            Pending
          </span>
        )}
      </div>

      {/* Editable content */}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
        className="w-full resize-y rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm leading-relaxed text-gray-800 outline-none transition-colors focus:border-[#c74a1b] focus:bg-white focus:ring-2 focus:ring-[#c74a1b]/20"
      />

      {/* Action footer */}
      <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3">
        <button
          onClick={onApprove}
          disabled={output.approved}
          className="btn btn-primary text-xs disabled:opacity-40"
        >
          Approve
        </button>
        <button
          onClick={onReject}
          disabled={output.approved}
          className="btn btn-outline text-xs disabled:opacity-40"
        >
          Reject
        </button>
        {/* Publish only appears once approved and becomes inert after it posts. */}
        {output.approved && (
          <button
            onClick={onPublish}
            disabled={!!output.published_at}
            className="btn btn-success text-xs disabled:opacity-40"
          >
            {output.published_at ? 'Published to Teams' : 'Publish to Teams'}
          </button>
        )}
        {/* A second, independent distribution channel — send this output as an
            email via Brevo to a recipient the reviewer chooses. */}
        {output.approved && (
          <button
            onClick={() => setEmailOpen((v) => !v)}
            disabled={emailSending}
            className="btn btn-outline text-xs disabled:opacity-40"
          >
            {emailSent ? 'Email sent ✓' : 'Send via Email'}
          </button>
        )}
        {dirty && (
          <button onClick={() => onSaveEdit(content)} className="btn btn-ghost ml-auto text-xs">
            Save edit
          </button>
        )}
      </div>

      {emailOpen && (
        <div className="mt-3 flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:flex-row sm:items-center">
          <input
            type="email"
            value={emailTo}
            onChange={(e) => setEmailTo(e.target.value)}
            placeholder="recipient@company.com"
            className="input flex-1 text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSendEmail}
              disabled={emailSending || !emailTo}
              className="btn btn-primary text-xs disabled:opacity-40"
            >
              {emailSending ? 'Sending…' : 'Send'}
            </button>
            <button onClick={() => setEmailOpen(false)} className="btn btn-ghost text-xs">
              Cancel
            </button>
          </div>
        </div>
      )}
      {emailError && <p className="mt-2 text-xs text-red-600">{emailError}</p>}
    </div>
  );
}
