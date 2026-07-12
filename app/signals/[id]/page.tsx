'use client';

import { useEffect, useState, useCallback } from 'react';
import Loading from '../../components/Loading';

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
  signal: { id: string; raw_text: string; source_type: string; status: string };
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
  leadership: 'L',
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

  async function publish(outputId: string) {
    const res = await fetch(`/api/outputs/${outputId}/publish`, { method: 'POST' });
    const json = await res.json();
    if (!res.ok) {
      alert(json.error ?? 'publish failed');
      return;
    }
    load();
  }

  // Separate distribution channel from the Teams publish above — sends the
  // approved output via Brevo email to a recipient the reviewer types in.
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

  if (error) return <p className="text-red-600">{error}</p>;
  if (!data) return <Loading />;

  const { signal, classification, outputs } = data;
  const byAudience = outputs.reduce<Record<string, SignalOutput[]>>((acc, o) => {
    (acc[o.audience] ??= []).push(o);
    return acc;
  }, {});
  const approvedCount = outputs.filter((o) => o.approved).length;

  return (
    <div className="space-y-5">
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
          <SourceSignal text={signal.raw_text} />

          {['draft', 'classified', 'interpreted'].includes(signal.status) && (
            <div className="card">
              <Loading label="Pipeline running…" />
            </div>
          )}
          {signal.status === 'error' && (
            <div className="card card-p text-sm text-red-600">
              Pipeline failed for this signal — retry from the Review queue, or switch model.
            </div>
          )}

          {Object.entries(byAudience).map(([audience, rows]) => (
            <div key={audience} className="space-y-3">
              <h2 className="section-title capitalize">{audience}</h2>
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
                    <div key={k} className="flex items-center justify-between">
                      <span className="capitalize text-gray-600">{k}</span>
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

// Collapsible source-signal panel (the raw text the outputs were generated from).
function SourceSignal({ text }: { text: string }) {
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
        <span className="text-sm font-semibold capitalize text-gray-900">{output.audience}</span>
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
            <button
              onClick={() => setEmailOpen(false)}
              className="btn btn-ghost text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {emailError && <p className="mt-2 text-xs text-red-600">{emailError}</p>}
    </div>
  );
}
