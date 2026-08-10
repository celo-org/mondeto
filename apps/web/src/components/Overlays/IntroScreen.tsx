'use client'

import React, { useState, useEffect, useRef } from 'react'
import { track } from '@/lib/analytics'

// Five-slide onboarding carousel. Each slide tells one beat of the story
// (own → 2x → decay → rewards → paint) and pairs a short headline with a
// small CSS animation tuned to that beat. Tap right side / swipe to advance,
// tap left to go back. Final slide swaps the chevron for a START button.

type Slide = {
  key: string
  kicker: string
  headline?: string
  body: string
  tagline?: string
  visual: React.ReactNode
}

const WATERMARK = '/brand/watermark.svg'

function SlideTycoon() {
  return (
    <div className="mi-stage">
      <img src={WATERMARK} alt="" width={180} height={180} className="mi-watermark" />
      <div className="mi-coins" aria-hidden>
        <span className="mi-coin mi-coin-1">$</span>
        <span className="mi-coin mi-coin-2">$</span>
        <span className="mi-coin mi-coin-3">$</span>
        <span className="mi-coin mi-coin-4">$</span>
        <span className="mi-coin mi-coin-5">$</span>
      </div>
    </div>
  )
}

function SlideHold() {
  // Doubling sequence: a tag pops in, the big "x2" bounces, the next (doubled)
  // tag pops in, x2 bounces again, and so on up the diagonal. Tags accumulate
  // and stay, so the full $1 -> $2 -> $4 -> $8 run is readable at the peak
  // before it resets. The bouncing x2 in the middle drives the rhythm.
  return (
    <div className="mi-stage">
      <div className="mi-tag-stack">
        <div className="mi-tag mi-tag-1 font-display">$1</div>
        <div className="mi-tag mi-tag-2 font-display">$2</div>
        <div className="mi-tag mi-tag-3 font-display">$4</div>
        <div className="mi-tag mi-tag-4 font-display">$8</div>
      </div>
      <div className="mi-arrow font-display">x2</div>
    </div>
  )
}

function SlideHunt() {
  // Magnifier sweeps across a small pixel grid; a price tag underneath
  // ticks down to signal decay over time.
  return (
    <div className="mi-stage">
      <div className="mi-grid" aria-hidden>
        {Array.from({ length: 16 }).map((_, i) => (
          <span key={i} className={`mi-cell mi-cell-${i % 4}`} />
        ))}
      </div>
      <div className="mi-lens" aria-hidden>
        <span className="mi-lens-ring" />
        <span className="mi-lens-stem" />
      </div>
      <div className="mi-tag-decay font-display">
        <span className="mi-decay mi-decay-1">$5</span>
        <span className="mi-decay mi-decay-2">$4</span>
        <span className="mi-decay mi-decay-3">$3</span>
        <span className="mi-decay mi-decay-4">$2</span>
      </div>
    </div>
  )
}

function SlideRewards() {
  // Three growing bars + a chest that pops on a slow beat.
  return (
    <div className="mi-stage">
      <div className="mi-bars" aria-hidden>
        <span className="mi-bar mi-bar-1" />
        <span className="mi-bar mi-bar-2" />
        <span className="mi-bar mi-bar-3" />
      </div>
      <div className="mi-crown" aria-hidden>
        <span className="mi-crown-tip mi-crown-tip-1" />
        <span className="mi-crown-tip mi-crown-tip-2" />
        <span className="mi-crown-tip mi-crown-tip-3" />
        <span className="mi-crown-band" />
      </div>
    </div>
  )
}

function SlidePaint() {
  // 5x5 pixel grid that fills in colors in a wave, forming a smiley.
  // The pattern (1 = lit) draws a simple smile so the chaos beat reads as
  // playful rather than just random.
  const smiley = [
    0, 1, 0, 1, 0,
    0, 1, 0, 1, 0,
    0, 0, 0, 0, 0,
    1, 0, 0, 0, 1,
    0, 1, 1, 1, 0,
  ]
  return (
    <div className="mi-stage">
      <div className="mi-paint-grid" aria-hidden>
        {smiley.map((on, i) => (
          <span
            key={i}
            className={`mi-paint-cell ${on ? 'on' : ''}`}
            style={{ animationDelay: `${(i % 5) * 0.08 + Math.floor(i / 5) * 0.12}s` }}
          />
        ))}
      </div>
      <div className="mi-splatter" aria-hidden>
        <span className="mi-splat mi-splat-1" />
        <span className="mi-splat mi-splat-2" />
        <span className="mi-splat mi-splat-3" />
      </div>
    </div>
  )
}

