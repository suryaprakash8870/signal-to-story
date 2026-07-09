import Link from 'next/link';

const STEPS = [
  { n: '1', title: 'Classify', body: 'Identifies the competitor, signal type, urgency, and who should care.' },
  { n: '2', title: 'Interpret', body: 'Summarizes what happened and why it matters — grounded only in the source.' },
  { n: '3', title: 'Route', body: 'Decides which teams the signal is relevant to.' },
  { n: '4', title: 'Package', body: 'Writes tailored content for each team, ready to review and approve.' },
];

const FEATURES = [
  { title: 'Grounded, never invented', body: 'Every claim traces to the source signal or the competitor’s facts. If we don’t know it, we don’t say it.' },
  { title: 'Human review gate', body: 'Nothing publishes on its own. A reviewer reads, edits, and approves every output first.' },
  { title: 'Four audiences', body: 'One signal becomes tailored content for Sales, Product, Marketing, and Leadership.' },
  { title: 'Sharp battlecards', body: 'Objection/response cards that lead with the competitor’s real weakness, not filler.' },
  { title: 'Measured tone', body: 'Treats a launch or demo as an early signal to watch — not a proven market threat.' },
  { title: 'One-click delivery', body: 'Approved content goes straight to your team — Microsoft Teams or email.' },
];

const STATS = [
  { value: '4', label: 'Audiences served' },
  { value: '6', label: 'Output types' },
  { value: '1', label: 'Human gate, always' },
  { value: '0', label: 'Fabricated facts' },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Nav */}
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/litera-logo.png" alt="Litera" className="h-8 w-auto object-contain" />
          <span className="hidden h-7 w-px bg-gray-200 sm:block" />
          <span className="hidden text-base font-semibold tracking-tight text-gray-800 sm:block">
            Signal-to-Story
          </span>
        </div>
        <div className="flex items-center gap-6 text-sm font-medium text-gray-600">
          <a href="#how" className="hidden hover:text-gray-900 sm:block">How it works</a>
          <a href="#features" className="hidden hover:text-gray-900 sm:block">Features</a>
          <Link href="/intake" className="rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700">
            Try now
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative isolate overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-blue-100/70 blur-3xl" />
        </div>
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 lg:grid-cols-2 lg:py-24">
          <div>
            <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
              Competitive intelligence
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
              Signal AI built to turn <span className="text-blue-600">moves into momentum</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-gray-600">
              Drop in a competitor move, a sales call, or a piece of news. Signal-to-Story turns it into
              ready-to-use content for every team — grounded in the source, always reviewed by a human.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/intake" className="rounded-lg bg-blue-600 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-blue-700">
                Try now
              </Link>
              <a href="#how" className="rounded-lg border border-gray-300 px-6 py-3 text-base font-semibold text-gray-700 transition-colors hover:bg-gray-50">
                See how it works
              </a>
            </div>
          </div>

          {/* Hero visual — signal → outputs */}
          <div className="relative">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xl">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Raw signal · Gong call</div>
                <p className="mt-1 text-sm text-gray-700">
                  “A key account is evaluating a competitor’s new AI drafting tool at renewal…”
                </p>
              </div>
              <div className="my-3 flex justify-center text-gray-300">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M19 12l-7 7-7-7" /></svg>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {['Sales', 'Product', 'Marketing', 'Leadership'].map((a) => (
                  <div key={a} className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">
                    {a}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Value band */}
      <section className="bg-blue-600 py-16 text-center text-white">
        <p className="mx-auto max-w-3xl px-5 text-2xl font-semibold leading-snug sm:text-3xl">
          One raw signal, four audience-ready stories — grounded in the source, never invented, always
          reviewed by a human.
        </p>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight">From signal to story in four steps</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-gray-600">
          The engine does the heavy lifting — you review and approve.
        </p>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.title} className="rounded-2xl border border-gray-200 bg-white p-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
                {s.n}
              </span>
              <h3 className="mt-4 font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{s.body}</p>
            </div>
          ))}
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
              <div key={f.title} className="rounded-2xl border border-gray-200 bg-white p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                </div>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats band */}
      <section className="bg-blue-600 py-14 text-white">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 px-5 text-center sm:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label}>
              <div className="text-4xl font-extrabold">{s.value}</div>
              <div className="mt-1 text-sm text-white/80">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-4xl px-5 py-20 text-center">
        <h2 className="text-3xl font-bold tracking-tight">Turn your next signal into a story</h2>
        <p className="mx-auto mt-3 max-w-md text-gray-600">
          No setup. Paste a signal and watch the pipeline work.
        </p>
        <Link href="/intake" className="mt-8 inline-block rounded-lg bg-blue-600 px-8 py-3 text-base font-semibold text-white transition-colors hover:bg-blue-700">
          Try now
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 text-sm text-gray-500 sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded bg-blue-600 text-xs font-bold text-white">
              S
            </span>
            <span className="font-medium text-gray-700">Signal-to-Story</span>
          </div>
          <span>Competitive intelligence, from raw signal to audience-ready content.</span>
        </div>
      </footer>
    </div>
  );
}
