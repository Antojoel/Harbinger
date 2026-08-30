# Demo Script — Harbinger (ClearanceGuard)

Target: **2:00–2:30 live**. Every beat below references the actual running
build (verified 2026-08-30) — no aspirational features. Rehearse against
`docker compose up -d --build` with a fresh browser session so the login/
onboarding beat is real, not skipped.

**Before you go on stage:**
- [ ] `docker compose up -d --build` — all 4 containers healthy
- [ ] `curl http://localhost:8000/api/patterns` returns real patterns (graph seeded)
- [ ] Have `sample-documents/unit-mismatch/*.pdf` ready to pick in the file dialog (Finder window open, or known path)
- [ ] Clear browser localStorage once beforehand if you want the onboarding tour to actually fire live
- [ ] `VOICE_PROVIDER=vertex`, `LLM_ANSWER_PROVIDER` reachable — do one silent dry-run of the voice beat before going live (LLM answers take ~3-5s, don't let that surprise you on stage)
- [ ] **If you've rehearsed §3/§4 (document upload → record outcome) before**, run these two commands as your *last* step before walking on:
  ```bash
  docker exec harbinger-engine python -m seed.seed_data   # patterns are shared graph nodes -
                                                            # a rehearsal's "detail" note (e.g.
                                                            # "rehearsal test") overwrites the
                                                            # shared text every shipment with that
                                                            # pattern reads back, incl. in voice answers
  docker compose restart engine                            # shipment_store's dashboard catalog is
                                                            # in-memory only - clears rehearsal
                                                            # shipments back to the original 6 seeded
  ```
  (Confirmed live: one rehearsal run of §3/§4 changed PAT-001's shared detail text from "Invoice and
  Packing List unit counts diverge" to "flagged during a rehearsal test" — which then leaked into
  MSKU1234567's voice answer in §5, an unrelated shipment. Both commands above fixed it.)

---

## 0. Hook (10s) — before touching the screen

> "Demurrage fees start ticking the moment a shipment's paperwork has an
> issue — a unit count that doesn't match, a missing certificate. Most
> tools catch that after the container's already sitting at port. Harbinger
> catches it before you ever file — and it gets smarter every time it's
> wrong, permanently."

## 1. Login (10s)

**Screen:** `http://localhost:3000` → Google Sign-In / Continue as Guest.

> "Real Google auth, or guest mode for anyone testing it cold."

*(If onboarding tour fires: let it, don't narrate over it — 3-4s, self-explanatory.)*

## 2. Control Tower (10s)

**Screen:** Dashboard — point at the shipment table and the stat strip.

> "This is the book — real shipments, each with a live hold-risk score.
> On the right, the Immune Memory graph — everything the engine has
> learned so far."

*(Don't linger — this is context-setting, not the payoff.)*

## 3. Predict from real documents (35s) — the centerpiece

**Screen:** Click **"Add shipment"** → **"Upload documents"** tab.

> "Instead of typing this in, let's hand it real paperwork."

**Action:** Pick the three files from `sample-documents/unit-mismatch/`
(commercial-invoice.pdf, packing-list.pdf, bill-of-lading.pdf), fill
country `DE`, click **"Extract & simulate."**

> "No OCR template, no typed fields — Gemini reads the unit counts and HS
> codes straight off the PDFs, and the same graph-based engine runs
> underneath."

**Screen:** Lands on the new shipment's detail page — risk dossier shows ~82%, high, "Invoice lists 500 units, Packing List lists 480."

> "82% hold risk, and it's not a black box — it's telling us exactly why:
> the invoice and packing list disagree by 20 units. That's a real number,
> read off a real document, seconds ago."

## 4. Immune memory grows (20s)

**Screen:** Click **"Record outcome"** on this same shipment → select **Held** → **"Confirm outcome."**

> "Now let's tell it what actually happened at customs — held, exactly as
> predicted."

**Screen:** Point at the Immune Memory panel — a new node/edge animates in.

> "Watch the graph — that's not a static diagram, it just grew, live, in
> front of you. The next shipment with this exact pattern gets caught
> instantly — no re-diagnosis, ever again."

## 5. Ask it (25s)

**Screen:** Navigate to **Integrations** → **"Try the Voice API"** panel.

> "And because the engine is pluggable, not walled in, you can talk to it."

**Action:** Provider = Vertex AI, Answer engine = OpenAI (or Gemini), shipment `MSKU1234567`. Click **Record question**, ask *"Why is this shipment flagged?"*, **Stop & send**.

> "Real speech-to-text, and the answer isn't a canned template — an LLM is
> grounded in the same graph facts and phrases the answer live."

**Screen:** Transcript + spoken answer come back (~3-5s wait — narrate through it, don't go silent).

> "MSKU1234567 — held, unit mismatch, missing Certificate of Origin. Same
> facts, spoken naturally."

## 6. The business (20s)

**Screen:** Navigate to **Pricing**.

> "This isn't priced like a SaaS seat — it's priced against the exact cost
> it prevents. Per-shipment protection, a fraction of the demurrage fee it
> avoids."

*(Optional, only if time and connectivity allow: click through a Razorpay
test-mode checkout to show it's a real payment flow, not a mockup — skip
if running behind schedule, it's not worth rushing.)*

## 7. Close (15s)

> "Predict before filing. Remember every real outcome, permanently. And
> because it's exposed over REST *and* MCP — the exact same engine we just
> used through this dashboard, any AI agent can call directly. One engine,
> not a walled garden."

**Screen:** (Optional) flash `/api/integrations` or the MCP tool list if a slide/terminal is set up — don't build this live unless already rehearsed.

---

## Cut list (if running short on time)

Cut in this order — each is independently removable without breaking the
narrative:

1. Pricing/Razorpay beat (§6) — say the one line, skip the click-through.
2. Voice/LLM beat (§5) — mention it exists, don't demo live (biggest time
   sink at 3-5s LLM latency plus setup).
3. Login beat (§1) — start already logged in, skip straight to Control Tower.

**Never cut:** §3 (document upload → real risk score) and §4 (graph
growth) — those two together *are* the product's actual differentiator.
Everything else is supporting cast.

## Known live-demo risks

- **LLM voice answers take ~3-5s** (gpt-5-nano is a reasoning model). Don't
  stand there in silence — have the next line ready to talk over it.
- **Vertex/Gemini requires real network access** to Google Cloud — if venue
  wifi is bad, fall back to `text_only` provider for a safe, instant (if
  less impressive) voice beat, or cut §5 entirely per the list above.
- **Document extraction accuracy** is proven against the `sample-documents/`
  set specifically — don't improvise with an unfamiliar real invoice live
  on stage; use the known-good files.
- **Container rebuild = fresh login** is fixed (session persists via a
  Docker volume now) — but if you `docker compose down -v` (removes
  volumes) before the demo, that resets it. Use `docker compose up -d`, not
  `down -v`, between rehearsals.
