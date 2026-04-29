# FATUWR Training Portal — Design System v5
> This file applies to every screen and component in the app without exception.
> When building or modifying any UI: identify the correct token for each element before writing code.
> Last updated: 2026-04-17

---

## 1. Colour Tokens

```
Background
  --color-bg-base:        #111111   // Page background on every screen
  --color-bg-card:        #1E1E1E   // Cards, nav bar, tab bar, bottom sheets, chip inactive bg
  --color-bg-input:       #1E1E1E   // Input fields
  --color-bg-modal:       #2A2A2A   // Modal and bottom sheet surface (sits above cards)

Accent
  --color-primary:        #2196F3   // Active nav icon, selected chip bg, CTA button bg, day badge text
  --color-primary-light:  #93C5FD   // Info / accent blue (Tailwind blue-300) — headings, highlights, student membership note

Text
  --color-text-primary:   #FFFFFF   // All primary content text
  --color-text-secondary: #888888   // All secondary / grey text

Status
  --color-warning-bg:     #3D3500   // Warning banner background
  --color-warning-text:   #F5C518   // Warning banner text
  --color-success:        #4CAF50   // Positive amounts (credits, payments received)

Divider
  --color-divider:        #2C2C2C   // Row dividers, card internal borders
```

---

## 2. Typography

**Font:** Inter on all screens. No other fonts.
**Rule:** Never use a size or weight outside this table. If unsure which to use, check the "Exact usages" column.

```
TOKEN        SIZE   WEIGHT   EXACT USAGES
─────────────────────────────────────────────────────────────────────────────────────
--fs-header  17px   600      Top bar title text ONLY
                             Examples: "Training Sessions", "Admin", "Session",
                             "Sign up", "Payments", "Membership"

--fs-body    16px   400      Form horizontal label/value rows (Name, Email, Status,
                             Total fee rows in sign-up); input field text;
                             general paragraph/body text on non-list screens

--fs-primary 15px   500      ALL button labels (Sign up, Splits, Submit, Cancel,
                             Confirm sign up, Admin: edit session, Admin: close sign-ups,
                             any future buttons);
                             Member/user names in list cards (Admin Members screen);
                             Section header text inside cards
                             (e.g. "How to pay via PayNow", "Training fees")

--fs-content 14px   400*     Session card date/time ("28 April 2026, 7:45 PM");
                             Payment card values ("T14SS0144D", "Mel");
                             Admin Payments table row names ("mel", "Jared");
                             Fee list dates ("6 Jan 2026");
                             Fee list amounts ("$13.00");
                             Tab bar labels ("Members", "Payments", "Sessions");
                             Chip labels (activity chips AND filter chips — see chips spec)
                             *weight-500 for admin row names and tab bar labels

--fs-meta    13px   400      ALL secondary grey text on every screen:
                             Location/pool ("CCAB", "MGS");
                             Signed-up count ("0 signed up");
                             Warning banner text;
                             Form stacked labels ("Club UEN (PayNow)", "Amount owed");
                             Payment instruction body text;
                             Fee row detail ("MGS · Regular Training");
                             Member email addresses;
                             Admin Payments row IDs ("ID: Mel");
                             Admin Payments dates ("16 Apr 2026");
                             Filter chip counts when inactive;
                             Any helper/caption text

--fs-badge   11px   500      Status pill text ONLY ("Non-Member", "Member", "Trial",
                             "Student"); Admin Payments table column headers
                             ("Reference / Payment ID", "Amount · Date")
─────────────────────────────────────────────────────────────────────────────────────
```

### Day Badge (special treatment of --fs-badge)
```
Text:           --fs-badge (11px)
Weight:         600
Transform:      uppercase
Letter-spacing: 0.08em
Colour:         --color-primary (#2196F3)
Usage:          Day name above date on session LIST CARDS only
                ("SUNDAY", "TUESDAY", "THURSDAY")
                Session detail uses a plain heading — see Session Detail spec.
```

### Colour rules for amounts
```
Positive / credit amounts:  --color-success (#4CAF50)   same size token as context
Negative / debt amounts:    --color-warning-text (#F5C518)  same size token as context
Neutral amounts:            --color-text-primary (#fff)
```

---

## 3. Spacing & Layout

```
Page padding (horizontal):  16px
Page padding (top):         16px
Card internal padding:      16px
Card gap (between cards):   12px
Section gap:                24px
Bottom nav height:          64px — page content must never sit behind the nav bar
```

---

## 4. Border Radius