// Exported for the copy regression guard in
// __tests__/components/Overlays/IntroScreen.test.tsx — the rewards slide's
// wording is support-critical, not cosmetic.
export const SLIDES: Slide[] = [
  {
    key: 'tycoon',
    kicker: 'BUY LAND. BECOME A TYCOON.',
    body: 'Grab pixels. Build a tiny empire. The whole map is up for grabs.',
    tagline: 'Own the world, one pixel at a time',
    visual: <SlideTycoon />,
  },
  {
    key: 'hold',
    kicker: 'HOLD YOUR GROUND',
    headline: 'PRICE x2 EVERY SALE',
    body: 'Buy early. Next buyer pays 2x.',
    visual: <SlideHold />,
  },
  {
    key: 'hunt',
    kicker: 'HUNT FOR DEALS',
    body: 'Land nobody touches gets cheaper by the hour. Watch the map. Play the long game.',
    visual: <SlideHunt />,
  },
  {
    key: 'rewards',
    kicker: 'TOP THE LEADERBOARD',
    // "When a campaign runs" and "get paid" are load-bearing: the old line said
    // "Claim daily rewards", and rewards are neither daily nor claimed. That
    // one sentence drove most of the "I wasn't paid" support volume.
    body: 'Biggest empire, most pixels, priciest plot. Pick your flex. When a campaign runs, top players get paid in USDT.',
    visual: <SlideRewards />,
  },
  {
    key: 'paint',
    kicker: 'OR JUST PAINT CHAOS',
    body: 'Zoom in, paint pixel by pixel. Draw something silly. Or wreck somebody’s masterpiece.',
    visual: <SlidePaint />,
  },
]

