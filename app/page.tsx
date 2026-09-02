import Link from 'next/link';

const STEPS = [
  { n: '1', title: 'Classify', body: 'Identifies the competitor, signal type, urgency, and who should care.' },
  { n: '2', title: 'Interpret', body: 'Summarizes what happened and why it matters — grounded only in the source.' },
  { n: '3', title: 'Route', body: 'Decides which teams the signal is relevant to.' },
  { n: '4', title: 'Package', body: 'Writes tailored content for each team, ready to review and approve.' },
];

// Where each role starts — one agent, tailored to what each team acts on.
const ROLES = [
  { title: 'Sales', body: 'Win the call. Talk tracks and objection handling for live prospect conversations.' },
  { title: 'Product', body: 'Protect the roadmap. Clear watch-outs on the rival features that matter.' },
  { title: 'Marketing', body: 'Sharpen the message. Campaign angles the moment a competitor shifts.' },
  { title: 'Leadership', body: 'Decide faster. High-level summaries of what changed and why it matters.' },
];

const FEATURES = [
  { title: 'Grounded, never invented', body: 'Every claim traces to the source signal. If the agent doesn’t know it, it doesn’t say it.' },
  { title: 'Human review gate', body: 'Nothing publishes on its own. A reviewer reads, edits, and approves every output first.' },
  { title: 'Comes to you', body: 'Approved insights arrive in Microsoft Teams or email — no new tool to open, no extra step.' },
  { title: 'Sharp battlecards', body: 'Objection and response cards that lead with the competitor’s real weakness, not filler.' },
  { title: 'Measured tone', body: 'Treats a launch or demo as an early signal to watch — not a proven market threat.' },
  { title: 'Every team covered', body: 'One signal becomes tailored content for Sales, Product, Marketing, and Leadership.' },
];

