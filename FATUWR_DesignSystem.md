# FATUWR Training Portal — Design System v1
> Reference for all UI work. Claude Code should treat this as the source of truth for visual decisions.

---

## 1. Colour Tokens

```
Background
  --color-bg-base:        #111111   // App background
  --color-bg-card:        #1E1E1E   // Cards, bottom sheets, nav bar
  --color-bg-input:       #1E1E1E   // Form inputs
  --color-bg-modal:       #2A2A2A   // Modal/bottom sheet surface (slightly lifted)
  --color-bg-chip:        #2A2A2A   // Unselected chip

Accent
  --color-primary:        #2196F3   // Blue — primary CTA, active nav, selected chips, day badge
  --color-primary-light:  #42A5F5   // Hover / pressed state

Text
  --color-text-primary:   #FFFFFF   // Headings, values, names
  --color-text-secondary: #888888   // Labels, subtitles, metadata
  --color-text-accent:    #2196F3   // Day badge (e.g. THURSDAY), selected chip label

Status
  --color-warning-bg:     #3D3500   // Warning banner background (dark amber)
  --color-warning-text:   #F5C518   // Warning banner text (gold/yellow)

Divider
  --color-divider:        #2C2C2C   // List item separators
```

---

## 2. Typography

All text to Inter

```
Scale
  --text-xs:     12px / 1.4  — day badge (THURSDAY), tiny metadata
  --text-sm:     13px / 1.4  — list subtitles, form labels, fee labels, chip labels
  --text-base:   15px / 1.4  — body, input text, list names
  --text-md:     13px / 1.4  — button labels (Sign up, Submit, Cancel, Splits, admin actions)
  --text-lg:     16px / 1.2  — section headers ("Training Sign-ups"), card date
  --text-header: 16px / 1.2    — top bar title (bold, centred)

Weights
  Regular:  400  — secondary text, labels
  Medium:   400  — list names, chip labels, button labels
  Bold:     600  — page headings, date, section headers

Special treatments
  Day badge (e.g. THURSDAY): --text-xs, Bold, uppercase, letter-spacing: 0.08em, --color-text-accent
  Top bar title: --text-header, white, centred
```

---

## 3. Spacing & Layout

```
Base unit: 4px

--space-1:   4px
--space-2:   8px
--space-3:   12px
--space-4:   16px    // Standard horizontal page padding
--space-5:   20px
--space-6:   24px    // Section gaps
--space-8:   32px
--space-10:  40px

Page padding:         16px horizontal, 16px top
Card gap (list):      12px
Section gap:          24px
Bottom nav height:    64px (content must not be obscured by nav)
```

---

## 4. Border Radius

```
--radius-sm:    8px    // Chips, small buttons
--radius-md:    12px   // Input fields, warning banners
--radius-lg:    16px   // Cards
--radius-xl:    24px   // Bottom sheet top corners
--radius-full:  9999px // Pill buttons (Sign up CTA, Submit/Cancel)
--radius-avatar: 50%   // User avatars
```

---

## 5. Components

### Top Navigation Bar
- Background: `--color-primary` (blue)
- Title: `--text-header`, Bold, white, horizontally centred
- Left: Hamburger menu icon (white)
- Height: ~56px

### Bottom Navigation Bar
- Background: `--color-bg-card`
- 4 tabs: Announcements, Training Sessions, Payments, Membership
- Active icon: `--color-primary`
- Inactive icon: `--color-text-secondary`
- No labels (icon only)
- Thin top border: `--color-divider`

### Session Card (list view)
- Background: `--color-bg-card`
- Border radius: `--radius-lg`
- Pool image: full width, ~180px height, rounded top corners matching card
- Padding below image: `--space-4`
- Day badge: uppercase, `--text-xs` (11px), bold, `--color-text-accent`, `letter-spacing: 0.08em`
- Date: `--text-lg` (19px), Bold, white, `--space-1` below badge
- Metadata row: Location | Attendance — `--text-sm` (13px), `--color-text-secondary`, pipe separator with `--space-3` gap

### Session Detail Header
- Full-bleed hero image, ~220px height
- Floating back button: circular, semi-transparent dark background, white chevron, top-left
- Content below image: `--space-4` padding, `--color-bg-base` background

