# Mondeto — Screen Spec: Leaderboard + Profile
# Feed to: Agent B (leaderboard, profile, routing)
# Depends on: 01_DESIGN_TOKENS.md

---

## Routing

```
/          → Map (default)
/ranks     → Leaderboard
/profile   → Profile
```

Bottom nav controls routing via Next.js `useRouter` or `Link`.
All routes share the same bottom nav component.
Map route is the only full-screen canvas view — others are standard scroll views.

> Next.js pages (/ranks, /profile) for proper URL sharing + back button.
> Map stays at / as root.

---

## Leaderboard Screen — /ranks

### Layout
```
┌─────────────────────────┐
│ status bar (22px)        │
├─────────────────────────┤
│ header (42px)            │  LEADERBOARD
├─────────────────────────┤
│ tab bar (30px)           │  AREA | EMPIRE | HOT_PX
├─────────────────────────┤
│                          │
│  scrollable list         │  flex: 1, overflow-y: auto
│                          │
├─────────────────────────┤
│ bottom nav (56px) FROSTED│
└─────────────────────────┘
```

### Header
- Height: 42px, background #faf7f2
- Border bottom: `0.5px solid #e0d8ce`
- Text: "LEADERBOARD" — 10px, weight 500, letter-spacing 2px, color #2d2520
- Padding: 0 14px

### Tab Bar
```
Tabs:   AREA  |  EMPIRE  |  HOT_PX
```
- Height: 30px, background #faf7f2
- Border bottom: `0.5px solid #e0d8ce`
- Each tab: flex 1, text-align center, 7px mono, letter-spacing 0.3px
- Inactive: color #a09080, border-bottom 2px solid transparent
- Active: color #2d2520, border-bottom 2px solid #2d2520

Tab content:
```
AREA    → sorted by total pixels owned (descending)
EMPIRE  → sorted by largest contiguous pixel territory (BFS result)
HOT_PX  → sorted by most expensive single pixel owned (max currentPrice per owner)
```

> HOT_PX shows most expensive pixel currently owned (live price, not historical).
> EMPIRE BFS on client for 45k nodes = ~50ms, acceptable.
> Cache result in a ref, invalidate after purchases.

### Leaderboard Row
```
[ rank ]  [ color dot ]  [ name ]  ............  [ value ]
```
- Container: flex, align-items center, gap 7px
- Background: #faf7f2, border 0.5px solid #e0d8ce, border-radius 9px
- Padding: 7px 10px, margin: 3px 7px
- Rank: 9px mono, weight 500, width 14px
  - 1st: color #c9962a (gold)
  - 2nd: color #8a9aaa (silver)
  - 3rd: color #a07050 (bronze)
  - 4+: color #a09080
- Color dot: 13×13px, border-radius 3px, owner's hex color
- Name: 8px mono, color #2d2520, flex 1
  - If owner has label → show label
  - If no label → show truncated address: "0xabc...d3f"
- Value:
  - AREA tab: "2,410 px"
  - EMPIRE tab: "1,200 px"
  - HOT_PX tab: "4.00 USDT"
  - Font: 8px mono, color #6a5f54

### Rank List Body
- Background: #f5f1ea (slightly darker than rows)
- Padding: 5px 0
- Overflow-y: auto
- Show top 20 initially. "Show more" button loads next 20.

### Empty State (no pixels bought yet)
```
[ globe outline icon ]
"no claims yet"
"be the first to own the world"
```
- Centered, muted text, 8px mono, color #a09080

---

## Profile Screen — /profile

### Layout
```
┌─────────────────────────┐
│ status bar (22px)        │
├─────────────────────────┤
│ header (42px)            │  PROFILE
├─────────────────────────┤
│  avatar (centered)       │
│  stats row               │
│  name field              │
│  url field               │
│  color picker            │
│  [ SAVE ] button         │
├─────────────────────────┤
│ bottom nav (56px) FROSTED│
└─────────────────────────┘
```

### Header
- Same pattern as leaderboard: "PROFILE", 10px, weight 500, letter-spacing 2px
- Background #faf7f2, border-bottom 0.5px solid #e0d8ce, height 42px, padding 0 14px

### Avatar
- 54×54px square, border-radius 14px
- Background color = owner's chosen color
- Content = first letter of their name, uppercase, 22px, white, weight 500
- If no name set: show "?" in #a09080
- Centered horizontally, margin: 12px auto 8px

> Profile page accessible without wallet. Show "connect wallet to save profile"
> below save button. Fields still editable locally.

### Stats Row
Three cards in a row, equal width, gap 5px, margin 0 10px 8px:
```
[ 342     ]  [ 12.4    ]  [ #8      ]
[ PIXELS  ]  [ USDT    ]  [ RANK    ]
```
- Card: background #faf7f2, border 0.5px solid #e0d8ce, border-radius 8px, padding 5px 3px, text-align center
- Number: 12px, weight 500, color #2d2520
- Label: 6px, color #a09080, letter-spacing 0.5px, margin-top 1px
- USDT = current market value of owned pixels (not spent)

### Name Field
```
[  NAME              ]
[  Nova              ]
```
- Container: background #faf7f2, border 0.5px solid #e0d8ce, border-radius 8px, padding 6px 9px
- Label: 6px, #a09080, letter-spacing 1px, text-transform uppercase, margin-bottom 2px
- Input: 9px mono, color #2d2520, background transparent, border none, width 100%
- Placeholder: "enter name...", color #c0b8ae
- Max length: 32 characters

### URL Field
```
[  URL               ]
[  https://celo.org  ]
```
- Same container style as Name field
- Input type="url" for mobile keyboard optimization
- Value shown in link color #4a7fa5 when filled
- Placeholder: "https://...", color #c0b8ae
- Warn but don't block if URL seems malformed

### Color Picker
```
[  COLOR             ]
[  🎨 wheel  | preview bar  ]
[            | #e74c3c      ]
```
- Container: same card style (background #faf7f2, border, border-radius 8px)
- Label: "COLOR", same label style
- Inner row: flex, gap 8px, align-items center
  - Left: color wheel — `<input type="color">` styled as circle
    - width 36px, height 36px, border-radius 50%
    - appearance: none, border: 2px solid #e0d8ce
  - Right column:
    - Preview bar: full width, height 18px, border-radius 5px, background = chosen color
    - Hex input: 8px mono, background #f5f1ea, border 0.5px solid #e0d8ce, border-radius 4px, padding 3px 6px
    - Bidirectional sync with color wheel

### Save Button
```
[ SAVE ]
```
- Full width minus 10px each side (margin: 6px 10px)
- Background: #2d2520, color: #faf7f2
- Border-radius: 10px, padding: 9px
- Font: 8px mono, letter-spacing 1.5px, text-align center
- Text: `[ SAVE ]`
- On click:
  1. Validate name (non-empty) and URL (format check)
  2. Call `updateProfile(hexToUint24(color), name, url)` from mock.ts
  3. Loading state: `[ SAVING... ]`, button disabled, bg #6a5f54
  4. Success: `[ SAVED ✓ ]` for 1.5s, then back to `[ SAVE ]`
  5. Update local state — avatar color + initial updates immediately

### Unconnected State
- All fields editable (local state)
- Below save button, if wallet not connected:
  ```
  connect wallet to save on-chain
  ```
  - 7px, color #a09080, text-align center, margin-top 6px
- Save button still present but triggers wallet connect flow first
