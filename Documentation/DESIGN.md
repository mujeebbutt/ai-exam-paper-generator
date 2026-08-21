# UstadExam — Visual Design Reference

Documents the current UI as actually implemented ([frontend/index.html](../frontend/index.html), [frontend/src/style.css](../frontend/src/style.css)) — colors, type, iconography, components, and motion. This is a description of what's live in the code today, not a proposal.

---

## 1. Design Language

**Dark, glassy, "premium lab" aesthetic.** Near-black background, translucent frosted-glass cards, a rose/crimson accent, heavy uppercase tracked-out typography for labels, and soft ambient glow/blur shapes drifting behind everything. Everything is built with Tailwind utility classes (loaded from the CDN, `darkMode: "class"`, `<html class="dark">`) plus a small hand-written `style.css` for effects Tailwind can't express (glass blur, custom scrollbars, keyframe animations, the toggle switch).

There is **no light mode in active use** — see [§6](#6-dormant-light-theme).

---

## 2. Color Palette

Defined once, in the Tailwind CDN config block in `index.html`:

```js
colors: {
  "background":            "#050505",
  "surface":                "#121212",
  "on-surface":             "#ffffff",
  "on-surface-variant":     "#a1a1aa",
  "primary":                "#fb7185",  // rose-400
  "primary-container":      "#e11d48",  // rose-600
}
```

| Swatch | Token / value | Role |
|---|---|---|
| `#050505` | `background` | Page background — near-black, not pure `#000` |
| `#121212` | `surface` | Base for glass cards and the floating nav bar |
| `#ffffff` | `on-surface` | Primary text |
| `#a1a1aa` (zinc-400) | `on-surface-variant` | Secondary/muted text (also reached ad hoc via `text-white/40`, `/30`, `/20`) |
| `#fb7185` (rose-400) | `primary` | The one accent used everywhere: buttons, active nav state, focus rings, icons, headline gradients |
| `#e11d48` (rose-600) | `primary-container` | Deeper accent — text selection highlight, background glow spheres, checked-toggle fill |
| `#9f1239` (rose-800) | *(hardcoded, not a token)* | Second ambient background sphere only |

**Semantic / status colors** (plain Tailwind palette classes, not custom tokens — used consistently but not centralized):

| Color | Class family | Meaning |
|---|---|---|
| Emerald (`#10b981`/`emerald-400/500`) | `text-emerald-400`, `border-emerald-500/30` | Success, correct answers, "graded" status, healthy scores |
| Amber (`amber-400`) | `text-amber-400`, `border-amber-500/30` | Warnings, weak-topic flags, "review" badges |
| Red / Rose (`red-400`, `rose-500`) | `text-red-400`, `hover:text-rose-500` | Errors, destructive actions (delete, logout hover state) |
| Indigo (`indigo-400`) | `text-indigo-400` | One-off accent for the Integrity feature icon (visually distinct from the primary rose so it doesn't get lost among the many rose-accented cards) |

**Backgrounds are never flat.** Every page sits on top of:
- A fixed near-black base (`#050505`)
- A subtle noise/grain texture overlay (`stardust.png`, 10% opacity)
- 2–3 large blurred "gradient sphere" divs in rose tones (`blur(150px)`, ~30% opacity), slowly drifting via CSS keyframes

---

## 3. Typography

- **Loaded font:** Inter (weights 300–800) via Google Fonts, plus Material Symbols Outlined for icons.
- **⚠️ Currently not actually applied.** `<body>` uses Tailwind's `font-sans` utility, but the Tailwind config never overrides `fontFamily.sans` to include `"Inter"` — so `font-sans` resolves to Tailwind's *default* stack (`ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, ...`), not the Inter file that gets downloaded. In practice the page renders in the visiting OS's native UI font (Segoe UI on Windows, San Francisco on macOS, Roboto on Android/Chrome OS) rather than Inter. Visually close enough that this has gone unnoticed, but it means the Inter download is currently wasted bytes. Fix is one line: `fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui'] }` in the Tailwind config.

**Type scale & voice** — a small, consistent set of patterns reused everywhere rather than a formal scale:

| Pattern | Tailwind classes (typical) | Used for |
|---|---|---|
| Hero display | `text-6xl md:text-8xl font-black tracking-tighter` | Page-level headlines ("USTADEXAM", "THE VAULT") |
| Section heading | `text-4xl md:text-5xl font-black tracking-tight` | Section titles |
| Card title | `text-xl` / `text-3xl font-black` | Card/panel headings |
| **Eyebrow label** | `text-[9px]`–`text-[10px] font-black uppercase tracking-[0.2em]`–`[0.4em]` | The single most-repeated pattern in the app — tiny, bold, uppercase, wide letter-spacing labels above headings, on badges, stat captions, section kickers |
| Body copy | `text-sm`/`text-base text-white/40` at ~40–50% opacity | Paragraphs, descriptions — never full-opacity white, always dimmed against the dark background |
| Buttons | `font-black uppercase tracking-widest text-xs`–`text-sm` | Every button label, no exceptions |

Font weight is almost always **black (900)** or **bold** — there's very little use of regular/medium weight text; the hierarchy comes from size, opacity, and color instead of weight variation.

---

## 4. Iconography

**Material Symbols Outlined** exclusively (Google's icon font, variable weight/fill axis). No SVG icon library, no emoji-as-UI (emoji do appear in status messages, e.g. "✅"/"❌" prefixes in form error/success text). Icons are typically:
- Sized `text-lg`–`text-4xl` depending on context (inline label icon vs. large feature-card icon)
- Wrapped in a rounded, tinted square/circle container (`bg-primary/10` + `text-primary`) for feature cards and avatars
- Colored to match the semantic context (emerald `check_circle`, amber `flag`, rose `delete`/`logout`)

---

## 5. Layout & Components

### Shape language
Corners are **very rounded and get rounder with size** — small controls use `rounded-xl`/`rounded-2xl`, cards use `rounded-[2rem]`–`rounded-[3rem]`, and any pill/badge/button-that-should-look-soft uses `rounded-full`. Sharp corners essentially don't appear anywhere in the UI.

### `.premium-glass` — the core surface
The one card treatment used for every panel, form, and stat block in the app:
```css
.premium-glass {
  background: radial-gradient(circle at top left, rgba(40,40,40,.4), transparent 40%),
              linear-gradient(135deg, rgba(15,15,15,.8), rgba(5,5,5,.9));
  backdrop-filter: blur(50px);
  border: 1px solid rgba(255,255,255,.05);
  box-shadow: 0 25px 60px rgba(0,0,0,.6), inset 0 0 0 1px rgba(255,255,255,.02);
}
/* hover: border and inner glow shift to rose (rgba(225,29,72,...)) */
```
On hover, every glass card's border and shadow tint rose — the app's primary way of signaling "this is interactive."

### Buttons
Two consistent variants, no third:
- **Primary (solid):** `bg-primary` (or `bg-primary` + `shadow-primary/20`), white text, used for the one main action per screen (Generate, Save, Register/Login submit, main CTAs)
- **Ghost/outline:** `bg-white/5 hover:bg-white/10 border border-white/10`, used for every secondary action

### Navigation
`#main-nav` is a **floating pill-shaped dock**, fixed to the bottom-center of the viewport (`bottom-[130px]`), glass-styled, gently bobbing via a `navFloat` keyframe animation. Active item gets `.active` (filled/highlighted); inactive items sit at `text-white/40`. It's hidden only during active exam-taking (to avoid overlapping question content) and role/auth-gated per-button (e.g. Integrity hidden from non-teachers, Login/Register vs. Profile/Logout toggled by session state).

