# Harbinger / ClearanceGuard — UI Makeover Spec

Single source of truth for the redesign. Every page and component must follow this.
Foundation (tokens, tailwind config, primitives, shell) is already done — **do not
edit foundation files**, consume them.

---

## 1. Direction — "Operational Swiss"

A logistics **control room**, not a marketing site. Calm, dense-where-it-matters,
precise. Light-first. One confident accent. Data is typography, not decoration.

Reference feel: Linear settings, Vercel dashboard, Stripe dashboard, a Bloomberg
terminal that went to design school. **Not**: gradient hero blobs, glassmorphism,
generic SaaS card grids, emoji, drop-shadow soup.

### Anti-template rules (enforced)
- No uniform padding everywhere — vary rhythm, let some blocks breathe and others pack tight.
- No "sidebar + 4 stat cards + table" with zero point of view. Give the page a lead element.
- Hierarchy through **scale contrast** (a 32px number next to 11px label), not weight alone.
- Every interactive element has designed hover / focus-visible / active / disabled states.
- Motion clarifies flow (where did this come from, what just changed) — never ambient wiggle.

---

## 2. Tokens (already in `src/index.css` + `tailwind.config.cjs`)

Use the Tailwind classes / CSS vars below. **Never hardcode a hex or raw hsl() in a component.**

### Color — semantic Tailwind classes
| Purpose | Class |
|---|---|
| Page ground | `bg-background` |
| Raised surface (cards, panels) | `bg-card` |
| Primary text | `text-foreground` |
| Secondary text | `text-muted-foreground` |
| Hairlines / borders | `border-border` (default border color) |
| Quiet fill (inputs, chips, table header) | `bg-muted` |
| Accent tint fill | `bg-accent` / text `text-accent-foreground` |
| Brand action | `bg-primary text-primary-foreground` |
| Focus ring | `ring-ring` |

### Risk / status — semantic scale (use these, not ad-hoc hsl)
| Meaning | Solid | Soft bg | Text-on-soft |
|---|---|---|---|
| Good / cleared / low risk | `bg-ok` | `bg-ok-soft` | `text-ok-foreground` |
| Caution / held / medium risk | `bg-warn` | `bg-warn-soft` | `text-warn-foreground` |
| Bad / rejected / high risk | `bg-danger` | `bg-danger-soft` | `text-danger-foreground` |

Dot indicators: `bg-ok` / `bg-warn` / `bg-danger` at `h-1.5 w-1.5 rounded-full`.

### Typography
- Display / headings: `font-display` (Space Grotesk). Tight tracking: `tracking-tight`.
- Data, codes, IDs, HS codes, money: `font-mono` (IBM Plex Mono).
- Body: default sans (system stack) — do not add a class.
- Scale: page title `text-2xl sm:text-3xl font-display font-semibold tracking-tight`.
  Section label `text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground`.
  Big metric `text-3xl font-display font-semibold tabular-nums`.

### Radius
`rounded-lg` (10px) = cards/panels. `rounded-md` = inputs, buttons, insets.
`rounded-full` = pills, dots, avatars. Don't invent radii.

### Elevation
`shadow-sm` = resting card. `shadow-md` = popover / dialog / dropdown / lifted.
`shadow-lg` = command palette / the docked assistant on mobile. Nothing heavier.

### Spacing rhythm
Page sections: `space-y-6` to `space-y-8`. Inside a card: `p-4` to `p-5` (dense
data) or `p-6` (prose / pricing). Gaps between related controls `gap-2`, between
groups `gap-4`. Don't pad everything to `p-6`.