const STATS = [
  { value: '4', label: 'Teams served' },
  { value: '6', label: 'Output types' },
  { value: '1', label: 'Human gate, always' },
  { value: '0', label: 'Fabricated facts' },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-surface text-gray-900">
      {/* Nav */}
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <div className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/litera-logo.png" alt="Litera" className="h-8 w-auto object-contain" />
        </div>
        <div className="flex items-center gap-6 text-sm font-medium text-gray-600">
          <a href="#how" className="hidden hover:text-gray-900 sm:block">How it works</a>
          <a href="#teams" className="hidden hover:text-gray-900 sm:block">For your teams</a>
          <a href="#delivery" className="hidden hover:text-gray-900 sm:block">Delivery</a>
          <Link href="/login?demo=1" className="rounded-lg bg-action px-4 py-2 font-semibold text-action-ink transition-colors hover:bg-action-hover">
            Try now
          </Link>
        </div>
      </nav>

      {/* Hero — full-bleed geometric graphic, text overlaid on the light left */}
      <section className="relative overflow-hidden bg-surface">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/2.jpg" alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
        {/* White gradient keeps the left text legible while the right stays vibrant */}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-page via-page/80 to-transparent" />
        <div className="relative mx-auto max-w-6xl px-5">
          <div className="max-w-xl py-16 lg:py-24">
            <p className="text-sm font-semibold uppercase tracking-wider text-accent">
              Just Ask… Agent Compete
            </p>
            <h1 className="font-brand mt-3 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
              Compete Agent
            </h1>
            <p className="mt-4 text-xl font-semibold leading-snug text-gray-900 sm:text-2xl">
              A personal competitive agent for your sales and GTM teams.
            </p>
            <p className="mt-4 max-w-lg text-lg leading-relaxed text-gray-700">
              It continuously monitors competitive activity and proactively delivers the actionable
              insights each team needs — grounded in the source, and reviewed by a human before
              anything goes out.
            </p>
            <div className="mt-8">
              <Link
                href="/login?demo=1"
                className="inline-block rounded-lg bg-action px-6 py-3 text-base font-semibold text-action-ink transition-colors hover:bg-action-hover"
              >
                Try Compete Agent
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Sources strip — Compete Agent builds on trusted inputs, it doesn't crawl the web */}
      <section className="border-y border-gray-200 bg-gray-50 py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-3 px-5 text-center sm:flex-row sm:gap-4">
          <span className="text-sm font-medium text-gray-500">Built on the sources you already trust:</span>
          <div className="flex items-center gap-3">
            <span className="rounded-lg border border-gray-200 bg-surface px-3 py-1 text-sm font-semibold text-gray-800">Crayon</span>
            <span className="rounded-lg border border-gray-200 bg-surface px-3 py-1 text-sm font-semibold text-gray-800">Gong</span>
          </div>
          <span className="text-sm text-gray-500">— not another web crawler, your agent on top of them.</span>
        </div>
      </section>

      {/* Value band */}
      <section className="bg-surface py-16 text-center">
        <p className="mx-auto max-w-3xl px-5 text-2xl font-bold leading-snug tracking-tight text-gray-900 sm:text-3xl">
          Always watching the competition. Always ready with your next move — grounded in the source,
          and approved by a human before it goes out.
        </p>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight">How your agent works</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-gray-600">
          The agent does the heavy lifting — you review and approve.
        </p>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.title} className="rounded-2xl border border-gray-200 bg-surface p-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-sm font-bold text-ink-on">
                {s.n}
              </span>
              <h3 className="mt-4 font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* For your teams — where each role starts, and what they get */}
      <section id="teams" className="bg-gray-50 py-20">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-center text-3xl font-bold tracking-tight">One agent. Every team gets what it needs.</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-gray-600">
            The same signal, delivered to each team in the form they can act on.
          </p>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {ROLES.map((r) => (
              <div key={r.title} className="rounded-2xl border border-gray-200 bg-surface p-6">
                <h3 className="text-lg font-bold text-accent">{r.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{r.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Delivery — the money shot: insights arrive where teams already work */}
      <section id="delivery" className="mx-auto max-w-6xl px-5 py-20">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight">Delivered where you already work</h2>
          <p className="mx-auto mt-3 max-w-2xl text-gray-600">
            No new tool to learn. Approved insights arrive right where your teams already spend their
            day — so acting on them takes seconds, not a login.
          </p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-surface p-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            </div>
            <h3 className="mt-5 text-xl font-bold">Microsoft Teams</h3>
            <p className="mt-2 leading-relaxed text-gray-600">
              Insights land in the Teams channel you already use — one glance, and you’re ready for
              the call.
            </p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-surface p-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
            </div>
            <h3 className="mt-5 text-xl font-bold">Email</h3>
            <p className="mt-2 leading-relaxed text-gray-600">
              A clean summary straight to the inbox — perfect for Leadership, Product, and Marketing to
              scan and act on in seconds.
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-gray-50 py-20">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-center text-3xl font-bold tracking-tight">Built to be trusted</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-gray-600">
            Powerful where it counts, careful where it matters.
          </p>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-gray-200 bg-surface p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                </div>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats — four separate cards */}
      <section className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="rounded-2xl bg-accent p-6 text-center shadow-sm">
              <div className="text-4xl font-extrabold text-white">{s.value}</div>
              <div className="mt-1 text-sm text-white/80">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-4xl px-5 py-20 text-center">
        <h2 className="text-3xl font-bold tracking-tight">Just Ask… Agent Compete</h2>
        <p className="mx-auto mt-3 max-w-md text-gray-600">
          Give every team their own competitive agent — always watching, always ready.
        </p>
        <Link
          href="/login?demo=1"
          className="mt-8 inline-block rounded-lg bg-action px-8 py-3 text-base font-semibold text-action-ink transition-colors hover:bg-action-hover"
        >
          Try Compete Agent
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-surface py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 text-sm text-gray-500 sm:flex-row">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/litera-logo.png" alt="Litera" className="h-6 w-auto object-contain" />
            <span className="font-medium text-gray-700">Compete Agent</span>
          </div>
          <span>Competitive intelligence, from raw signal to audience-ready content.</span>
        </div>
      </footer>
    </div>
  );
}
