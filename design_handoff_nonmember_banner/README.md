# Handoff: Non-Member Banner (V4 · Compact Accent Strip)

## Overview
A compact, low-key banner shown at the top of the **Training Sessions** screen when the viewer is not a Trial or Annual Member. Replaces the previous dark-blue banner + full-width blue CTA combination (which duplicated the same message and pushed session cards below the fold).

## About the Design Files
The file in this bundle is a **design reference created in HTML** — a prototype showing intended look and behavior, not production code to copy directly. Recreate it in the FATUWR codebase's existing environment using established patterns and components.

## Fidelity
**High-fidelity.** Uses FATUWR Design System v5 tokens. Implement pixel-perfectly.

## Where It Lives
- **Screen**: Training Sessions (list view)
- **Position**: Top of the scrollable content area, above the first session card.
- **Visibility**: Shown only to users whose membership status is *not* "Trial" or "Annual Member" (i.e. non-members).
- **Dismissable**: No. It stays visible until the user becomes a member.

## Component Spec

### Container
- Background: `rgba(33, 150, 243, 0.08)` — a 8%-opacity tint of `--color-primary`
- Border: `1px solid rgba(33, 150, 243, 0.22)`
- Border-radius: `10px`
- Padding: `10px 12px`
- Display: single flex row (no multi-column layout — text and CTA flow inline)
- Tappable: the whole strip navigates to the Membership info screen

### Content (single inline text block)
All text sits in one line-wrapping paragraph, `font-size: 12px`, `line-height: 1.45`:

1. **"Not a member yet?"** — `color: #FFFFFF`, `font-weight: 500`
2. (space) **"Save on training fees with a Trial or Annual membership."** — `color: #888888` (`--color-text-secondary`), `font-weight: 400`
3. (space) **"Join ›"** — `color: #2196F3` (`--color-primary`), `font-weight: 500`, `white-space: nowrap`

The "Join ›" span must not wrap alone — it's an inline CTA at the end of the sentence, not a separate column.

### Exact Copy
```
Not a member yet? Save on training fees with a Trial or Annual membership. Join ›
```

## Behavior
- Tap the banner → navigate to the Membership / "How to become a Member" screen.
- No hover, no press-state scale animation required (match existing card press behavior if the codebase has one).
- No dismiss control.

## Design Tokens Referenced
```
--color-primary:        #2196F3
--color-text-primary:   #FFFFFF
--color-text-secondary: #888888

Background tint:  rgba(33,150,243,0.08)
Border tint:      rgba(33,150,243,0.22)
Border-radius:    10px
Padding:          10px 12px
Font size:        12px
Line height:      1.45
```

## Why This Design (context for the developer)
The original used two stacked elements: a dark-blue info banner and a full-width primary CTA button. Problems:
1. They said the same thing twice.
2. The bright blue CTA competed with the session-card hero imagery that is the screen's focus.
3. Together they consumed ~160px before any session card was visible.

V4 solves all three: one element, inline CTA, minimal vertical footprint, tint-level accent that doesn't compete with the session photography.

## Files
- `Non-member banner.html` — interactive prototype showing the original plus 4 alternatives side-by-side. V4 (Compact accent strip) is the chosen direction; ignore the other three variants.