### Motion — tokens & helpers
- Durations: `duration-fast` (120ms), `duration-normal` (200ms), `duration-slow` (320ms).
- Easing: `ease-expo` (`cubic-bezier(.16,1,.3,1)`) for enters/moves; default `ease-out` for hovers.
- Enter animation: add class `cg-rise` (opacity 0→1, translateY 6px→0, 260ms expo).
- Staggered lists: put `cg-rise` on each row + inline `style={{ animationDelay: \`${i*35}ms\` }}` (cap at ~10).
- Number / metric changes: `transition-all duration-slow` on the bar/fill; `tabular-nums` always.
- The immune-memory graph node/edge "just grew" animation is **already built** (`cg-node-new`,
  `cg-edge-new` in index.css) — keep using it, don't reinvent.
- Everything respects `prefers-reduced-motion` (index.css already neutralizes `cg-*`;
  if you add a keyframe, guard it too).
- Animate only `transform` / `opacity` / `filter`. Never animate width/height/top/left/margin.

---

## 3. Shell (already built — `components/Layout.js`)

- Sticky top bar: brand lockup left, user chip + theme toggle + logout right.
- Left: quiet icon+label nav rail (`components/nav/SideNav` conventions), collapses to a
  horizontal scroller under `lg`.
- Center: `<main>` — the page.
- Right (≥`xl`): **RightDock** — a tabbed panel, full height, sticky. Two tabs:
  1. **Memory** — the live immune-memory graph (`GraphPanel`) + legend + one-line caption.
  2. **Assistant** — the AI chat (`components/chat/ChatPanel`).
  Under `xl`, the dock opens as a right-side `Sheet` from a header button showing which
  tab (Memory / Assistant).
- The old floating `VoiceWidget` is **removed**. All AI Q&A now lives in the Assistant tab.

---

## 4. AI Chat — "Assistant" (Agent A owns `components/chat/*`)

Goal: a **real chat surface**, not a cramped popover. It lives in the RightDock
"Assistant" tab (and the mobile Sheet).

### Layout
```
┌─ Assistant ─────────────────┐
│ context chip: [▼ MSKU1234567 · 87% high]   ← which shipment the answer is about
├─────────────────────────────┤
│  (scroll area, newest at    │
│   bottom, auto-scrolls)     │
│                             │
│   ┌ assistant bubble ─────┐ │
│   │ text answer           │ │
│   └───────────────────────┘ │
│              ┌ user bubble ┐│
│              │ question    ││
│              └─────────────┘│
│   • • •  (typing indicator) │
├─────────────────────────────┤
│ quick prompts: [Why flagged?] [Hold risk?] [What fixes it?]   ← chips, only pre-first-message or always above composer
│ ┌ composer ─────────────────┐
│ │ textarea (autogrow, ≤4 rows)   [mic] [send] │
│ └───────────────────────────┘
└─────────────────────────────┘
```

### Behaviour
- On mount: empty state — a short line ("Ask about any shipment's hold risk. Pick one above.")
  + the quick-prompt chips.
- Context chip = a `Select` of shipments from `api.shipments()`. Default to the shipment in
  the current route if on `/shipment/:id` (read `useParams`/location), else first at-risk, else first.
- Send flow: append user bubble → show typing indicator → `api.voice(shipmentId, text)` →
  append assistant bubble with `res.answer` → speak it via `window.speechSynthesis` **only if**
  a "read answers aloud" toggle is on (default OFF — no surprise audio). Toggle is a small
  speaker icon-button in the header, persisted to `localStorage` (`cg_tts_on`).
