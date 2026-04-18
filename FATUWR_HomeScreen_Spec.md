# Home Screen — Spec & Claude Code Prompt
> Part of FATUWR Training Portal design docs. See also: FATUWR_DesignSystem.md
> Updated: 2026-04-16

---

## Decisions Log
- Announcements: migrate from Google Sheet → proper DB table
- Admin + Helper roles can create, edit, delete, and reorder announcements
- Training Sign-ups tab navigates to the sessions list (browse → tap → sign up)
- Hamburger menu removed entirely; replaced by "More" tab in bottom nav

---

## Screen Layout (top to bottom)

### 1. Header
- Background: `--color-primary` (#2196F3)
- No hamburger menu (removed)
- **"Home"** — page title, large bold white, left-aligned
- **+ button** — top right, circular white button with blue +
- Visible to: Admin and Helper roles (`clubRole === "Admin" || clubRole === "Helper"`)

### 2. Quick Shortcuts Row
- Label: **"Quick Actions"** — `--fs-meta (13px/500)`, `--color-text-secondary`, left-aligned, 16px padding
- Horizontal row of 4 circular shortcuts, equal spacing

| Shortcut | Icon (lucide) | Label | Destination |
|---|---|---|---|
| Sign up for training | `CalendarPlus` | "Sign Up" | Training sessions list |
| Payments | `CircleDollarSign` | "Payments" | Payments tab |
| Guide for Newbies | `BookOpen` | "New to Club?" | /newbie |
| Fun Resources | `Sparkles` | "Fun Stuff" | /fun-resources |

**Shortcut circle spec:**
- Size: 56px diameter
- Background: `--color-bg-card`
- Icon: 24px, `--color-primary`
- Label: `--fs-meta (13px/400)`, `--color-text-secondary`, centred below, 4px gap

### 3. Announcements Feed
- Section header: **"Announcements"** — `--fs-primary (15px/500)`, `--color-text-primary`, left-aligned
- **"See all"** — `--fs-primary (15px/500)`, `--color-primary`, right-aligned
- "See all" navigates to /announcements (full list)
- Show the **5 most recent announcements** ordered by `position` (admin-controlled order)
- Card style:
  - Background: `--color-bg-card`, `--radius-lg`
  - Image: full-width, ~200px height, rounded top corners
  - Title text below image: `--fs-primary (15px/500)`, `--color-text-primary`, 12px padding
  - Title is optional — image-only cards are valid (no empty space if no title)
  - Gap between cards: 12px

---

## Bottom Navigation Bar

5 tabs replacing the current 4.

| Position | Tab | Icon (lucide) | Visible to |
|---|---|---|---|
| 1 | Home | `Home` | All |
| 2 | Training | `CalendarPlus` | All |
| 3 | Payments | `CircleDollarSign` | All |
| 4 | More | `MoreHorizontal` | All |
| 5 | Admin | `ShieldCheck` | `clubRole === "Admin"` only |

**"More" bottom sheet:**
Tapping More opens a dark bottom sheet (same modal style as sign-up sheet) with three rows:

- Membership — `CreditCard` icon
- Fun Resources — `Sparkles` icon
- New to the Club? — `BookOpen` icon

Each row: icon left (`--color-primary`, 20px) + label (`--fs-body (16px/400)`, `--color-text-primary`) + chevron right (`--color-text-secondary`). 1px `--color-divider` between rows.

---

## Announcements — Data & Backend

### DB Migration (from Google Sheet)
Create a new `announcements` table in `drizzle/schema.ts`:

```
announcements
  id           — int, auto-increment PK
  title        — varchar(255), nullable (image-only posts allowed)
  imageUrl     — varchar(500), nullable
  position     — int, not null (controls display order; lower = shown first)
  createdAt    — timestamp, default now()
  updatedAt    — timestamp, default now() on update
  createdBy    — varchar(255) (email of creator)
```

Run `pnpm db:push` to apply.

One-time migration: read existing announcements from the Google Sheet and insert into DB. Can be done manually or via a migration script.

### tRPC Routes (add to server/routers.ts)

```
announcements.list        — public, returns all ordered by position asc
announcements.create      — protected: Admin or Helper only
                            params: { title?, imageUrl? }
                            auto-assigns position = max(position) + 1
announcements.update      — protected: Admin or Helper only
                            params: { id, title?, imageUrl? }
announcements.delete      — protected: Admin or Helper only
                            params: { id }
announcements.reorder     — protected: Admin or Helper only
                            params: { orderedIds: number[] }
                            updates position field for each id based on array index
```

### Announcement Management UI (Admin + Helper)

Accessible via the + button on Home header and from the full /announcements page.

**Create / Edit sheet:**
- Bottom sheet modal (same dark style)
- Fields: Title (text input, optional) + Image URL (text input, optional)
- Submit button: "Post" (create) or "Save" (edit)
- Validation: at least one of title or imageUrl must be provided

**Reorder:**
- On /announcements full page, Admin/Helper see a "Reorder" button in the header
- Tapping "Reorder" switches the list to drag-to-reorder mode (each card gets a drag handle on the right — `GripVertical` lucide icon)
- A "Done" button saves the new order by calling `announcements.reorder` with the new id sequence
- Cards return to normal view after saving

**Delete:**
- Long-press on an announcement card (Admin/Helper only) shows a confirmation alert before deleting
- Or: an edit sheet has a red "Delete" button at the bottom

---

## New Stub Pages

**Fun Resources** (`/fun-resources`)
- Blue header, title "Fun Resources", no hamburger
- Body: placeholder text "Coming soon — fun stuff from the club 🐟"

**New to the Club?** (`/newbie`)
- Blue header, title "New to the Club?", no hamburger
- Body: placeholder text "Welcome! A guide is coming soon."

Both use `--color-bg-base` background and standard page padding.

---

## Claude Code Prompt

```
Read FATUWR_DesignSystem.md and FATUWR_HomeScreen_Spec.md before writing any code.

This task has four parts. Complete them in order.

─── PART 1: ANNOUNCEMENTS DB & BACKEND ──────────────────────────

In drizzle/schema.ts, add an announcements table:
  id         int auto-increment PK
  title      varchar(255) nullable
  imageUrl   varchar(500) nullable
  position   int not null
  createdAt  timestamp default now()
  updatedAt  timestamp default now()
  createdBy  varchar(255)

Run: pnpm db:push

In server/routers.ts, add these tRPC routes under an "announcements" namespace:
  announcements.list    — public, returns rows ordered by position ASC
  announcements.create  — protected (Admin or Helper), params: { title?, imageUrl? }
                          sets position = current max + 1
  announcements.update  — protected (Admin or Helper), params: { id, title?, imageUrl? }
  announcements.delete  — protected (Admin or Helper), params: { id }
  announcements.reorder — protected (Admin or Helper), params: { orderedIds: number[] }
                          updates position of each row by its index in the array

Role check helper: user.clubRole === "Admin" || user.clubRole === "Helper"

─── PART 2: BOTTOM NAV BAR ──────────────────────────────────────

Find the bottom navigation component and update it to 5 tabs:

  1. Home          lucide Home icon         always visible
  2. Training      lucide CalendarPlus      always visible → sessions list
  3. Payments      lucide CircleDollarSign  always visible
  4. More          lucide MoreHorizontal    always visible → opens bottom sheet
  5. Admin         lucide ShieldCheck       only if user.clubRole === "Admin"

Remove the existing Announcements (megaphone) tab entirely.

"More" opens a dark bottom sheet (same style as sign-up modal) with three rows:
  - Membership   (CreditCard icon)  → /membership
  - Fun Resources (Sparkles icon)   → /fun-resources
  - New to the Club? (BookOpen icon) → /newbie

Row style: left icon (--color-primary, 20px) + label (--fs-body 16px/400, --color-text-primary)
+ right chevron (--color-text-secondary).
1px --color-divider between rows. Close on backdrop tap or swipe down.

─── PART 3: HOME SCREEN ─────────────────────────────────────────

Create client/src/pages/Home.tsx.

Layout (scrollable):

1. Top bar (--color-primary background, 56px height)
   - Title "Home": --fs-header (17px/600), --color-text-primary, left-aligned
   - No hamburger icon
   - Circular + button top-right (white bg, --color-primary +, 32px diameter)
   - Only render + if user.clubRole === "Admin" || user.clubRole === "Helper"
   - Tapping + opens the Create Announcement bottom sheet

2. Quick Actions row (16px horizontal padding)
   - "Quick Actions" label: --fs-meta (13px/500), --color-text-secondary
   - 4 x 56px circles equally spaced, --color-bg-card background, --color-primary icons
   - CalendarPlus  → training sessions list    label "Sign Up"
   - CircleDollarSign → payments               label "Payments"
   - BookOpen      → /newbie                   label "New to Club?"
   - Sparkles      → /fun-resources            label "Fun Stuff"
   - Label below each circle: --fs-meta (13px/400), --color-text-secondary, 4px gap

3. Announcements section (16px horizontal padding)
   - Row: "Announcements" --fs-primary (15px/500) --color-text-primary left
          "See all" --fs-primary (15px/500) --color-primary right → /announcements
   - Fetch via announcements.list, show first 5 (already ordered by position)
   - Card: --color-bg-card, --radius-lg, full-width image ~200px tall (rounded top corners),
     optional title below image: --fs-primary (15px/500), --color-text-primary, 12px padding
   - 12px gap between cards

─── PART 4: ANNOUNCEMENT MANAGEMENT UI ──────────────────────────

Create/Edit bottom sheet (used on both Home and /announcements):
  - Title input (optional)
  - Image URL input (optional)
  - Validation: at least one field must be filled
  - Submit calls announcements.create or announcements.update

Full announcements page (/announcements):
  - Blue header, title "Announcements", + button for Admin/Helper
  - Shows ALL announcements ordered by position
  - Admin/Helper: "Reorder" button in header
  - Reorder mode: cards show GripVertical drag handle on right, "Done" saves
    new order by calling announcements.reorder with new orderedIds array
  - Long-press on card (Admin/Helper): confirmation dialog → announcements.delete

─── STUB PAGES ──────────────────────────────────────────────────

client/src/pages/FunResources.tsx — blue header "Fun Resources", dark bg,
  body text "Coming soon — fun stuff from the club 🐟"

client/src/pages/NewToClub.tsx — blue header "New to the Club?", dark bg,
  body text "Welcome! A guide is coming soon."

─── ROUTING ─────────────────────────────────────────────────────

  /                → Home (default post-login route)
  /announcements   → full announcements page
  /fun-resources   → FunResources
  /newbie          → NewToClub

─── STYLE ───────────────────────────────────────────────────────

All styling follows FATUWR_DesignSystem.md without exception.
Use design system tokens (--color-bg-base, --color-bg-card, --color-primary,
--color-text-primary, --color-text-secondary, --radius-lg, etc.) — no hardcoded
hex values or px sizes in components. Typography must use the 6 token sizes only.

─── DONE ────────────────────────────────────────────────────────

When all four parts are complete:
  git add .
  git commit -m "feat: home screen, announcements DB, updated nav bar"
  git push
```
