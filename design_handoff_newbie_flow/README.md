# FATUWR — Newbie Sign-up Flow (Claude Code handoff)

Design source: `Newbie flow.html` — open it to see all 7 screens laid out side-by-side.

## What this is
The complete first-run / newbie sign-up journey, redesigned end-to-end:

| # | Screen | Notes |
|---|--------|-------|
| 1 | **Welcome** | Logo on white circle w/ blue glow halo over deep-navy radial-gradient background. Sign in / Create account / "Find out more about trying UWR for free ›" link. No top bar. |
| 2 | **Find out more** | Plain DSM-aligned screen. H1 "Try underwater rugby for free", body copy, venues line, "Next available dates" list, primary CTA "Sign up for a session". |
| 2b | **Complete profile (post-OTP)** | Step indicator (3/3), profile-icon header, Full name (required), Phone (required, "so we can contact you" helper). **No DOB.** |
| 3 | **Which best describes you** | Standalone — **no top bar, no back arrow.** Centred title, three radio options. Only "First timer / Newbie" continues into the newbie flow; the other two route to the regular Training Sessions sign-up. |
| 4 | **Pick a session** | Date-row list w/ slot counter (`N left of 10` — primary blue `#2196F3`, not amber). Dashed "Can't make any of these?" fallback row, selectable. |
| 4b | **Pick a session — empty state** | Variant of 4 when no upcoming dates. Shows "No sessions scheduled right now." card + the contact-me row pre-selected as the only option. **No separate empty-state screen.** |
| 5 | **Gear** | Card list of 3 checkboxes (Mask / Snorkel / Fins). When Fins is checked, an inline accent-tinted Foot Size (EU) field appears beneath. |
| 6 | **Confirmation** | Success check, "See you at the pool!" title, summary card, **WhatsApp CTA as a list-row** (green only on the 40×40 icon chip, not full-width green button). **No "Add to calendar".** |

## Design system
**Use the existing tokens — do not introduce new ones.** From `FATUWR_DesignSystem.md` v5:

```
--bg-base:       #111111
--bg-card:       #1E1E1E
--bg-card-2:     #252525
--bg-modal:      #2A2A2A
--primary:       #2196F3
--primary-light: #93C5FD
--primary-tint-bg:     rgba(33,150,243,0.08)   /* selected card backgrounds */
--primary-tint-border: rgba(33,150,243,0.22)
--success:       #3DDC84   /* NOT #4CAF50 */
--success-bg:    rgba(61,220,132,0.12)
--text:          #FFFFFF
--text-2:        #9B9B9B
--text-3:        #6B6B6B
--divider:       #2C2C2C

--radius-md:  12px   (inputs, date rows)
--radius-lg:  16px   (cards, picker items)
--radius-full: 9999px (buttons, pills)

font-family: 'Inter', system-ui, sans-serif;  /* 400 / 500 / 600 / 700 */
```

Top bars are `bg-card` with a 1px `divider` bottom border. Title centred, 16px/600. Back arrow is a chevron stroke icon, never coloured.

## Components used (build / reuse if missing)
- `<Topbar back? title>` — 52px tall, card-bg, divider bottom.
- `<Button variant="primary|secondary|link">` — 44px tall, full-width, pill shape (`radius-full`).
- `<Input>` — bg-card, divider border, focus → primary border.
- `<RadioCard selected>` — picker-item pattern. Body left, radio dot right. Selected → primary border + primary-tint-bg.
- `<DateRow selected slotsLeft />` — date circle (44×48) on left, title/subtitle middle, "N left / of 10" on right.
- `<ContactMeRow selected>` — dashed-border variant of date-row used as the fallback option.
- `<Checkbox row>` — inside a card group with internal dividers between rows. 22px square, primary fill when on.
- `<ConditionalField>` — primary-tint container with primary-tint-border, surfaces when its parent checkbox is on.
- `<SummaryCard>` — key/value rows, divider between, label muted, value 500/white.
- `<ListRowAction>` — used for the WhatsApp CTA on screen 6. 40×40 icon chip on left, title + subtitle in the middle, chevron on the right.

## Key behaviours
- **Branching after screen 3:** "First timer" → screen 4 (newbie flow). The other two options route straight into the existing Training Sessions sign-up screen — they are NOT continuations of this flow.
- **Foot size field on screen 5:** only renders when `fins === true`. When fins is unticked, the field disappears.
- **Slot counter colour on screen 4:** stays primary blue regardless of how few are left. Do not switch to amber/red — that's not in the DSM scale used elsewhere.
- **Welcome screen logo:** white circle, ~144px, with a pulsing blue radial-gradient halo behind it. Don't add the square/inner-circle stack.
- **Confirmation screen:** no calendar action. The WhatsApp join is a navigational list-row (deep-link out to WA group), not a primary submit.
- **Empty state for the picker (4b)** is the same screen as 4 — just swap the list of dates for a single "No sessions scheduled right now." card, and pre-select the contact-me row.

## Assets
- `assets/logo.jpg` — FATUWR Singapore wordmark logo. Used on welcome screen.

## Files in this handoff
- `Newbie flow.html` — full design at 7 screens × 320×660 phone frames.
- `FATUWR_DesignSystem.md` — design system v5 (single source of truth).
- `assets/logo.jpg` — logo asset.
- `README.md` — this file.

## What I would tell the developer
> Implement these screens per `Newbie flow.html`, using the existing component library and the v5 design system tokens — do not introduce new colours or new font sizes. The only net-new components are `<DateRow>` with the slot counter, the dashed-border `<ContactMeRow>`, and the `<ListRowAction>` pattern used on the confirmation screen for the WhatsApp join — all of these reuse existing tokens. After screen 3, only "First timer" branches into the newbie flow; the other two options route to the existing Training Sessions sign-up.
