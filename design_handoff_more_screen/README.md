# Handoff: FATUWR More Screen Redesign

## Overview
This handoff contains a redesigned **More** screen for the FATUWR Training Portal mobile app. The existing More screen used alternating blue/grey filled rows with large decorative icon bubbles, which felt visually loud and inconsistent with the rest of the app. The redesign brings it in line with the **Training Sessions** screen (the app's strongest visual pattern): imagery-led cards with a small uppercase category eyebrow, title, and subtitle.

## About the Design Files
The files in this bundle are **design references created in HTML** — a working prototype showing intended look and behavior, not production code to copy directly. The task is to **recreate this design in the FATUWR codebase's existing environment** using its established patterns, component library, and navigation conventions.

Open `More.html` in a browser to interact with the prototype. A Tweaks panel in the browser lets you toggle between layout variants; the chosen final direction is the **Compact** variant with category eyebrow visible and share card hidden (see "Chosen Variant" below).

## Fidelity
**High-fidelity.** The prototype uses the FATUWR design system tokens (colors, typography, spacing, radii) verbatim from `FATUWR_DesignSystem.md v5`. Recreate the UI pixel-perfectly using your existing design-system components where they exist, and the exact token values listed below where they don't.

## Chosen Variant
After review, the **Compact** card layout was selected:
- `variant: "compact"`
- `showEyebrow: true`
- `showShareCard: false`

Ignore the Hero and Mixed variants in the prototype — they were exploratory. The Share-the-app card has been dropped from this screen entirely.

## Screen: More

### Purpose
Secondary navigation hub. Lets members reach Membership, Club Policies, Invite a Friend, Merchandise, New-to-the-Club guide, Resources & Links, and Videos.

### Layout
- **Top bar** (56px, full width, `--color-primary` background): centered title "More" in white, `--fs-header` (17px/600); right-slot avatar circle (32px, `rgba(255,255,255,0.22)` bg, initial "M" in white 13px/600).
- **Content area** (16px page padding all around, gap 12px between cards, scrollable): vertical stack of 7 Compact Cards, one per item.
- **Bottom nav** (64px, `--color-bg-card`, 1px top border `--color-divider`): 5 tab icons (Sessions, Announcements, Payments, More, Admin). "More" tab is active — icon in `--color-primary`, others in `--color-text-secondary`.

### Component: Compact Card
Each card is a single tappable row with a square image on the left and stacked text on the right.

**Container:**
- Background: `--color-bg-card` (#1E1E1E)
- Border radius: `--radius-lg` (16px)
- Min height: 96px
- Display: flex, align-items stretch
- Overflow: hidden
- No border, no shadow

**Left image block:**
- Width: 112px (fixed)
- Height: fills card (stretches to ~96px min)
- Full-bleed photograph or illustration representing the item — these should be **real photos/graphics supplied by the club**, not SVG placeholders. The prototype's SVG art is standing in for real imagery.
- No padding between image and text; image sits edge-to-edge against card's left edge.

**Right text block** (padding 14px 16px, flex column, justify-content center, flex 1):
- **Eyebrow** (category label): `--fs-badge` (11px/600), `--color-primary` (#2196F3), text-transform uppercase, letter-spacing 0.08em, margin-bottom 4px.
- **Title**: `--fs-primary` (15px/500), `--color-text-primary` (#FFFFFF), margin-bottom 2px.
- **Subtitle**: `--fs-meta` (13px/400), `--color-text-secondary` (#888888).

**Trailing chevron** (padding 0 16px, vertically centered):
- 14×14 SVG chevron-right, stroke `#666`, stroke-width 2.

### Content

| Key | Eyebrow (uppercase) | Title | Subtitle |
|---|---|---|---|
| membership | MEMBERSHIP | Membership | Fees, trials & renewals |
| policies | CLUB POLICIES | Club Policies | Training rules & guidelines |
| invite | GET INVOLVED | Invite a Friend | Bring someone new to try UWR |
| merch | SHOP | Merchandise | FATUWR gear & apparel |
| new | GETTING STARTED | New to the Club | Beginner's guide to FATUWR |
| resources | REFERENCE | Resources & Links | Useful documents & websites |
| videos | WATCH | Videos | Highlights & tutorials |

## Interactions & Behavior
- **Tap a card** → navigate to the corresponding detail screen (Membership, Policies, etc.).
- **Tap a bottom-nav icon** → switch tab.
- **Press state**: cards can optionally scale to 0.992 on press for tactile feedback; no hover state on mobile.
- **Scroll**: content area scrolls vertically; top bar and bottom nav remain fixed.
- No animations beyond the standard tab-switch and push-navigation of the host app.

## State
This screen is stateless aside from the active tab indicator (owned by the app's navigation shell).

## Design Tokens (from FATUWR Design System v5)
```
--color-bg-base:        #111111
--color-bg-card:        #1E1E1E
--color-primary:        #2196F3
--color-text-primary:   #FFFFFF
--color-text-secondary: #888888
--color-divider:        #2C2C2C

--fs-header:   17px / 600   (top bar title)
--fs-primary:  15px / 500   (card title)
--fs-meta:     13px / 400   (card subtitle)
--fs-badge:    11px / 600   (eyebrow — uppercase, 0.08em tracking)

--radius-lg:   16px
Page padding horizontal: 16px
Card gap:      12px
Top bar height: 56px
Bottom nav height: 64px
Image tile width: 112px
Card min-height: 96px
```

## Design System Recommendations
During this redesign, a few amendments to the design system are recommended:

1. **Promote the day-badge treatment to a reusable "category eyebrow" token.** Same 11px/600/uppercase/0.08em spec — useful on any card that needs a tiny scannable label, not just session days.
2. **Add a "Hero Card" component spec** (sibling to Session Card) describing the 180px top-image + text-block-below pattern. Makes it reusable for Announcements and future list screens.
3. **Remove the filled-blue row pattern from the current More screen spec.** Reserve `--color-primary` for active states, CTAs, eyebrows, and the day badge. Using it as a full row fill makes every row feel like a CTA and competes with the bottom-nav active state.
4. **Add guidance: prefer imagery over decorative iconography on list screens.** The screens the team liked best (Sessions, Announcements) are imagery-led; the screen that was disliked (original More) was icon-led.

## Assets
The prototype uses procedural SVG scenes as placeholders for each of the 7 items. **Replace these with real photography/illustrations** supplied by the club before shipping. Each card needs one image, cropped to fit a 112×96 tile (or the developer's preferred responsive equivalent).

Suggested imagery per item (align with content):
- Membership → club member shot or membership card mockup
- Club Policies → document/crest imagery
- Invite a Friend → group training shot
- Merchandise → product flat-lay
- New to the Club → beginner training scene
- Resources & Links → stacked-docs photo or abstract
- Videos → video-highlight still with play glyph overlay

## Files
- `More.html` — the interactive prototype. Open in a browser to see the Compact variant with eyebrow on, share card off.
- `FATUWR_DesignSystem.md` — the design system v5 that governs tokens, typography, components.
- `reference_screens/` — the three original screenshots for context:
  - `01_more_original.png` (the screen being replaced)
  - `02_announcements.png` (reference — user liked)
  - `03_training_sessions.png` (reference — user's favorite; this redesign matches its style)
