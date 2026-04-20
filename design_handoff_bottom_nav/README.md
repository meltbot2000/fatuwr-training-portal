# Handoff: Bottom Navigation Bar

## Overview
5-tab bottom navigation bar for the FATUWR mobile app. Outlined icon style with a top indicator bar marking the active tab.

## About the Design Files
The file in this bundle is a **design reference created in HTML** — a prototype showing intended look and behavior, not production code to copy directly. Recreate it in the FATUWR codebase's existing environment using established patterns and components.

## Fidelity
**High-fidelity.** Uses FATUWR Design System v5 tokens. Implement pixel-perfectly.

## Where It Lives
Persistent bottom navigation bar, pinned to the bottom of the viewport on every primary screen of the app. Five tabs, in this fixed order left-to-right:

1. **Trainings** — Training Sessions list
2. **Info** — Coaching info / announcements
3. **Payments** — Payment history / balances
4. **More** — Overflow menu (settings, membership, help, etc.)
5. **Admin** — Admin-only section (visibility may be role-gated per existing rules)

## Spec

### Bar container
- Height: `72px`
- Background: `#1E1E1E` (`--color-surface`)
- Top border: `1px solid #2C2C2C` (`--color-divider`)
- Safe-area inset: add iOS home-indicator padding below the 72px content height — don't shrink the touch area into the safe area.
- Layout: 5 equal-width flex children (`flex: 1 1 0` each).

### Tab item
- Layout: vertical flex, centered, `gap: 4px` between icon and label
- Icon size: `22×22` px, `stroke-width: 1.8`, `stroke: currentColor`, no fill
- Label: `Inter 11px / 500`, letter-spacing `0.01em`, truncate with ellipsis if needed
- Inactive color: `#888888` (`--color-text-secondary`) — applied to both icon stroke and label
- Active color: `#2196F3` (`--color-primary`) — icon + label
- Active label weight: `600` (bumped from 500)
- Minimum hit target: 44×44 (the 72px bar + 20%-width cell easily clears this; no extra work needed)

### Active indicator (top bar)
A short horizontal bar pinned to the **top edge** of the bar, centered above the active tab's icon.
- Width: `28px`
- Height: `3px`
- Background: `#2196F3` (`--color-primary`)
- Border-radius: `0 0 4px 4px` (rounded only at the bottom)
- Position: flush with the top edge of the nav bar (not floating above it)
- Only one tab shows the bar at a time

### Icons (all outlined, 24×24 viewBox, stroke: currentColor, stroke-width: 1.8, fill: none)

**1. Trainings** — calendar with dot
```svg
<rect x="3" y="5" width="18" height="16" rx="2.5" stroke="currentColor" stroke-width="1.8"/>
<path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
<circle cx="12" cy="15" r="1.5" fill="currentColor"/>
```

**2. Info** — megaphone
```svg
<path d="M4 10v4l14 6V4L4 10z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
<path d="M8 14v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
```

**3. Payments** — dollar in circle
```svg
<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/>
<path d="M15 9a3 3 0 00-3-1.5c-1.7 0-3 1-3 2.3 0 1.3 1.2 1.9 3 2.2 1.8.3 3 .9 3 2.2 0 1.3-1.3 2.3-3 2.3a3 3 0 01-3-1.5M12 6v12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
```

**4. More** — bento grid (2×2 rounded squares)
```svg
<rect x="3.5" y="3.5"  width="7" height="7" rx="1.8" stroke="currentColor" stroke-width="1.8"/>
<rect x="13.5" y="3.5" width="7" height="7" rx="1.8" stroke="currentColor" stroke-width="1.8"/>
<rect x="3.5" y="13.5" width="7" height="7" rx="1.8" stroke="currentColor" stroke-width="1.8"/>
<rect x="13.5" y="13.5" width="7" height="7" rx="1.8" stroke="currentColor" stroke-width="1.8"/>
```

**5. Admin** — shield with check
```svg
<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
<path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
```

## Behavior
- Tap a tab → navigate to that section; update active state immediately (no delay animation required).
- Active state transition: instant color change is fine. Optional: a ~150ms fade on the top indicator bar sliding to the new tab, if the codebase already does this sort of thing; don't build it from scratch just for this.
- Double-tap the active tab → scroll its scroll view to top (standard iOS/Android convention — match existing behavior if the codebase has it).
- Admin tab visibility: follow existing role-based gating rules; if the user is not an admin, either hide this tab entirely or keep the ordering stable — coordinate with existing logic rather than inventing new rules.

## Design Tokens Referenced
```
--color-primary:        #2196F3
--color-surface:        #1E1E1E
--color-text-secondary: #888888
--color-divider:        #2C2C2C

Bar height:             72px
Icon size:              22px
Icon stroke-width:      1.8
Label font:             Inter 11/500 (active: 600)
Indicator:              28×3, rounded-bottom, primary color
```

## Why This Design (context for the developer)
- **Outlined icons** match iOS/Material defaults and keep visual weight consistent across tabs.
- **Top indicator bar** (instead of a filled pill or background tint behind the active icon) is the quietest active-state treatment — the indicator communicates selection without fighting the icon shapes for attention. Important because the nav is persistent across every screen.
- **Bento grid for More** (instead of three dots or a hamburger) gives the overflow tab a small amount of personality while still reading clearly as "multiple things / sections." The four squares also visually echo an app grid, which matches what users find when they tap in.

## Files
- `Bottom nav bento.html` — interactive prototype rendered at 320 / 375 / 430 widths. Click any tab to preview its active state.
