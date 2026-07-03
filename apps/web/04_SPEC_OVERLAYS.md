# Mondeto — Screen Spec: Overlays
# Feed to: Agent C (drawers, panels, buy flow)
# Depends on: 01_DESIGN_TOKENS.md, 02_SPEC_MAP_HEATMAP.md

---

## Overview of Overlay States

All overlays live on top of the Map screen.
All use a dim layer beneath them: `rgba(45,37,32,0.28)` covering the full screen (z-index 20).
Overlays sit at z-index 30.
Tapping the dim layer dismisses the overlay (except during active tx).

```
State A: Zoomed in, painting           → no overlay, just paint mode
State B: Selection made, drawer closed → floating "X selected" hint only
State C: Selection drawer open         → bottom sheet slides up
State D: Tx in progress                → same drawer, step progress shown
State E: Tx success                    → success state in drawer
State F: Tap owned pixel               → pixel info panel slides up
```

---

## A — Paint Mode (no overlay)

See 02_SPEC_MAP_HEATMAP.md for paint mode banner and zoom badge.

Top right of top bar shows live counter: "7 selected" in 7px, color #a09080.
No drawer yet — drawer only appears when user lifts finger AND selection > 0.

> ⚠️ OPEN QUESTION: Should the drawer auto-open after painting stops,
> or should user tap a "review selection" button?
> Recommendation: auto-open after 800ms of no pointer activity if selection > 0.
> Feels like a natural pause — user finished painting, app responds.

---

## B — Selection Hint (drawer closed)

When selection > 0 but drawer is dismissed:
- Small floating pill, position absolute, top 80px, left 14px
- Background: `rgba(45,37,32,0.65)` + blur(6px)
- Text: "7 selected — tap to review"
- Font: 7px, color #faf7f2, letter-spacing 0.5px
- Tapping it reopens the drawer
- Persists until selection is cleared

---

## C — Selection Drawer (open, pre-purchase)

### Slide-up Animation
```css
transform: translateY(100%);  /* hidden */
transform: translateY(0);     /* shown */
transition: transform 300ms cubic-bezier(0.32, 0.72, 0, 1);
```

### Drawer Structure
```
┌─── drag handle (centered, 32×3px) ──────────────┐
│                                                   │
│  SELECTED          TOTAL COST     [ ✕ clear ]    │
│  8 pixels          0.22 USDT                     │
├───────────────────────────────────────────────────┤
│  BREAKDOWN                                        │
│  ░░░ unowned      3 px    0.03 USDT              │  ← dashed border dot
│  ██  Nike         2 px    0.12 USDT              │  ← colored dot
│  ██  ETHGlobal    1 px    0.04 USDT              │
│  ██  0x88f...a01  1 px    0.03 USDT              │
├───────────────────────────────────────────────────┤
│  YOUR PROFILE                                     │
│  [  NAME  ][  Nova              ]                 │
│  [  URL   ][  https://...      ]                  │
│  COLOR  ●●●●●●●●●●                               │
├───────────────────────────────────────────────────┤
│  [ BUY ALL — 0.22 USDT ]                          │
└───────────────────────────────────────────────────┘
[   bottom nav shows through frosted glass below   ]
```

### Drag Handle
- Width 32px, height 3px, border-radius 2px, background #c0b8ae
- Margin: 10px auto 0, centered

### Summary Header
- Padding: 8px 14px, border-bottom 0.5px solid #f0ebe3
- Left block:
  - "SELECTED" label — 6px, #a09080, letter-spacing 1px
  - "8 pixels" value — 13px, weight 500, color #2d2520
- Right block (text-align right):
  - "TOTAL COST" label — same style
  - "0.22 USDT" value — same style
- Clear button (far right):
  - "✕ clear" — 7px, color #a09080
  - Border 0.5px solid #e0d8ce, border-radius 8px, padding 4px 8px

### Breakdown Section
- Padding: 6px 14px 0
- Section label "BREAKDOWN": 6px, #a09080, letter-spacing 1px, margin-bottom 5px
- Each row: flex, align-items center, gap 7px, padding 5px 0
- Border-bottom 0.5px solid #f5f0e8 (except last row)
- Unowned row:
  - Dot: 12×12px, border-radius 3px, border 0.5px dashed #c0b8ae
  - Name: "unowned", 8px, color #a09080
- Owned row:
  - Dot: 12×12px, border-radius 3px, background = owner's color
  - Name: 8px mono, color #2d2520 (label if exists, else "0xabc...d3f")
  - Sub (address if label shown): 6px, color #a09080
  - Pixel count: 7px, color #a09080, e.g. "2 px"
  - Price: 8px mono, color #2d2520, font-weight 500