- Mic button: browser `SpeechRecognition` (webkit fallback). While listening, the mic button
  shows an animated state and the composer placeholder becomes "Listening…". On result, drop
  the transcript into the composer (do NOT auto-send) so the user can edit — press send.
  If unsupported: hide the mic button entirely (don't show a broken one).
- Errors: a subtle inline system line in the transcript ("Couldn't reach the assistant — try again"),
  not a toast storm.
- Keep the last conversation in component state only (no persistence needed). Changing the
  context chip inserts a thin divider line ("· now asking about MSKU7654321 ·").
- Message list uses `@radix-ui/react-scroll-area` (already a dep). Auto-scroll to bottom on
  new message unless the user has scrolled up.
- Accessibility: `role="log"` `aria-live="polite"` on the transcript; composer textarea has a
  label; Enter sends, Shift+Enter newlines.

### Style
- Assistant bubble: `bg-muted` `rounded-lg` `rounded-tl-sm`, `text-sm`, `px-3 py-2`, max-width ~85%.
- User bubble: `bg-primary text-primary-foreground` `rounded-lg` `rounded-br-sm`, right-aligned.
- Typing indicator: three `bg-muted-foreground/60` dots, staggered bounce (respect reduced-motion → static).
- Quick-prompt chips: `bg-accent text-accent-foreground` `rounded-full` `text-xs px-2.5 py-1`,
  hover lifts to `bg-primary/10`.
- Composer: `bg-card border border-border rounded-lg`, focus-within ring. Send button
  `size="icon"` primary, disabled until non-empty.

### Files (Agent A)
- `components/chat/ChatPanel.jsx` (default export, the whole panel — a stub exists, replace it)
- `components/chat/MessageBubble.jsx`
- `components/chat/Composer.jsx`
- `components/chat/TypingDots.jsx`
- `components/chat/useSpeech.js` (mic + optional TTS hook)
- may delete `components/VoiceWidget.js` and its stale import if any remain (grep first)
- **do not touch** `Layout.js` beyond confirming it already renders `<ChatPanel/>`; it does.

---

## 5. Pages

Shared page header pattern:
```jsx
<header className="cg-rise">
  <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Title</h1>
  <p className="mt-1 text-sm text-muted-foreground">One sentence of what this is.</p>
</header>
```

### Dashboard "Control Tower" (Agent B — `pages/Dashboard.js`)
- Lead element: a **status band** — not 4 equal cards. Make "Cost avoided" the hero
  (large mono figure + tiny sparkline-feel or just a bold number), the other three
  (Shipments / At risk / Avg hold risk) smaller, ganged to its right in a bento row.
- `At risk` uses `text-warn` when > 0. `Avg hold risk` colored by band.
- Filters: inline, quiet — segmented-ish, not two big Selects floating in space.
- Table → make it feel like a manifest: mono for IDs/HS/ports, `RiskBadge` prominent,
  row hover reveals the chevron + a faint `bg-accent`. Sticky header. `cg-rise` stagger on rows.
- "Add shipment" dialog: keep both tabs (Manual / Upload) but tighten — group fields,
  the helper text about `8471.30/DE` becomes a small info line, not a paragraph. Primary
  action label reflects mode ("Create & simulate" / "Extract & simulate").
- Empty state: designed, not "No shipments match your filters." in grey — icon + line + reset button.

### Shipment dossier (Agent B — `pages/ShipmentDetail.js`)
- This is the core flow. Add a **persistent action bar** (sticky, just under the page
  header or bottom on mobile): shows the current best next action and the buttons
  (`Simulate` / `Re-simulate`, `Record outcome`). It always tells the user what to do next.
- Risk dossier: the score is the hero — big mono number, band pill, the progress bar
  animates on change (`duration-slow ease-expo`). Reasons as a clean ordered list.
  "Default action" alert restyled to the `bg-accent` tint, not raw blue hsl.
- Checklist rows: dot + item + state label + the action button. `approve_fix` = primary-ish
  small button; `human_draft` = outline. After approve, the row should visibly resolve
  (strike / fade to `text-ok` + check) before re-simulate refreshes.
- Documents panel: tabbed; affected fields highlighted with `bg-danger-soft text-danger-foreground`
  (token, not hsl). Keep the "Generated" MockedBadge.
- Record-outcome dialog: the 3 outcome buttons become proper segmented choices with the
  semantic color as the selected state; on confirm, close and let the graph animate in the dock.

### Pricing (Agent C — `pages/Pricing.js`)
- Two tiers, but give them hierarchy — the highlighted one is visually dominant (scale,
  a subtle `ring-primary`, "Most popular" tab), the other recedes.
- The fee-vs-demurrage chart: restyle to the design system — `bg-ok` for demurrage-avoided,
  `bg-primary` for fee, mono axis labels, `fmtINR`, no default recharts chrome. Make the
  ratio legible ("₹149 vs ₹5,500/day → one prevented hold pays for ~37 checks") as a callout.
- "Awaiting Razorpay keys" alert → `bg-warn-soft` token styling.

### Escalations (Agent C — `pages/EmailPage.js`)
- Two-column: composer left, audit log right. Log entries are the interesting part — make
  them read like a ledger (mono timestamp, status pill, recipient, shipment id chip).
- Status pills use tokens (`Delivered` = ok, `Draft Logged` = warn, `Failed` = danger).
- The "human-approved, never auto-submitted" guarantee should be a calm reassurance line,
  not a yellow warning box screaming at the user.
- Keep the detail Dialog; `dangerouslySetInnerHTML` for `body` stays (backend-owned HTML) —
  don't change that behaviour.

### Integrations (Agent C — `pages/Integrations.js`)
- Lead: "pluggable engine" statement + a REST | MCP two-up. Endpoint rows are mono cards
  with a copy button that shows a copied state.
- The "Try the Voice API" panel: this is a dev console — lean into that. Monospace,
  terminal-ish framing for the curl example (`bg-foreground text-background` or a real
  dark code block regardless of theme, with proper padding). Keep all the permission
  explainer content (it's accurate and load-bearing) but make it collapsible (`<details>`
  or a Radix accordion look) so it's not a wall.
- Keep the VoiceQueryPanel wiring exactly — only restyle.

### Login (Agent D — `pages/Login.jsx`)
- Not a lonely centered card on grey. Split or asymmetric: left = the brand + a one-line
  value prop + maybe a faint `cg-grid-texture` panel or a small static depiction of the
  "predict → prevent → remember" loop; right = the auth card. Under `md`, stack.
- Keep the Google button slot mechanics **exactly** (the ref/StrictMode dance is fragile —
  don't touch the effect logic, only the surrounding layout/classes).
- Guest button + divider stay.

### Onboarding (Agent D — `components/OnboardingTour.jsx`)
- Keep the 5 steps + content. Restyle: the step icon in an accent tile, a real progress
  indicator (segmented bar, not dots-as-mystery), Back / Next / Skip. `cg-rise` on step change.
- Don't change `useAuth` wiring or the `completeOnboarding` call.

### Graph panel polish (Agent D — `components/GraphPanel.js`, `GraphLegend`)
- Retune node colors to the token palette (map each node type to `ok/warn/danger/primary/
  muted-foreground` equivalents — read the hsl values from index.css `--ok` etc. and use
  matching hsl in the reactflow inline styles, since reactflow can't take Tailwind classes).
- Legend chips use the same. Background dot grid to `hsl(var(--border))`.
- Keep the force layout + the `cg-node-new` / `cg-edge-new` animation hooks intact.
- Node labels: `font-mono` where they're IDs/codes.

---

## 6. Ground rules for every agent

1. **Only edit the files assigned to you.** Foundation files are done:
   `src/index.css`, `tailwind.config.cjs`, `index.html`, `src/components/ui/*`,
   `src/components/Layout.js`, `src/components/nav/*`, `src/lib/motion.js`. Read them, don't change them.
2. Run `npm run build` from `apps/web/` before you finish. It must exit 0. Fix your own breakage.
3. Keep every `data-testid` attribute that already exists — tests and the demo depend on them.
4. Keep all existing API calls and their argument shapes (`src/lib/api.js` is frozen).
5. Keep the honest-status ethos: no fake reassurance, keep `MockedBadge`, keep the
   "never auto-submitted" language.
6. Preserve behaviour. This is a visual + interaction-quality pass, not a rewrite of logic.
7. Light and dark must both look intentional. Test the toggle.
8. Return a short list of the files you changed and anything the integrator should double-check.
