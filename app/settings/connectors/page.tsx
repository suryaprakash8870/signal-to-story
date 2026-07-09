'use client';

import { useEffect, useState, useCallback } from 'react';
import Loading from '../../components/Loading';

type Connector = {
  id: string;
  type: string;
  direction: string;
  mode: string;
  status: string;
  cadence: string | null;
  has_credential: boolean;
};

type LlmStatus = {
  active_provider: string;
  ollama_location: 'remote' | 'local' | null;
  model: string | null;
  api_key_set: boolean;
  api_provider: 'claude' | 'gemini' | null;
};

export default function ConnectorsSettingsPage() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [llm, setLlm] = useState<LlmStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [cRes, lRes] = await Promise.all([fetch('/api/connectors'), fetch('/api/settings/llm')]);
      const cJson = await cRes.json();
      const lJson = await lRes.json();
      if (!cRes.ok) {
        setError(cJson.error ?? 'failed to load connectors');
        return;
      }
      setConnectors(cJson.connectors);
      if (lRes.ok) setLlm(lJson);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const byType = (t: string) => connectors.find((c) => c.type === t);

  if (loading) {
    return <Loading />;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="page-title">Connectors &amp; AI</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {llm && <AiProviderCard llm={llm} onChange={load} />}
      {byType('teams') && <TeamsCard connector={byType('teams')!} onChange={load} />}
      {byType('gmail') && <GmailCard connector={byType('gmail')!} onChange={load} />}
      {(['salesforce', 'gong', 'crayon'] as const).map(
        (t) => byType(t) && <InboundCard key={t} connector={byType(t)!} onChange={load} />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'connected'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'error'
      ? 'bg-red-100 text-red-700'
      : 'bg-gray-100 text-gray-600';
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>{status}</span>;
}

type BackendOption = { id: string; label: string; kind: string };

function AiProviderCard({ llm, onChange }: { llm: LlmStatus; onChange: () => void }) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [backends, setBackends] = useState<BackendOption[]>([]);
  const [selected, setSelected] = useState('auto');
  const [loadingBackends, setLoadingBackends] = useState(false);

  const loadBackends = useCallback(async () => {
    setLoadingBackends(true);
    try {
      const res = await fetch('/api/settings/llm/backends');
      const json = await res.json();
      if (res.ok) {
        setBackends(json.backends);
        setSelected(json.selected);
      }
    } finally {
      setLoadingBackends(false);
    }
  }, []);

  useEffect(() => {
    loadBackends();
  }, [loadBackends]);

  async function selectBackend(id: string) {
    setSelected(id);
    setMessage(null);
    const res = await fetch('/api/settings/llm/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backend: id }),
    });
    const json = await res.json();
    if (!res.ok) setMessage(json.error ?? 'selection failed');
    onChange();
  }

  async function saveKey() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings/llm/api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: key }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'save failed');
      setKey('');
      setMessage(`Key saved — detected ${json.provider}. The pipeline now uses ${json.provider}.`);
      loadBackends();
      onChange();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeKey() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings/llm/api-key', { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'remove failed');
      setMessage('API key removed. The pipeline reverted to Ollama.');
      loadBackends();
      onChange();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card card-p">
      <div className="flex items-center justify-between">
        <h2 className="section-title">AI Provider</h2>
        <span className="pill bg-blue-50 text-blue-700">
          active: {llm.active_provider}
          {llm.active_provider === 'ollama' && llm.ollama_location
            ? ` · ${llm.ollama_location}`
            : ''}
          {llm.model ? ` · ${llm.model}` : ''}
        </span>
      </div>
      <p className="mt-3 text-xs text-gray-500">
        {llm.api_key_set
          ? `A ${llm.api_provider ?? 'hosted'} API key is stored — the pipeline uses it for every stage. Enter a new key to replace it, or remove it to revert to Ollama.`
          : 'No API key set — the pipeline uses Ollama (remote box when reachable, local otherwise). Paste a Claude (sk-ant-…) or Gemini (AIza…) key and it is detected and used automatically.'}
      </p>
      <input
        type="password"
        placeholder="sk-ant-… or AIza…"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        className="input mt-2"
      />
      <div className="mt-3 flex gap-2">
        <button
          onClick={saveKey}
          disabled={!key.trim() || busy}
          className="btn btn-primary"
        >
          {busy ? 'Saving…' : 'Save API key'}
        </button>
        {llm.api_key_set && (
          <button
            onClick={removeKey}
            disabled={busy}
            className="btn btn-outline"
          >
            Remove key (use Ollama)
          </button>
        )}
      </div>

      {/* Model selector — pin the pipeline to a specific model, or leave on
          Auto. Lists the hosted API plus every model on each reachable Ollama
          endpoint (the Mac on the WiFi and the local box). */}
      <div className="mt-4 border-t border-gray-200 pt-3">
        <div className="flex items-center justify-between gap-2">
          <label className="field-label">Model</label>
          <button
            onClick={loadBackends}
            disabled={loadingBackends}
            className="btn btn-ghost"
          >
            {loadingBackends ? 'Refreshing…' : 'Refresh list'}
          </button>
        </div>
        <select
          value={selected}
          onChange={(e) => selectBackend(e.target.value)}
          className="select mt-1"
        >
          {backends.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-500">
          Auto uses the API first, then the network Ollama, then local. Pin a specific model to
          always use it (with the others as fallback).
        </p>
      </div>

      {message && <p className="mt-2 text-xs text-gray-600">{message}</p>}
    </div>
  );
}

