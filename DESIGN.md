# DESIGN

Dark-only pro editing tool: near-black zinc surfaces, one green accent, dense 11–13px UI text. The video is the brightest thing on screen, and the chrome stays quieter than the footage. Every name below traces to `frontend/app/globals.css`, `frontend/tailwind.config.ts` or `frontend/components/ui/*`. If it isn't listed here, it doesn't exist.

## Color: which layer is allowed

Components use **semantic tokens** (`bg-background`, `text-muted-foreground`, `border-border`, `bg-primary`). Never add a hex value, `rgb()`, or an inline `style={{ background }}` color in new code, because raw values can't be retuned from `globals.css` and they drift.

The editor was built before this rule, so it still has about 80 raw `zinc-*` classes and some inline `rgba()`. When you touch a line that has them, convert it with this table. Don't mass-convert files you aren't otherwise editing.

| Raw (legacy) | Use instead |
| --- | --- |
| `bg-zinc-950`, `rgb(9,9,11)` | `bg-background` |
| `bg-zinc-800`, `border-zinc-800` | `bg-secondary`, `border-border` |
| `text-white`, `text-zinc-100` | `text-foreground` |
| `text-zinc-400` | `text-muted-foreground` |
| `emerald-*`, `#10B981` | `primary` (`text-primary`, `bg-primary/15`, `border-primary/20`) |

**Text has four tiers, and only four.** No token exists yet for tiers 2 and 4, so these exact classes are the rule:

```
Is it the main content (chat text, values, timecode now)?  → text-foreground
Is it a label or secondary value?                           → text-zinc-300
Is it help text, metadata, or the total duration?           → text-muted-foreground
Is it a separator glyph or a disabled hint?                 → text-zinc-600
```

### Accent meanings (fixed, never swap them)

| Meaning | Color | Where it lives now |
| --- | --- | --- |
| Primary action, focus ring, trim segment, success | `primary` (green, `142 71% 45%`) | `bg-primary` buttons, trim handles, export link |
| Speed segment | `violet-400` | Speed-widget handles in `timeline.tsx` |
| Zoom effect | `sky-400` | Effects lane in `effects-track.tsx` |
| Text effect | `fuchsia-400` | Effects lane in `effects-track.tsx` |
| Blur effect | `slate-300` | Effects lane in `effects-track.tsx` |
| Warning (for example, video too long) | `amber-300` text on `amber` at 6% bg / 20% border | `inspector.tsx` duration warning |
| Removed (trimmed-out) region | `bg-red-950/30` | Trim masks in `timeline.tsx` |
| Destructive action | `destructive` token | `Button variant="destructive"` |

A user reads trim = green and speed = violet across the whole timeline. Reusing violet for anything else breaks that mapping.

## Typography

| Role | Class |
| --- | --- |
| Chat messages | `text-[13px] leading-relaxed` |
| Default UI (buttons, inputs) | `text-sm` (14px) or `text-xs` (12px) |
| Meta, hints, ruler labels | `text-[11px]` |
| `kbd` keycaps | `font-mono text-[10px]` |

Never go below 10px (the one `text-[9px]` in the code is legacy; don't copy it). Put `font-mono tabular-nums` on every number that changes while you watch it, such as timecodes and durations, so digits don't jitter.

## Radius, spacing, motion

- Radius: `rounded-md` for controls (buttons, inputs), `rounded-lg` for panels, cards and chat bubbles, and `rounded-full` for handles, pills and badges. `rounded-xl` and `rounded-2xl` are legacy, so don't add more.
- Nested radius: inner radius = outer radius − padding. A `rounded-lg` panel with `p-1` holds `rounded-md` children.
- Motion: `transition-colors duration-200` for every hover/active color change. The only allowed press feedback is `active:scale-95` on icon buttons (see the Send button). Never animate layout. No animation library is installed (the README's mention of Framer Motion is wrong), so don't add one for hover effects.

## Button (`components/ui/button.tsx`)

Use it for actions. Downloads and navigation are `<a>` elements; the export result is an `<a>` styled with primary tints, not a Button.

Variants: `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`. Sizes: `default`, `sm`, `lg`, `icon`. Nothing else exists. An unlisted variant is a bug, not an option.

```
Is it the one main text action in this panel?                   → variant="default" (green). One per panel.
Is it the main action but icon-only (Send)?                     → variant="ghost" size="icon" className="text-primary hover:bg-primary/15"
Does it delete or discard work?                                  → variant="destructive"
Is it an icon-only control in a toolbar (play, mute, zoom)?      → variant="ghost" size="icon"
Otherwise                                                        → variant="secondary"
```

Two green buttons in one panel means the panel has no main action.

```tsx
// Correct: stage.tsx
<Button variant="ghost" size="icon" onClick={togglePlayPause} className="h-7 w-7 text-zinc-300 hover:text-white">

// Incorrect: "subtle" doesn't exist, and a raw hex bypasses tokens
<Button variant="subtle" className="bg-[#10B981]">
```

Every icon-only Button needs an `aria-label`. None of the existing ones have one, so add it whenever you touch one.

## Other primitives

| Component | Use it for | Use this instead when… |
| --- | --- | --- |
| `Tooltip` | Naming an icon-only button and its shortcut (for example, "Trim (T)") | The text is more than one short line: put it in the inspector |
| `Slider` | Continuous values (volume, zoom) | The value is discrete with 2–5 options: use buttons |
| `ScrollArea` | Chat history and other scrolling panels | Horizontal timeline scroll: that uses `.scrollbar-thin` |
| `Separator` | Dividing toolbar groups | Dividing panels: use `border-border` on the panel |
| `Textarea` / `Input` | Form fields (focus ring is `ring-primary`) | Chat composer: it's a bare `textarea` in `inspector.tsx`, so keep that style |
| `Badge` (`default`, `secondary`, `outline`), `Card` | Available, currently unused | — |

Add a new primitive with shadcn (`components.json`, style from `components/ui/*`), then list it in this table.

## Layout

The layout is fixed and full-viewport: `Stage` fills the remaining width, `Inspector` is the right sidebar, and `Timeline` runs the full width at the bottom (`app/page.tsx`). The page never scrolls; only panels scroll. Empty states (no video loaded) show one sentence and one primary action, never a blank panel.