### Badges & pills
`type-pill` (question-type selector chips) and various status badges share the same idiom: translucent white background at rest, rose fill + rose glow (`box-shadow: 0 0 30px rgba(225,29,72,.3)`) when active/selected.

### Toggle switches
A hand-rolled iOS-style `.switch`/`.slider` (not a Tailwind plugin) — 40×20px track, white thumb, track fills rose (`#e11d48`) when checked.

### Modals
`.modal-backdrop` (fixed, full-screen, `rgba(0,0,0,.4)` + `blur(10px)`) behind `.modal-content`, which slides/scales in (`modalSlideUp`, 0.4s cubic-bezier). Used for the custom confirmation dialogs that replaced native browser `confirm()`/`alert()`.

### Scrollbars
Custom-styled (`.custom-scrollbar`, WebKit only) — thin (8px), near-invisible track, translucent white thumb that turns rose on hover. Keeps scrollable panels visually consistent with the rest of the dark theme instead of showing the OS's default scrollbar.

---

## 6. Dormant Light Theme

`style.css` contains a `body.theme-light` rule set (lines ~340–465) that would swap the page to a light background (`#f1f5f9`), light cards, and a blue accent (`#3b82f6`) instead of rose. **No JS anywhere toggles this class** — it's unused/unreachable in the current build, most likely leftover from an earlier design pass or scoped originally to just the exam-paper print/export preview. Worth knowing before assuming a light-mode toggle exists.

---

## 7. Motion

All motion is CSS `@keyframes`, no JS animation library:

| Animation | Effect | Where |
|---|---|---|
| `float` / `drift` | Slow, large-radius drifting | Background gradient blobs/spheres |
| `floatUI` | Gentle vertical bob (±10px) | Hero input container, question-type pill row |
| `navFloat` | Gentle vertical bob (±8px) | The floating bottom nav dock |
| `pulseText` | Slow scale/opacity breathing | Hero headline |
| `arrowRotate` | Small rotate/scale wiggle | Decorative arrow accents |
| `modalSlideUp` | Slide-up + scale-in, 0.4s | Modal open |
| `fadeIn` | Fade + slight upward slide, 0.4s | Page-section entrances |
| `wiggle` | Playful rotation | AI-assistant avatar, clicked |
| `shimmer` | Moving highlight sweep | Progress bar during generation |

Nothing is jarring or fast — every transition sits in the 0.3s–0.5s range with `cubic-bezier(0.4, 0, 0.2, 1)` or similar eased curves, reinforcing the "premium/slow" feel over snappy micro-interactions.

---

## 8. Known Inconsistencies Worth Fixing

- **Inter is downloaded but never applied** (§3) — either wire it into `tailwind.config.fontFamily.sans`, or drop the `<link>` to stop paying for an unused font fetch.
- **Light theme CSS is dead code** (§6) — either wire up a real toggle or delete the unused rules to reduce confusion for future edits.
- Tailwind is still loaded from the CDN (`cdn.tailwindcss.com`), which prints its own "not for production" console warning — flagged previously; a real build step (Tailwind CLI/PostCSS) would remove both that warning and the unused-Inter question in one pass, since a real build can also purge/tree-shake.