### Your Profile Section
- Padding: 8px 14px 0, border-top 0.5px solid #f0ebe3
- Section label "YOUR PROFILE"
- Mini fields (compact version of profile fields):
  - Background #f5f1ea, border 0.5px solid #e0d8ce, border-radius 7px, padding 5px 8px
  - Label: 6px, color #a09080, letter-spacing 1px
  - Input: 9px mono, color #2d2520, bg transparent, border none
- Color strip: 7 preset swatches, 18×18px each, border-radius 4px
  - Selected swatch: outline 2px solid #2d2520, outline-offset 1px
  - Swatches: #e74c3c #e67e22 #f1c40f #2ecc71 #1abc9c #3498db #9b59b6

> ⚠️ OPEN QUESTION: Profile fields in drawer — should they pre-fill from saved profile?
> Recommendation: YES — if user has already saved profile, pre-fill name/url/color.
> Only show fields if wallet is connected. If not connected, skip profile section
> and just show the buy button (profile gets set to defaults).

### Buy Button
- Margin: 8px 14px 0
- Background: #2d2520, color: #faf7f2
- Border-radius: 11px, padding: 10px, text-align center
- Font: 9px mono, letter-spacing 1.5px
- Text: `[ BUY ALL — 0.22 USDT ]` (total updates dynamically)

> ⚠️ OPEN QUESTION: What if user selects pixels but has insufficient USDT balance?
> Show balance below the breakdown: "balance: 0.05 USDT"
> Disable buy button + show error: "insufficient balance"
> Recommendation: check balance via USDT.balanceOf before allowing buy.

---

## D — Transaction In Progress

Replace drawer body (keep header with pixel count/cost):

### Step Progress
Three steps, flex column, gap 8px, padding 14px:

```
✓  USDT approved          ← done: circle filled #2d6a4f, white check
⟳  buying land...         ← active: spinning border circle, dark color
○  confirmed              ← pending: empty circle, color #c0b8ae
```

Done step:
- Circle: 16px, border-radius 50%, background #2d6a4f, "✓" 9px white
- Label: 8px, color #2d6a4f, letter-spacing 0.5px

Active step:
- Circle: 16px, border-radius 50%, border 1.5px solid #2d2520, border-top-color transparent
- CSS animation: `spin 0.8s linear infinite`
- Label: 8px, color #2d2520, letter-spacing 0.5px

Pending step:
- Circle: 16px, border-radius 50%, border 1.5px solid #e0d8ce
- Label: 8px, color #c0b8ae

### Button During Processing
```
[ PROCESSING... ]
```
Background: #6a5f54 (muted), same dimensions
Disabled: pointer-events none

### Step Sequence
```
Step 1: Check USDT allowance
  → If allowance < total: show "approving USDT..." as active step
  → If allowance sufficient: mark step 1 done immediately, go to step 2

Step 2: Send buyPixels() tx
  → "buying land..." as active step

Step 3: Wait for tx confirmation
  → "confirmed" as active step briefly, then success state
```

> ⚠️ OPEN QUESTION: In MiniPay, wallet confirmation happens in the MiniPay UI overlay.
> The user will see the MiniPay approval sheet before the tx fires.
> Our step 1 (approve) triggers MiniPay sheet → user confirms → then step 2 triggers
> another MiniPay sheet → user confirms again.
> Two wallet popups is not ideal UX. Consider: use permit2 or pre-approve for larger amount.
> Hackathon recommendation: accept the two-step UX, explain it with step labels.

---

## E — Transaction Success

Replace drawer body entirely:

```
┌──────────────────────────────────┐
│  ✓  (large green circle)         │
│  LAND CLAIMED                    │
│  8 pixels now yours              │
│                                  │
│  ┌─────────────────────────────┐ │
│  │ PAID       0.22 USDT        │ │
│  │ TX         0xbf3...a12 →    │ │
│  └─────────────────────────────┘ │
│                                  │
│  [ DONE ]                        │
└──────────────────────────────────┘
```

### Success Icon
- Circle: 44px, border-radius 50%, background #2d6a4f
- "✓" — 20px, white, centered
- Margin: 0 auto 10px

### Success Text
- "LAND CLAIMED" — 11px, weight 500, color #2d2520, letter-spacing 1px
- "8 pixels now yours" — 8px, color #a09080, margin-top 4px
- Text-align center