### List Item (sign-ups)
- Layout: Avatar (40px) + name/subtitle column + trailing chevron
- Avatar: circular, `--radius-avatar`
- Name: `--text-base`, Medium, white
- Subtitle: `--text-sm`, `--color-text-secondary`
- Divider: 1px `--color-divider` between items (not above first)
- Trailing: chevron icon, `--color-text-secondary`

### Warning Banner
- Background: `--color-warning-bg`
- Text: `--text-sm`, Regular, `--color-warning-text`
- Border radius: `--radius-md`
- Padding: `--space-4`
- No icon — text only

### Pill / Chip (activity selector)
```
Unselected:
  background: transparent
  border: 1.5px solid --color-text-secondary
  text: --color-text-primary, --text-sm (13px), Medium
  border-radius: --radius-full
  padding: 6px 14px
  height: max 34px

Selected:
  background: transparent
  border: 1.5px solid --color-primary
  text: --color-primary, --text-sm (13px), Medium
```

### Input Field
- Background: transparent
- Border: 1px solid `--color-text-secondary`
- Border radius: `--radius-md`
- Text: `--color-text-primary`, `--text-base`
- Padding: `12px 16px`
- Focus border: `--color-primary`
- Label above field: `--text-sm`, Bold, white

### Primary Button (Sign up / Submit)
- Background: `--color-primary`
- Text: white, `--text-md` (13px), Medium
- Border radius: `--radius-full`
- Width: full-width
- Height: 48px
- No border

### Secondary Button (Cancel)
- Background: transparent
- Border: 1.5px solid `--color-text-secondary`
- Text: white, `--text-md` (13px), Medium
- Border radius: `--radius-full`
- Width: half-width (paired with primary)
- Height: 48px

### Pill Action Button (e.g. "Splits", admin actions)
- Background: `--color-bg-card`
- Border radius: `--radius-md`
- Text: white, `--text-md` (13px), Medium
- Leading icon: small edit/action icon, white
- Padding: `8px 14px`
- Self-sized (not full width)

### Bottom Sheet / Modal
- Background: `--color-bg-modal`
- Top border radius: `--radius-xl`
- Drag handle: short gray bar centred at top (optional)
- Close button: top-right, circular, `--color-bg-card`, × icon white
- Padding: `--space-6` horizontal, `--space-4` top
- Bottom safe area padding required

### Label / Value Pair (fee display)
- Label: `--text-sm`, `--color-text-secondary`
- Value: `--text-base`, `--color-text-primary`
- Stack vertically, `--space-1` gap between label and value
- `--space-5` gap between pairs

---

## 6. Interaction States

```
Buttons:     opacity 0.85 on press
Chips:       border transitions to --color-primary on select, text follows
Inputs:      border transitions to --color-primary on focus
List items:  background --color-bg-card on press (ripple/highlight)
Cards:       subtle scale(0.98) on press (optional, mobile feel)
```

---

## 7. Iconography

- Style: Outlined (not filled), consistent stroke weight ~1.5–2px
- Size: 24px standard, 20px in nav bar, 16px inline
- Colour: follows text colour of context (white, gray, or blue)
- Library: Use lucide-react (already in project dependencies)

---

## 8. What NOT to do

- No white or light backgrounds — this is a dark-mode-only app
- No shadows (dark mode; use layered backgrounds instead)
- No coloured backgrounds on cards other than `--color-bg-card`
- No mixed font weights within a single label/value pair
- No full-width secondary buttons — only primary CTAs span full width
- No labels inside input fields (always above)
- Avoid more than two colours of text on any single screen

---

## 9. Quick Reference — Key Screens

| Screen | Background | Header style | Primary action |
|---|---|---|---|
| Sessions list | `--color-bg-base` | Blue top bar | Card tap |
| Session detail | `--color-bg-base` | Hero image | Blue Sign up button |
| Sign-up modal | `--color-bg-modal` | None (X close) | Blue Submit button |
| Payments | `--color-bg-base` | Blue top bar | — |
| Membership | `--color-bg-base` | Blue top bar | — |