```
--radius-sm:     8px     Status badge pills
--radius-md:     12px    Input fields, warning banners, admin list cards
--radius-lg:     16px    Session cards (list view)
--radius-xl:     24px    Bottom sheet top corners
--radius-full:   9999px  All buttons (CTA and secondary), all chips
--radius-avatar: 50%     User avatar circles
```

---

## 5. Components

### Top Bar
```
Background:   --color-primary
Title:        --fs-header (17px/600), --color-text-primary, horizontally centred
Left slot:    back arrow OR hamburger — white icon, 24px
Right slot:   avatar circle OR action button — white
Height:       56px
```

### Bottom Navigation Bar
```
Background:         --color-bg-card
Top border:         1px --color-divider
Icon size:          20px
Active icon colour: --color-primary
Inactive icon:      --color-text-secondary
Labels:             none
Height:             64px
```

### Tab Bar (Admin Members / Payments / Sessions)
```
Container:      --color-bg-card, --radius-md, padding 4px
Active tab:     background #2A2A2A, --radius-md, text --color-text-primary
Inactive tab:   no background, text --color-text-secondary
Both:           --fs-content (14px/500), padding 8px 16px
```

### Session Card (list view)
```
Container:    --color-bg-card, --radius-lg
Image:        full width, 180px height, radius on top corners only
Day badge:    --fs-badge (11px/600/uppercase/0.08em), --color-primary
Date/time:    --fs-content (14px/400), --color-text-primary
Location·count: --fs-meta (13px/400), --color-text-secondary
Card padding: 16px (below image)
```

### Session Detail (header area)
The session detail header uses a DIFFERENT treatment from the list card.
Do NOT use the uppercase badge style here.
```
Hero image:           full-bleed, 220px height
Day name heading:     --fs-primary (15px/500), --color-text-primary, normal case
                      e.g. "Sunday", "Tuesday" — NOT "SUNDAY"
Location:             --fs-meta (13px/400), --color-text-secondary  e.g. "CCAB"
"Training Time" label: --fs-meta (13px/400), --color-text-secondary
Date/time value:      --fs-content (14px/400), --color-text-primary
Content padding:      16px
```

### Session Detail (layout — full screen order)
```
1. Hero image (full bleed, 220px)
2. Day name + location + training time (as above)
3. Splits pill button — self-sized, secondary style, NOT full width
4. Warning banner (if applicable)
5. Sign up button — full width, primary
6. "Training Sign-ups" section header
7. List of sign-ups (avatar + name + activity)
8. Admin edit — pen/edit icon in the TOP BAR right slot, NOT a stack button
   Visible only to Admin/Helper roles
   No "close sign-ups" button on this screen
```

### Buttons
```
PRIMARY (Sign up, Submit, Confirm sign up, any affirmative CTA):
  Background:    --color-primary
  Text:          --fs-primary (15px/500), --color-text-primary
  Border-radius: --radius-full
  Width:         100% (full width of container)
  Height:        48px
  Border:        none

SECONDARY (Splits, Cancel, any neutral action):
  Background:    transparent
  Border:        1.5px solid --color-text-secondary
  Text:          --fs-primary (15px/500), --color-text-primary
  Border-radius: --radius-full
  Width:         100%
  Height:        48px

ADMIN ACTION (Admin: edit session, Admin: close sign-ups):
  Same dimensions as Secondary
  Background and border colour: own treatment (dark red / destructive style)
  Text:          --fs-primary (15px/500)

BUTTON SPACING — critical:
  Gap between consecutive stacked buttons: 8px
  Buttons must never touch or overlap
  Gap before a new logical group of buttons (e.g. before admin buttons): 16px
  Example stack order:
    [Sign up]           ← primary, full width
    8px gap
    [Splits]            ← secondary
    16px gap
    [Admin: edit]       ← admin group starts
    8px gap
    [Admin: close]
```

### Chips — unified style (activity chips and filter chips use identical visual pattern)
```
INACTIVE:
  Background:    --color-bg-card (#1E1E1E)
  Border:        1.5px solid --color-text-secondary
  Text:          --fs-content (14px/400), --color-text-primary
  Border-radius: --radius-full
  Padding:       6px 14px

ACTIVE / SELECTED:
  Background:    --color-primary (#2196F3)
  Border:        1.5px solid --color-primary
  Text:          --fs-content (14px/500), --color-text-primary (white)
  Border-radius: --radius-full
  Padding:       6px 14px

Note: activity chips may display a price on a second line inside the chip.
  Price line: --fs-meta (13px/400), white when active, --color-text-secondary when inactive
```

### Filter Chips (Admin — membership status filters)
```
Same visual spec as Chips above.
Font for label+count: --fs-content (14px/400) inactive, --fs-content (14px/500) active
```