function TeamsCard({ connector, onChange }: { connector: Connector; onChange: () => void }) {
  const [webhook, setWebhook] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function saveWebhook() {
    setBusy('save');
    setMessage(null);
    try {
      const res = await fetch('/api/connectors/teams/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: webhook }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'save failed');
      setWebhook('');
      setMessage('Webhook saved.');
      onChange();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function testConnection() {
    setBusy('test');
    setMessage(null);
    try {
      const res = await fetch('/api/connectors/teams/test', { method: 'POST' });
      const json = await res.json();
      setMessage(json.message ?? (res.ok ? 'Connection ok.' : 'Test failed.'));
      onChange();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card card-p">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="section-title">Microsoft Teams</h2>
          <p className="text-xs text-gray-500">outbound · {connector.mode}</p>
        </div>
        {/* Connected only when a webhook credential is actually stored. */}
        <StatusBadge status={connector.has_credential ? connector.status : 'disconnected'} />
      </div>
      <p className="mt-3 text-xs text-gray-500">
        {connector.has_credential
          ? 'A webhook URL is stored. Enter a new one below to replace it.'
          : 'No webhook configured yet. Paste your channel Incoming Webhook URL.'}
      </p>
      <input
        type="password"
        placeholder="https://outlook.office.com/webhook/…"
        value={webhook}
        onChange={(e) => setWebhook(e.target.value)}
        className="input mt-2"
      />
      <div className="mt-3 flex gap-2">
        <button
          onClick={saveWebhook}
          disabled={!webhook.trim() || busy !== null}
          className="btn btn-primary"
        >
          {busy === 'save' ? 'Saving…' : 'Save webhook'}
        </button>
        <button
          onClick={testConnection}
          disabled={!connector.has_credential || busy !== null}
          className="btn btn-outline"
        >
          {busy === 'test' ? 'Testing…' : 'Test connection'}
        </button>
      </div>
      {message && <p className="mt-2 text-xs text-gray-600">{message}</p>}
    </div>
  );
}

function GmailCard({ connector, onChange }: { connector: Connector; onChange: () => void }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [to, setTo] = useState('');
  const [cadence, setCadence] = useState(connector.cadence ?? 'weekly');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function saveCreds() {
    setBusy('save');
    setMessage(null);
    try {
      const res = await fetch('/api/connectors/gmail/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: JSON.stringify({ user, pass, to }) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'save failed');
      setPass('');
      setMessage('Gmail SMTP credentials saved.');
      onChange();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function setCadenceValue(v: string) {
    setCadence(v);
    await fetch('/api/connectors/gmail', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cadence: v }),
    });
    onChange();
  }

  async function run(action: 'test' | 'send-digest') {
    setBusy(action);
    setMessage(null);
    try {
      const url = action === 'test' ? '/api/connectors/gmail/test' : '/api/connectors/gmail/send-digest';
      const res = await fetch(url, { method: 'POST' });
      const json = await res.json();
      setMessage(json.message ?? (res.ok ? `${action} ok.` : json.error ?? `${action} failed.`));
      onChange();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card card-p">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="section-title">Gmail (digest)</h2>
          <p className="text-xs text-gray-500">outbound · {connector.mode}</p>
        </div>
        {/* Connected only when SMTP credentials are actually stored. */}
        <StatusBadge status={connector.has_credential ? connector.status : 'disconnected'} />
      </div>
      <p className="mt-3 text-xs text-gray-500">
        Cadence-driven digest of approved outputs. Uses a Gmail App Password, not the account password.
      </p>
      <div className="mt-2 space-y-2">
        <input
          type="text"
          placeholder="sender@gmail.com"
          value={user}
          onChange={(e) => setUser(e.target.value)}
          className="input"
        />
        <input
          type="password"
          placeholder="Gmail App Password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          className="input"
        />
        <input
          type="text"
          placeholder="recipients, comma-separated"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="input"
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={saveCreds}
          disabled={!user.trim() || !pass.trim() || !to.trim() || busy !== null}
          className="btn btn-primary"
        >
          {busy === 'save' ? 'Saving…' : 'Save credentials'}
        </button>
        <button
          onClick={() => run('test')}
          disabled={!connector.has_credential || busy !== null}
          className="btn btn-outline"
        >
          {busy === 'test' ? 'Testing…' : 'Test connection'}
        </button>
        <button
          onClick={() => run('send-digest')}
          disabled={!connector.has_credential || busy !== null}
          className="btn btn-outline"
        >
          {busy === 'send-digest' ? 'Sending…' : 'Send digest now'}
        </button>
        <label className="ml-auto flex items-center gap-2 text-xs text-gray-500">
          cadence
          <select
            value={cadence}
            onChange={(e) => setCadenceValue(e.target.value)}
            className="select w-auto"
          >
            <option value="weekly">Weekly</option>
            <option value="biweekly">Bi-weekly</option>
          </select>
        </label>
      </div>
      {message && <p className="mt-2 text-xs text-gray-600">{message}</p>}
    </div>
  );
}

const LIVE_CRED_PLACEHOLDER: Record<string, string> = {
  salesforce: '{"instance_url":"https://litera.my.salesforce.com","access_token":"…","api_version":"v60.0"}',
  gong: '{"access_key":"…","access_key_secret":"…"}',
  crayon: '{"api_token":"…"}',
};

function InboundCard({ connector, onChange }: { connector: Connector; onChange: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [creds, setCreds] = useState('');
  const titles: Record<string, string> = {
    salesforce: 'Salesforce',
    gong: 'Gong',
    crayon: 'Crayon',
  };

  async function run(action: 'test' | 'fetch') {
    setBusy(action);
    setMessage(null);
    try {
      const url =
        action === 'test'
          ? `/api/connectors/${connector.type}/test`
          : `/api/connectors/${connector.type}/fetch`;
      const res = await fetch(url, { method: 'POST' });
      const json = await res.json();
      if (action === 'fetch' && res.ok) {
        setMessage(
          `Fetched ${json.created?.length ?? 0} new signal(s)` +
            (json.deduped?.length ? `, ${json.deduped.length} deduped.` : '.')
        );
      } else {
        setMessage(json.message ?? (res.ok ? `${action} ok.` : json.error ?? `${action} failed.`));
      }
      onChange();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function setMode(mode: 'test' | 'live') {
    setBusy('mode');
    setMessage(null);
    try {
      await fetch(`/api/connectors/${connector.type}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      onChange();
    } finally {
      setBusy(null);
    }
  }

  async function saveCreds() {
    setBusy('creds');
    setMessage(null);
    try {
      // Validate JSON before storing so a typo doesn't get saved to Vault.
      JSON.parse(creds);
      const res = await fetch(`/api/connectors/${connector.type}/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: creds }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'save failed');
      setCreds('');
      setMessage('Live credentials saved.');
      onChange();
    } catch (err) {
      setMessage(err instanceof Error ? `Invalid: ${err.message}` : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card card-p">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="section-title">{titles[connector.type] ?? connector.type}</h2>
          <p className="text-xs text-gray-500">inbound · {connector.mode}</p>
        </div>
        {/* Test-mode inbound connectors need no credential — they run against
            fixtures — so show a Test Mode badge rather than connected/disconnected.
            In live mode, reflect real credential connection. */}
        {connector.mode === 'test' ? (
          <span className="pill bg-amber-100 text-amber-700">test mode</span>
        ) : (
          <StatusBadge status={connector.has_credential ? connector.status : 'disconnected'} />
        )}
      </div>
      {/* Mode toggle — flipping to Live requires no pipeline changes, only a
          credential (04-CONNECTORS.md). Confirm vendor access first (Phase 2). */}
      <div className="mt-3 flex items-center gap-2 text-xs">
        <span className="text-gray-500">mode</span>
        <button
          onClick={() => setMode('test')}
          disabled={busy !== null || connector.mode === 'test'}
          className={`rounded-full px-3 py-0.5 font-medium ${connector.mode === 'test' ? 'bg-amber-100 text-amber-700' : 'border border-gray-200 text-gray-500'}`}
        >
          Test
        </button>
        <button
          onClick={() => setMode('live')}
          disabled={busy !== null || connector.mode === 'live'}
          className={`rounded-full px-3 py-0.5 font-medium ${connector.mode === 'live' ? 'bg-emerald-100 text-emerald-700' : 'border border-gray-200 text-gray-500'}`}
        >
          Live
        </button>
      </div>

      {connector.mode === 'test' ? (
        <p className="mt-3 rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-600">
          Running in Test Mode against sample data. Fetching creates real signals from the fixture and runs them through the pipeline.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-600">
            Live Mode calls the real vendor API. Paste credentials as JSON — stored in Vault, never shown again.
          </p>
          <textarea
            placeholder={LIVE_CRED_PLACEHOLDER[connector.type]}
            value={creds}
            onChange={(e) => setCreds(e.target.value)}
            rows={3}
            className="textarea font-mono text-xs"
          />
          <button
            onClick={saveCreds}
            disabled={!creds.trim() || busy !== null}
            className="btn btn-primary"
          >
            {busy === 'creds' ? 'Saving…' : 'Save live credentials'}
          </button>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => run('fetch')}
          disabled={busy !== null}
          className="btn btn-primary"
        >
          {busy === 'fetch' ? 'Fetching…' : connector.mode === 'test' ? 'Fetch sample signals' : 'Fetch now'}
        </button>
        <button
          onClick={() => run('test')}
          disabled={busy !== null}
          className="btn btn-outline"
        >
          {busy === 'test' ? 'Testing…' : 'Test connection'}
        </button>
      </div>
      {message && <p className="mt-2 text-xs text-gray-600">{message}</p>}
    </div>
  );
}
