# Sample Input Data

Realistic, platform-shaped signals for testing. Each is written the way that
source actually produces data — Gong is a long multi-speaker call transcript,
Salesforce is dated opportunity notes, Crayon is an alert with extracted page
copy. The first three describe the **same underlying story** (LegalEdge
launching a Word-native contract review module) so you can compare how the
pipeline handles the same signal arriving in very different shapes and lengths.

> The connector "Fetch sample signals" buttons on `/settings/connectors` pull
> these exact stories from the fixture files (`fixtures/*.json`). The text
> below is for pasting into `/intake` manually.

> Heads up: larger inputs = more tokens = slower on a small local model. These
> run comfortably on the 14B box; on the local 7B they work but take longer.

---

## 1. Gong — full call transcript — source type: `gong`

Paste the whole thing. This is what a real renewal call looks like: multiple
speakers, hedging, filler, the competitive signal buried in the middle.

```
[Renewal call — Acme Legal, FY26 Renewal & Expansion Review — 2026-06-18]

Jordan Lee (Litera, AE): Hey Priya, Marcus — thanks for making the time. I know
renewals are never anyone's favorite meeting, so I'll keep it tight. How's the
team doing with the drafting workflow this quarter?

Priya Nair (Acme Legal, GC): Good, mostly. I mean, the platform's solid. The
paralegals are comfortable in it now, which took a while, honestly. But I'll be
straight with you — we've been taking a look at LegalEdge lately.

Jordan Lee: Okay. Appreciate you being upfront. What prompted that?

Priya Nair: So they reached out, did a demo maybe three weeks ago. They just
launched this new contract review module, and the thing that got everyone's
attention is it's fully native inside Word. Like, the redlining happens in Word
itself, you don't bounce out to a separate window or a web app.

Marcus Webb (Acme Legal, Head of KM): Yeah, that was the big one for the
paralegals. The redlining speed in the demo was — I mean it was fast. They ran a
fairly gnarly master services agreement through it live and the turn-comparison
came back almost instantly. A couple of the team members were pretty impressed,
I won't lie.

Jordan Lee: Got it. So the native-Word piece and the redline speed are the two
things standing out?

Marcus Webb: Those two, yeah. The not-leaving-Word thing is bigger than it
sounds. Our folks basically live in Word all day, so every context switch is
friction. That's the pitch they made and it kind of landed.

Priya Nair: I want to be fair here — it was a demo, it's a new module, we haven't
run a real pilot. And your integration has been dependable, which counts for a
lot when we've got audits. I'm not saying we're switching. I'm saying it's on
our radar and the team asked me to raise it.

Jordan Lee: That's exactly the right thing to do. Was pricing part of the
conversation with them, or purely the product demo?

Priya Nair: Mostly product. They floated numbers but nothing formal, so I
wouldn't read too much into it. The stickiness for us is genuinely the in-Word
experience for the paralegal team.
```

---

## 2. Salesforce — opportunity notes — source type: `salesforce`

Dated notes the way a rep logs activity over the life of a deal.

```
Opportunity: Acme Legal — Renewal & Expansion FY26
Stage: Negotiation/Review | Amount: $148,000 | Close: 2026-08-31
Competitor mentioned: LegalEdge

[2026-06-18] Renewal call. GC (Priya Nair) proactively raised LegalEdge. They
demoed a new contract review module ~3 weeks ago. Key draw: everything runs
natively inside Word — redlining happens in Word, no separate app. Paralegals
liked the redline speed on a live MSA.

[2026-06-19] Priya emphasized this was a demo, not a pilot. Reliability of our
integration for audits still valued. Pricing only mentioned informally by
LegalEdge — do not over-index on it. Real stickiness risk is the in-Word
paralegal UX.

[2026-06-24] Head of KM (Marcus Webb) wants a roadmap that reflects how
paralegals actually work; requested direct time between our team and his
paralegals. Action: AE to share drafting roadmap before renewal.
```

---

## 3. Crayon — competitor alert — source type: `crayon`

A website-change alert with the extracted marketing copy.

```
[Crayon alert · LegalEdge · new product page · confidence: high · 2026-06-15]
URL: https://legaledge.example.com/product/contract-review

LegalEdge published a new "Contract Review" product page.

Hero: "Contract review, right inside Word."
Subhead: "Redline, compare, and negotiate without ever leaving your document."
- Native Microsoft Word add-in — no separate app, no context switching
- Fast clause-level redlining and turn comparison
- Track-changes-aware markup that stays in Word's own review layer
- Works on existing .docx files with no reformatting

Also detected: new "Contract Review add-on" pricing teaser (no price shown);
customer logo strip refreshed with two new large-firm logos.
```

---

## 4. Grounding test — source type: `manual`

Deliberately contains a claim ("fundamentally better AI") far stronger than the
source supports. That sentence should land in **unverified_claims**, not be
asserted as fact. Local models are weaker at this — the grounding rule is only
*trusted* once verified against Claude (add a Claude key on the settings page).

```
LegalEdge launched a contract review module with native Word integration and
fast redlining. This means LegalEdge now has fundamentally better AI than
Litera and will win every enterprise legal deal this year. Their paralegal
demo at one account went well.
```

---

## 5. Second, unrelated signal — source type: `news`

Different competitor, different classification — gives the review queue variety
and shows audience routing change.

```
Reuters reports that competitor ContractPodAi has raised a $50M Series C led by
existing investors, and announced plans to roughly double its AI
contract-analytics team over the next year. The company said the round will
fund aggressive expansion in the legal-tech drafting and CLM space, with a
stated focus on mid-market corporate legal departments in North America and the
UK. Executives framed the raise as a bet that generative-AI contract review
will consolidate around a few platforms within 24 months.
```