### Status Badge (Admin member list)
```
Background:  --color-bg-card (dark pill)
Text:        --fs-badge (11px/500), --color-text-secondary
Padding:     3px 10px
Border-radius: --radius-full
Special — "Member": background #1B5E20 (dark green), text --color-text-primary
```

### Warning / Info Banner
```
Background:    --color-warning-bg (#3D3500)
Text:          --fs-meta (13px/400), --color-warning-text (#F5C518)
Border-radius: --radius-md
Padding:       16px
Border:        none
Icon:          none
```

### Form — Horizontal Label/Value Row (sign-up form, user info)
```
Label (left):  --fs-content (14px/400), --color-text-secondary
Value (right): --fs-content (14px/400), --color-text-primary
Divider:       1px --color-divider below each row
Row height:    48px minimum
Note: input fields remain --fs-body (16px) for typing comfort — this spec
      applies to read-only display rows only (Name, Email, Status, etc.)
```

### Form — Stacked Label/Value (Payments card style)
```
Label (above): --fs-meta (13px/400), --color-text-secondary
Value (below): --fs-content (14px/400), --color-text-primary
Gap within pair: 2px
Gap between pairs: 16px
Section header (e.g. "How to pay via PayNow"): --fs-primary (15px/500), --color-text-primary
```

### Payment / Fee List Row
ALL numerical values in the fee list use the same token — no exceptions.
```
Date:            --fs-content (14px/400), --color-text-primary
Detail:          --fs-meta (13px/400), --color-text-secondary  (e.g. "MGS · Regular Training")
Amount (row):    --fs-content (14px/400), --color-text-primary
Amount (total):  --fs-content (14px/400), --color-text-primary  ← same as row, NOT larger
"Total" label:   --fs-content (14px/500), --color-text-primary  ← medium weight only
Received (green):--fs-content (14px/400), --color-success
Divider:         1px --color-divider between rows

Top-level credit/debt only (e.g. "Credit: $10.50"):
  --fs-primary (15px/500), --color-success or --color-warning-text
  This is the ONLY amount displayed larger than the rest
```

### Admin Member Card
```
Name:   --fs-primary (15px/500), --color-text-primary
Email:  --fs-meta (13px/400), --color-text-secondary
Badge:  see Status Badge spec above
```

### Admin Payments Table
```
Column headers:  --fs-badge (11px/400), --color-text-secondary
Row name:        --fs-content (14px/500), --color-text-primary
Row ID:          --fs-meta (13px/400), --color-text-secondary
Amount:          --fs-content (14px/500), --color-success
Date:            --fs-meta (13px/400), --color-text-secondary
```

### Input Field
```
Background:    --color-bg-input
Border:        1px solid --color-text-secondary
Border-focus:  1px solid --color-primary
Border-radius: --radius-md
Padding:       12px 16px
Text:          --fs-body (16px/400), --color-text-primary
Placeholder:   --fs-body (16px/400), --color-text-secondary
Label (above): --fs-body (16px/500), --color-text-primary
```

### Bottom Sheet / Modal
```
Background:    --color-bg-modal (#2A2A2A)
Top corners:   --radius-xl
Padding:       24px horizontal, 16px top
Close button:  circular 32px, --color-bg-card bg, × icon white, top-right
```

---

## 6. Screen Reference Table

| Screen            | Header    | Primary content     | Secondary content   | Buttons    |
|-------------------|-----------|---------------------|---------------------|------------|
| Sessions list     | fs-header | fs-content (date)   | fs-meta (location)  | —          |
| Session detail    | fs-header | fs-content (date)   | fs-meta (location)  | fs-primary |
| Sign up form      | fs-header | fs-content (rows)   | fs-meta (labels)    | fs-primary |
| Payments          | fs-header | fs-content (values) | fs-meta (labels)    | —          |
| Admin — Members   | fs-header | fs-primary (names)  | fs-meta (emails)    | —          |
| Admin — Payments  | fs-header | fs-content (names)  | fs-meta (IDs/dates) | —          |
| Admin — Sessions  | fs-header | fs-content          | fs-meta             | fs-primary |
| Membership        | fs-header | fs-body             | fs-meta             | fs-primary |
| Home              | fs-header | fs-body             | fs-meta             | fs-primary |

---

## 7. Global Rules

1. Use only the 6 size tokens above — no hardcoded px values in components
2. Maximum font weight anywhere in the app: 600
3. Dark backgrounds only — no white or light surfaces
4. No drop shadows — use layered dark backgrounds for depth
5. Grey (#888) and white (#fff) text at the same semantic level always use the same size token
6. Buttons in a vertical stack must have 8px gap minimum — they must never touch
7. This design system applies to every file without exception