export default function IntroScreen({ inline = false }: { inline?: boolean } = {}) {
  const [visible, setVisible] = useState(inline)
  const [index, setIndex] = useState(0)
  const touchStartX = useRef<number | null>(null)

  useEffect(() => {
    // Inline mode (embedded in the FAQ) always shows and never persists —
    // it's a replayable showcase, not a one-time gate.
    if (inline) {
      setVisible(true)
      return
    }
    const seen = localStorage.getItem('mondeto-intro-seen')
    if (!seen) setVisible(true)
  }, [inline])

  if (!visible) return null

  const dismiss = () => {
    localStorage.setItem('mondeto-intro-seen', '1')
    track('intro_completed', { lastSlideIndex: index })
    setVisible(false)
  }

  const next = () => {
    if (index < SLIDES.length - 1) setIndex(index + 1)
    // Inline carousel loops back to the start instead of dismissing.
    else if (inline) setIndex(0)
    else dismiss()
  }

  const prev = () => {
    if (index > 0) setIndex(index - 1)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartX.current
    touchStartX.current = null
    if (start == null) return
    const end = e.changedTouches[0]?.clientX ?? start
    const dx = end - start
    if (Math.abs(dx) < 40) return
    if (dx < 0) next()
    else prev()
  }

  const isLast = index === SLIDES.length - 1

  return (
    <div
      className={`mi-root ${inline ? 'mi-inline' : ''}`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onClick={(e) => {
        // Tap right half = next, left half = prev. Stop in the button area
        // by bailing on elements that handled their own click.
        const w = (e.currentTarget as HTMLDivElement).clientWidth
        const x = e.clientX
        if (x > w / 2) next()
        else prev()
      }}
    >
      <style>{INTRO_CSS}</style>

      {!inline && (
        <button
          className="mi-skip font-display"
          onClick={(e) => { e.stopPropagation(); dismiss() }}
        >
          SKIP
        </button>
      )}

      <div className="mi-track-wrap">
        <div
          className="mi-track"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {SLIDES.map((s) => (
            <div key={s.key} className="mi-slide">
              <div className="mi-visual">{s.visual}</div>
              <div className="mi-kicker font-display">&gt; {s.kicker}</div>
              {s.headline && (
                <div className="mi-headline font-display">{s.headline}</div>
              )}
              <div className="mi-body font-mono">{s.body}</div>
              {s.tagline && (
                <div className="mi-tagline font-mono">{s.tagline}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mi-dots" aria-hidden>
        {SLIDES.map((s, i) => (
          <span key={s.key} className={`mi-dot ${i === index ? 'on' : ''}`} />
        ))}
      </div>

      <div className="mi-cta">
        {isLast ? (
          <button
            onClick={(e) => { e.stopPropagation(); inline ? setIndex(0) : dismiss() }}
            className="pixel-btn pixel-btn-filled font-display mi-start"
          >
            {inline ? 'REPLAY' : 'START'}
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); next() }}
            className="pixel-btn font-display mi-next"
          >
            NEXT
          </button>
        )}
      </div>
    </div>
  )
}

const INTRO_CSS = `
.mi-root {
  position: fixed; inset: 0; z-index: 100;
  background: var(--bg);
  display: flex; flex-direction: column;
  align-items: stretch; justify-content: space-between;
  padding: 28px 0 32px;
  overflow: hidden;
  cursor: pointer;
  user-select: none;
}

/* Inline variant: embedded in the FAQ page as an in-flow carousel rather
   than a full-screen overlay. Bounded height so it sits in the document. */
.mi-inline {
  position: relative; inset: auto; z-index: 0;
  height: 480px; max-width: 480px;
  margin: 0 auto 8px;
  padding: 20px 0 24px;
  border: 2px solid var(--brand-lime);
  border-radius: 10px;
}

.mi-skip {
  position: absolute; top: 16px; right: 16px;
  background: transparent; border: none;
  color: rgba(255,255,255,0.6);
  font-size: 10px; letter-spacing: 2px;
  padding: 8px 12px; cursor: pointer; z-index: 2;
}
.mi-skip:hover { color: var(--brand-lime); }

.mi-track-wrap { flex: 1; overflow: hidden; display: flex; align-items: center; }
.mi-track {
  display: flex; width: 100%;
  transition: transform 380ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.mi-slide {
  flex: 0 0 100%;
  display: flex; flex-direction: column;
  align-items: center; justify-content: flex-start;
  padding: 0 28px;
  text-align: center;
}

.mi-visual {
  width: 100%; max-width: 280px;
  height: 220px;
  position: relative;
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 28px;
}

.mi-kicker {
  font-size: 13px; letter-spacing: 2px;
  color: var(--brand-lime);
  margin-bottom: 12px;
}
.mi-headline {
  font-size: 18px; letter-spacing: 2px;
  color: var(--brand-lime);
  margin: -4px 0 12px;
}
.mi-body {
  font-size: 12px; line-height: 1.55;
  color: #FFFFFF;
  max-width: 320px;
}
.mi-tagline {
  font-size: 10px; letter-spacing: 2px;
  color: rgba(255,255,255,0.6);
  text-transform: uppercase;
  margin-top: 14px;
}

.mi-dots {
  display: flex; justify-content: center; gap: 8px;
  margin: 16px 0 18px;
}
.mi-dot {
  width: 8px; height: 8px; background: rgba(255,255,255,0.2);
  transition: background 200ms, transform 200ms;
}
.mi-dot.on { background: var(--brand-lime); transform: scale(1.2); }

.mi-cta { display: flex; justify-content: center; }
.mi-cta button { font-size: 12px; padding: 12px 32px; }

/* ---------- Slide 1: TYCOON ---------- */
.mi-stage { position: relative; width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center; }
.mi-watermark {
  animation: mi-rotate 12s linear infinite;
  position: relative; z-index: 2;
  filter: drop-shadow(0 0 18px rgba(180, 144, 255, 0.35));
}
@keyframes mi-rotate {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
.mi-coins { position: absolute; inset: 0; pointer-events: none; }
.mi-coin {
  position: absolute; bottom: 20%;
  font-family: 'Retro Computer', 'Press Start 2P', monospace;
  font-size: 14px; color: var(--brand-lime);
  opacity: 0;
  animation: mi-coin-rise 3.2s ease-in infinite;
}
.mi-coin-1 { left: 18%;  animation-delay: 0s;   }
.mi-coin-2 { left: 78%;  animation-delay: 0.6s; }
.mi-coin-3 { left: 32%;  animation-delay: 1.2s; }
.mi-coin-4 { left: 65%;  animation-delay: 1.8s; }
.mi-coin-5 { left: 50%;  animation-delay: 2.4s; }
@keyframes mi-coin-rise {
  0%   { transform: translateY(0)    scale(0.7); opacity: 0; }
  20%  { opacity: 1; }
  100% { transform: translateY(-150px) scale(1);   opacity: 0; }
}

/* ---------- Slide 2: HOLD / 2x ---------- */
.mi-tag-stack { position: absolute; inset: 0; pointer-events: none; }
.mi-tag {
  position: absolute; left: 50%;
  font-size: 20px; line-height: 1;
  color: var(--brand-lime);
  background: var(--brand-black);
  border: 3px solid var(--brand-lime);
  box-shadow: 0 0 0 3px var(--brand-black), 0 0 14px rgba(167, 255, 5, 0.45);
  padding: 8px 12px;
  opacity: 0;
  /* Tags appear one per 2s beat (25% of the 8s loop) and HOLD until the cycle
     resets, so the full doubling run lines up on the diagonal at the peak. */
  animation: mi-tag-grow 8s ease-in-out infinite;
}
.mi-tag-1 { animation-name: mi-tag-grow-1; top: 30%; transform: translateX(-185%); }
.mi-tag-2 { animation-name: mi-tag-grow-2; top: 22%; transform: translateX(-62%);  }
.mi-tag-3 { animation-name: mi-tag-grow-3; top: 14%; transform: translateX(62%);   }
.mi-tag-4 { animation-name: mi-tag-grow-4; top: 6%;  transform: translateX(185%);
  color: var(--brand-black); background: var(--brand-lime); border-color: var(--brand-black); }
/* Per-tag keyframes share the 8s timeline so tags accumulate (all four on
   screen from ~75% to ~94%), then reset together. Each pops in with a little
   overshoot bounce. translateX is repeated in every frame so the scale pop
   doesn't drop the horizontal offset. */
@keyframes mi-tag-grow-1 {
  0%        { opacity: 0; transform: translateX(-185%) scale(0.5); }
  4%        { opacity: 1; transform: translateX(-185%) scale(1.25); }
  9%, 94%   { opacity: 1; transform: translateX(-185%) scale(1); }
  100%      { opacity: 0; transform: translateX(-185%) scale(1); }
}
@keyframes mi-tag-grow-2 {
  0%, 21%   { opacity: 0; transform: translateX(-62%) scale(0.5); }
  25%       { opacity: 1; transform: translateX(-62%) scale(1.25); }
  30%, 94%  { opacity: 1; transform: translateX(-62%) scale(1); }
  100%      { opacity: 0; transform: translateX(-62%) scale(1); }
}
@keyframes mi-tag-grow-3 {
  0%, 46%   { opacity: 0; transform: translateX(62%) scale(0.5); }
  50%       { opacity: 1; transform: translateX(62%) scale(1.25); }
  55%, 94%  { opacity: 1; transform: translateX(62%) scale(1); }
  100%      { opacity: 0; transform: translateX(62%) scale(1); }
}
@keyframes mi-tag-grow-4 {
  0%, 71%   { opacity: 0; transform: translateX(185%) scale(0.5); }
  75%       { opacity: 1; transform: translateX(185%) scale(1.35); }
  81%, 94%  { opacity: 1; transform: translateX(185%) scale(1); }
  100%      { opacity: 0; transform: translateX(185%) scale(1); }
}
/* Big x2 in the lower middle. Bounces once per 2s beat, just before each new
   doubled tag lands, so the rhythm reads "x2 -> new number -> x2 -> ...". */
.mi-arrow {
  position: absolute; left: 50%; bottom: 14%;
  color: var(--brand-lime);
  font-size: 32px;
  text-shadow: 0 0 14px rgba(167, 255, 5, 0.6);
  transform: translateX(-50%);
  animation: mi-arrow-bounce 2s ease-in-out infinite;
}
@keyframes mi-arrow-bounce {
  0%, 100% { transform: translateX(-50%) translateY(0) scale(1);    opacity: 0.55; }
  12%      { transform: translateX(-50%) translateY(-8px) scale(1.45); opacity: 1; }
  30%      { transform: translateX(-50%) translateY(0) scale(1);    opacity: 0.8; }
}

@media (prefers-reduced-motion: reduce) {
  .mi-tag, .mi-arrow { animation: none; opacity: 1; }
  .mi-tag-1 { transform: translateX(-185%); }
  .mi-tag-2 { transform: translateX(-62%); }
  .mi-tag-3 { transform: translateX(62%); }
  .mi-tag-4 { transform: translateX(185%); }
  .mi-arrow { transform: translateX(-50%); }
}

/* ---------- Slide 3: HUNT ---------- */
.mi-grid {
  display: grid;
  grid-template-columns: repeat(4, 28px);
  gap: 4px;
}
.mi-cell {
  width: 28px; height: 28px;
  background: #1a1a1a;
}
.mi-cell-0 { background: #1a1a1a; }
.mi-cell-1 { background: #222; }
.mi-cell-2 { background: #1a1a1a; }
.mi-cell-3 { background: #2a2a2a; }
.mi-lens {
  position: absolute;
  top: 24%; left: 50%;
  animation: mi-lens-scan 3.6s ease-in-out infinite;
}
.mi-lens-ring {
  display: block;
  width: 42px; height: 42px;
  border: 3px solid var(--brand-lime);
  border-radius: 50%;
  box-shadow: 0 0 0 2px var(--brand-black);
}
.mi-lens-stem {
  display: block;
  width: 4px; height: 16px;
  background: var(--brand-lime);
  box-shadow: 0 0 0 1px var(--brand-black);
  transform: rotate(-40deg);
  margin: 2px 0 0 30px;
}
@keyframes mi-lens-scan {
  0%, 100% { transform: translate(-80px, 0); }
  50%      { transform: translate(40px, 30px); }
}
.mi-tag-decay {
  position: absolute; bottom: 8%;
  width: 100%;
  display: flex; justify-content: center;
  font-size: 14px; color: var(--brand-lime);
}
.mi-decay {
  position: absolute;
  opacity: 0;
  animation: mi-decay-flash 4s linear infinite;
}
.mi-decay-1 { animation-delay: 0s; }
.mi-decay-2 { animation-delay: 1s; }
.mi-decay-3 { animation-delay: 2s; }
.mi-decay-4 { animation-delay: 3s; color: #FFFFFF; }
@keyframes mi-decay-flash {
  0%, 100% { opacity: 0; transform: translateY(8px); }
  6%, 22%  { opacity: 1; transform: translateY(0); }
  25%      { opacity: 0; transform: translateY(-6px); }
}

/* ---------- Slide 4: REWARDS ---------- */
.mi-bars {
  display: flex; align-items: flex-end; gap: 12px;
  height: 130px;
}
.mi-bar {
  width: 28px;
  background: var(--brand-lime);
  box-shadow:
    0 0 0 2px var(--brand-black),
    0 0 0 4px var(--brand-lime);
  transform-origin: bottom;
  animation: mi-grow 2.4s ease-out infinite;
}
.mi-bar-1 { height: 50px;  animation-delay: 0s;   }
.mi-bar-2 { height: 90px;  animation-delay: 0.3s; }
.mi-bar-3 { height: 130px; animation-delay: 0.6s; }
@keyframes mi-grow {
  0%   { transform: scaleY(0); }
  40%  { transform: scaleY(1); }
  100% { transform: scaleY(1); }
}
.mi-crown {
  position: absolute;
  top: 14%; left: 50%; transform: translateX(-50%);
  width: 56px; height: 32px;
  animation: mi-bounce 1.4s ease-in-out infinite;
}
.mi-crown-tip {
  position: absolute; top: 0; width: 12px; height: 16px;
  background: var(--brand-lime);
}
.mi-crown-tip-1 { left: 0; }
.mi-crown-tip-2 { left: 22px; height: 22px; }
.mi-crown-tip-3 { right: 0; }
.mi-crown-band {
  position: absolute; bottom: 0; left: 0; right: 0;
  height: 14px; background: var(--brand-lime);
}
@keyframes mi-bounce {
  0%, 100% { transform: translate(-50%, 0); }
  50%      { transform: translate(-50%, -6px); }
}

/* ---------- Slide 5: PAINT ---------- */
.mi-paint-grid {
  display: grid;
  grid-template-columns: repeat(5, 24px);
  gap: 3px;
}
.mi-paint-cell {
  width: 24px; height: 24px;
  background: #1a1a1a;
  animation: mi-paint-fill 4s ease-in-out infinite;
}
.mi-paint-cell.on { animation-name: mi-paint-on; }
@keyframes mi-paint-fill {
  0%, 100% { background: #1a1a1a; }
  50%      { background: #2a2a2a; }
}
@keyframes mi-paint-on {
  0%, 100% { background: #1a1a1a; }
  30%      { background: var(--brand-lime); }
  70%      { background: var(--brand-blue); }
}
.mi-splatter { position: absolute; inset: 0; pointer-events: none; }
.mi-splat {
  position: absolute;
  width: 10px; height: 10px;
  opacity: 0;
  animation: mi-splat-pop 3s ease-in-out infinite;
}
.mi-splat-1 { top: 16%; left: 16%; background: var(--brand-lime); animation-delay: 0.4s; }
.mi-splat-2 { top: 70%; right: 14%; background: var(--brand-blue); animation-delay: 1.1s; }
.mi-splat-3 { top: 22%; right: 22%; background: #FFFFFF; animation-delay: 2s; }
@keyframes mi-splat-pop {
  0%, 100% { transform: scale(0); opacity: 0; }
  40%      { transform: scale(1.4); opacity: 1; }
  70%      { transform: scale(1); opacity: 0.6; }
}
`