### Receipt Card
- Background #f5f1ea, border 0.5px solid #e0d8ce, border-radius 10px, padding 10px 12px
- Margin: 0 14px
- Two rows: PAID and TX
- Each row: flex, justify-content space-between
- Label: 7px, #a09080, letter-spacing 1px
- Value: 9px, color #2d2520 (USDT amount) / color #4a7fa5 (tx hash as link)

### Done Button
```
[ DONE ]
```
- Background #2d6a4f, same dimensions as buy button
- On click: dismiss drawer, clear selection, pixels on canvas update to owner color

### Map Update on Success
On success, update canvas immediately (optimistic):
- Remove yellow selection highlights
- Paint the bought pixels with user's chosen color
- No page reload needed

---

## F — Pixel Info Panel (tap owned pixel)

Triggered by: tapping an owned pixel in pan mode (scale < 4)
OR: tapping "BUY THIS PIXEL" from pixel info leads to single-pixel buy flow

### Trigger Distinction
- Scale < 4 (pan mode): single tap → pixel info panel
- Scale >= 4 (paint mode): single tap → adds/removes pixel from selection

> ⚠️ OPEN QUESTION: In paint mode, how does user see info about a pixel they're hovering?
> Recommendation: long-press (500ms hold) in paint mode → show info panel.
> Normal tap/drag = paint. Long-press = inspect.

### Panel Structure
```
┌─── drag handle ────────────────────────────────┐
│  [ avatar ]  Owner Name          OWNER SINCE   │
│              0xabc...d3f         Mar 2026       │
├────────────────────────────────────────────────┤
│  LABEL                                          │
│  Just Do It                                     │
├────────────────────────────────────────────────┤
│  URL                                            │
│  nike.com →                                     │
├────────────────────────────────────────────────┤
│  [ BUY PRICE ]  [ PREV SALE ]  [ SOLD ]        │
│  [ 0.04 USDT ]  [ 0.02 USDT ]  [ 3×   ]        │
├────────────────────────────────────────────────┤
│  [ BUY THIS PIXEL ]                             │
│  previous owner gets 0.04 USDT instantly        │
└────────────────────────────────────────────────┘
```

### Owner Row
- Padding: 8px 14px 10px, border-bottom 0.5px solid #f0ebe3
- Avatar: 40×40px, border-radius 11px, background = owner color, initial letter
- Name: 11px, weight 500, color #2d2520
- Address: 7px, color #a09080, letter-spacing 0.5px
- "OWNER SINCE" label + date: right-aligned, 6px label / 8px value

> ⚠️ OPEN QUESTION: "Owner since" date — not stored in PixelData struct.
> Would need to be derived from block timestamp of last PixelsPurchased event.
> For hackathon: omit or show "recent" if indexing events is not ready.
> Recommendation: skip for now, replace with "sale #N" (saleCount field is available).

### Label Field
- Padding: 7px 14px, border-bottom 0.5px solid #f0ebe3
- Label: "LABEL", 6px, #a09080, letter-spacing 1px
- Value: 9px mono, color #2d2520
- If no label: show "—"

### URL Field
- Same padding/border
- Value: 9px, color #4a7fa5
- Append " →" — tapping opens URL in new tab

### Price Cards Row
- Padding: 8px 14px, flex row, gap 8px
- Three equal cards: background #f5f1ea, border 0.5px solid #e0d8ce, border-radius 8px, padding 6px 8px
- Card label: 6px, #a09080, letter-spacing 1px, margin-bottom 2px
- Card value: 12px, weight 500, color #2d2520
- Card sub: 6px, color #a09080, margin-top 1px
- Cards:
  - BUY PRICE: `currentPrice` formatted as USDT
  - PREV SALE: `currentPrice / 2` (the previous owner paid half of current)
  - SOLD: `saleCount` formatted as "3×"

### Buy Button
- Margin: 2px 14px 0
- `[ BUY THIS PIXEL ]` — same style as main buy button
- On click: pre-fill selection with this one pixel ID, open selection drawer

### Note Below Button
- Text: "previous owner gets {price} USDT instantly"
- Font: 7px, color #a09080, text-align center, margin-top 5px
- Price = currentPrice (what buyer pays = what seller receives)

### Selected Pixel Ring
When pixel info panel is open, the tapped pixel shows a white ring on the canvas:
```ts
// Draw ring around tapped pixel
ctx.strokeStyle = '#ffffff'
ctx.lineWidth = 0.2  // in canvas coords
ctx.strokeRect(x + 0.05, y + 0.05, 0.9, 0.9)
```
