/* eslint-disable @next/next/no-img-element */
/* Static mockup gallery — every screen + overlay in the new brand.
   Open at /dev/design-preview. Nothing here imports real app components, so
   we can iterate on visuals without touching the live flow. */

import Link from 'next/link';

const BRAND = '/brand';

// ---------- Atoms ----------

function Frame({ title, children, w = 360 }: { title: string; children: React.ReactNode; w?: number }) {
  return (
    <section className="flex flex-col items-center gap-3">
      <h3 className="font-display text-brand-lime text-xs tracking-widest uppercase">{title}</h3>
      <div
        className="rounded-[28px] border border-white/15 bg-brand-black overflow-hidden shadow-2xl"
        style={{ width: w, minHeight: 640 }}
      >
        {children}
      </div>
    </section>
  );
}

function StatusBar() {
  return (
    <div className="flex items-center justify-between px-5 pt-3 pb-2 text-white/90 text-[12px]">
      <span className="font-semibold">13:58</span>
      <div className="flex items-center gap-1.5 text-[11px]">
        <span>•••</span>
        <span>📶</span>
        <span className="rounded bg-white/30 px-1.5 text-[10px]">58</span>
      </div>
    </div>
  );
}

function UrlBar() {
  return (
    <div className="px-3 pb-2">
      <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5">
        <span className="text-white/60 text-[11px]">⊙</span>
        <span className="flex-1 text-center text-white/80 text-[12px]">mondeto.app</span>
        <span className="text-white/60 text-[11px]">↗</span>
      </div>
    </div>
  );
}

function BrowserChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full bg-brand-black">
      <StatusBar />
      <UrlBar />
      <div className="flex-1">{children}</div>
      <div className="flex items-center justify-around px-2 py-3 border-t border-white/10 text-white/60 text-lg">
        <span>←</span><span className="opacity-50">→</span><span className="rounded-full bg-white/15 w-7 h-7 grid place-items-center text-base">+</span><span className="border border-white/40 rounded w-6 h-6 grid place-items-center text-[10px]">1</span><span>•••</span>
      </div>
    </div>
  );
}

// ---------- App chrome ----------

function TopBar() {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-brand-black">
      <div className="flex items-center gap-2">
        <img src={`${BRAND}/logo/logo.svg`} alt="" className="w-7 h-7" style={{ imageRendering: 'pixelated' }} />
        <img src={`${BRAND}/wordmark/wordmark-white.svg`} alt="MONDETO" className="h-4" />
      </div>
      <ConnectButton />
    </div>
  );
}

function ConnectButton({ state = 'idle' as 'idle' | 'connecting' | 'connected', address }: { state?: 'idle' | 'connecting' | 'connected'; address?: string }) {
  const label = state === 'connecting' ? 'CONNECTING…' : state === 'connected' ? (address ?? '0x12…AB9F') : 'CONNECT';
  // Compact variant sized to match the wordmark height in the TopBar.
  return (
    <button className="pixel-btn pixel-btn-sm text-[8px] tracking-[1.5px] w-[108px] justify-center">
      {label}
    </button>
  );
}

function BottomNav({ active = 'globe' as 'trophy' | 'globe' | 'user' }) {
  const items: Array<{ key: 'trophy' | 'globe' | 'user'; src: string; label: string }> = [
    { key: 'trophy', src: `${BRAND}/icons/trophy.svg`, label: 'RANKS' },
    { key: 'globe',  src: `${BRAND}/icons/globe.svg`,  label: 'MAP' },
    { key: 'user',   src: `${BRAND}/icons/users.svg`,  label: 'ME' },
  ];
  return (
    <div className="flex items-center justify-around px-6 py-3 bg-brand-black border-t border-white/10">
      {items.map(i => (
        <div key={i.key} className="flex flex-col items-center gap-1">
          <img
            src={i.src}
            alt={i.label}
            className="w-7 h-7"
            style={{
              imageRendering: 'pixelated',
              filter: active === i.key ? 'invert(86%) sepia(75%) saturate(2000%) hue-rotate(20deg) brightness(105%)' : 'none',
              opacity: active === i.key ? 1 : 0.85,
            }}
          />
          <span className={`font-display text-[7px] tracking-widest uppercase ${active === i.key ? 'text-brand-lime' : 'text-white/60'}`}>{i.label}</span>
        </div>
      ))}
    </div>
  );
}

function MapSubHeader({ active = 'heatmap' as 'heatmap' | 'myland' }) {
  return (
    <div className="flex items-center justify-end px-3 py-2 bg-brand-lime">
      <div className="font-display text-[10px] tracking-widest text-brand-black flex items-center gap-2">
        <span className={active === 'heatmap' ? '' : 'opacity-50'}>HEATMAP</span>
        <span>/</span>
        <span className={active === 'myland' ? '' : 'opacity-50'}>MY LAND</span>
      </div>
    </div>
  );
}

function ZoomControls() {
  return (
    <div className="flex flex-col items-center gap-2">
      <img src={`${BRAND}/icons/zoom-in.svg`} alt="zoom in" className="w-8 h-8" style={{ imageRendering: 'pixelated' }} />
      <img src={`${BRAND}/icons/centre.svg`} alt="centre" className="w-8 h-8" style={{ imageRendering: 'pixelated' }} />
      <img src={`${BRAND}/icons/zoom-out.svg`} alt="zoom out" className="w-8 h-8" style={{ imageRendering: 'pixelated' }} />
    </div>
  );
}

// ---------- Mockup screens ----------

function SplashScreen() {
  return (
    <BrowserChrome>
      <div className="flex flex-col items-center justify-center pt-24 gap-8 px-6">
        <div className="relative w-56 h-56 grid place-items-center">
          <img
            src={`${BRAND}/watermark.svg`}
            alt=""
            className="absolute inset-0 w-full h-full animate-spin-slow-rev"
            style={{ imageRendering: 'pixelated' }}
          />
        </div>
        <img src={`${BRAND}/wordmark/wordmark-white.svg`} alt="MONDETO" className="h-8" />
        <div className="mt-2 flex items-center gap-1 font-display text-[10px] tracking-widest text-brand-lime">
          LOADING<span className="animate-blink">_</span>
        </div>
      </div>
    </BrowserChrome>
  );
}

function LandingScreen() {
  const bullets = [
    { h: 'CLAIM LAND',     p: 'Buy pixels and paint the map your color' },
    { h: 'HOLD YOUR GROUND', p: 'Someone wants your land? They pay you double' },
    { h: 'HUNT FOR DEALS', p: 'Land without buyers gets cheaper over time' },
    { h: 'OUTRANK OTHERS', p: 'Climb the leaderboard and win prizes' },
  ];
  return (
    <BrowserChrome>
      <div className="flex flex-col items-center pt-10 pb-6 px-6">
        <img src={`${BRAND}/logo/logo.svg`} alt="" className="w-16 h-16" style={{ imageRendering: 'pixelated' }} />
        <img src={`${BRAND}/wordmark/wordmark-white.svg`} alt="MONDETO" className="h-7 mt-4" />
        <div className="font-mono text-[10px] tracking-widest text-white/80 mt-2 uppercase">Own the world, one pixel at a time</div>

        <div className="mt-10 w-full flex flex-col gap-5">
          {bullets.map(b => (
            <div key={b.h}>
              <div className="font-display text-brand-lime text-[12px] tracking-widest">&gt; {b.h}</div>
              <div className="font-mono text-white text-[12px] mt-1">{b.p}</div>
            </div>
          ))}
        </div>

        <button className="pixel-btn mt-10 text-[12px] !px-10">START</button>
      </div>
    </BrowserChrome>
  );
}

function MapCanvas() {
  // Blue ocean + cream land (image-v8). The world-map.png is desaturated and
  // luminance-inverted to render the land mass as light cream pixels on top
  // of a brand-blue background. Switch to a dedicated map asset later if we
  // want sharper pixel control.
  return (
    <div className="relative flex-1 overflow-hidden" style={{ background: 'var(--brand-blue)' }}>
      <img
        src="/world-map.png"
        alt=""
        className="w-full h-full object-cover"
        style={{
          imageRendering: 'pixelated',
          filter: 'brightness(0) invert(1) opacity(0.92)',
          mixBlendMode: 'lighten',
        }}
      />
      <div className="absolute right-3 top-3"><ZoomControls /></div>
    </div>
  );
}

function MapScreen({ subHeader = 'heatmap' as 'heatmap' | 'myland', activeTab = 'globe' as 'trophy' | 'globe' | 'user' }) {
  return (
    <BrowserChrome>
      <div className="flex flex-col h-full">
        <TopBar />
        <MapSubHeader active={subHeader} />
        <MapCanvas />
        <BottomNav active={activeTab} />
      </div>
    </BrowserChrome>
  );
}

function ProfileScreen() {
  return (
    <BrowserChrome>
      <div className="flex flex-col h-full">
        <TopBar />
        <div className="flex-1 px-5 py-6 flex flex-col items-center gap-6">
          <div className="w-24 h-24 bg-brand-purple grid place-items-center">
            <div className="w-16 h-16 grid grid-cols-4 grid-rows-4 gap-0">
              {Array.from({ length: 16 }).map((_, i) => (
                <div key={i} className={i % 3 === 0 ? 'bg-brand-cream' : 'bg-brand-black'} />
              ))}
            </div>
          </div>
          <div className="text-center">
            <div className="font-display text-brand-lime text-[14px] tracking-widest">PIXELLORD</div>
            <div className="font-mono text-white/60 text-[10px] mt-1">0x12…ab9F</div>
          </div>

          <div className="w-full grid grid-cols-3 gap-2 mt-4">
            {[
              { k: 'OWNED', v: '247' },
              { k: 'EARNED', v: '12.4 cUSD' },
              { k: 'RANK', v: '#42' },
            ].map(s => (
              <div key={s.k} className="border border-brand-lime/40 p-3 text-center">
                <div className="font-display text-brand-lime text-[10px] tracking-widest">{s.k}</div>
                <div className="font-mono text-white text-[13px] mt-1">{s.v}</div>
              </div>
            ))}
          </div>

          <div className="w-full mt-4 border border-white/15 p-4">
            <div className="font-display text-white text-[11px] tracking-widest mb-3">PAINT COLOR</div>
            <ColorPicker selected="#FF4C00" />
            <button className="font-display text-brand-lime text-[9px] tracking-widest mt-4 underline">
              + CUSTOM COLOR
            </button>
            <div className="font-mono text-white/50 text-[9px] mt-3">Tap a color · paints all your future claims</div>
          </div>
        </div>
        <BottomNav active="user" />
      </div>
    </BrowserChrome>
  );
}

function RanksScreen() {
  const rows = [
    { rank: 1, name: 'PIXELQUEEN', pixels: 1284, prize: '50 cUSD' },
    { rank: 2, name: 'MAPGOD',     pixels:  982, prize: '30 cUSD' },
    { rank: 3, name: 'TERRABYTE',  pixels:  877, prize: '20 cUSD' },
    { rank: 4, name: 'GRIDFIEND',  pixels:  654, prize: '—' },
    { rank: 5, name: 'COLORWAR',   pixels:  522, prize: '—' },
    { rank: 6, name: 'TILEMAN',    pixels:  410, prize: '—' },
  ];
  return (
    <BrowserChrome>
      <div className="flex flex-col h-full">
        <TopBar />
        <div className="flex-1 px-4 py-4">
          <div className="flex gap-2 mb-4">
            {['ALL TIME','WEEK','DAY'].map((t,i) => (
              <button key={t} className={`font-display text-[9px] tracking-widest px-3 py-1.5 border ${i===0 ? 'border-brand-lime text-brand-lime' : 'border-white/20 text-white/60'}`}>{t}</button>
            ))}
          </div>
          {rows.map(r => (
            <div key={r.rank} className="flex items-center gap-3 py-2 border-b border-white/10">
              <div className="font-display text-brand-lime text-[12px] w-6">{r.rank}</div>
              <div className="flex-1">
                <div className="font-display text-white text-[11px] tracking-widest">{r.name}</div>
                <div className="font-mono text-white/50 text-[9px]">{r.pixels} px</div>
              </div>
              <div className="font-mono text-brand-orange text-[10px]">{r.prize}</div>
            </div>
          ))}
        </div>
        <BottomNav active="trophy" />
      </div>
    </BrowserChrome>
  );
}

function AnalyticsScreen() {
  return (
    <BrowserChrome>
      <div className="flex flex-col h-full">
        <TopBar />
        <div className="flex-1 px-4 py-4 space-y-4">
          <div className="font-display text-brand-lime text-[12px] tracking-widest">ANALYTICS</div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { k: 'TOTAL PIXELS', v: '17,000' },
              { k: 'OWNED', v: '4,238' },
              { k: 'VOLUME', v: '892 cUSD' },
              { k: 'PLAYERS', v: '317' },
            ].map(s => (
              <div key={s.k} className="border border-white/15 p-3">
                <div className="font-display text-white/70 text-[8px] tracking-widest">{s.k}</div>
                <div className="font-mono text-brand-lime text-[16px] mt-1">{s.v}</div>
              </div>
            ))}
          </div>
          <div className="border border-white/15 p-3">
            <div className="font-display text-white text-[9px] tracking-widest mb-2">HEAT BY EPOCH</div>
            <div className="flex items-end gap-1 h-24">
              {[20,42,33,68,55,82,90,76,60,48,35,28].map((h,i) => (
                <div key={i} className="flex-1" style={{ height: `${h}%`, background: 'var(--brand-orange)' }} />
              ))}
            </div>
          </div>
        </div>
        <BottomNav active="globe" />
      </div>
    </BrowserChrome>
  );
}

function FaqScreen() {
  const qa = [
    { q: 'WHAT IS MONDETO?', a: 'A pixel-map game on Celo. Claim pixels, paint them, earn when others buy.' },
    { q: 'HOW DO I CLAIM A PIXEL?', a: 'Tap a pixel on the map, connect your wallet, and confirm the transaction.' },
    { q: 'WHAT ARE THE PRIZES?', a: 'Weekly leaderboards pay out in cUSD. Hold to climb.' },
  ];
  return (
    <BrowserChrome>
      <div className="flex flex-col h-full">
        <TopBar />
        <div className="flex-1 px-4 py-4 space-y-5">
          <div className="font-display text-brand-lime text-[14px] tracking-widest">FAQ</div>
          {qa.map(item => (
            <div key={item.q}>
              <div className="font-display text-white text-[10px] tracking-widest">&gt; {item.q}</div>
              <div className="font-mono text-white/80 text-[11px] mt-1">{item.a}</div>
            </div>
          ))}
        </div>
        <BottomNav active="globe" />
      </div>
    </BrowserChrome>
  );
}

function TermsScreen({ title = 'TERMS' }: { title?: string }) {
  return (
    <BrowserChrome>
      <div className="flex flex-col h-full">
        <TopBar />
        <div className="flex-1 px-4 py-4 space-y-3 overflow-auto">
          <div className="font-display text-brand-lime text-[14px] tracking-widest">{title}</div>
          {Array.from({ length: 5 }).map((_, i) => (
            <p key={i} className="font-mono text-white/80 text-[11px] leading-relaxed">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Pixels are owned, prices follow epochs,
              and resale doubles the floor. By using Mondeto you agree to play nice.
            </p>
          ))}
        </div>
        <BottomNav active="globe" />
      </div>
    </BrowserChrome>
  );
}

function NotFoundScreen() {
  return (
    <BrowserChrome>
      <div className="flex flex-col items-center justify-center pt-32 px-6 gap-4">
        <div className="font-display text-brand-orange text-[48px] tracking-widest">404</div>
        <div className="font-display text-white text-[12px] tracking-widest">OFF THE MAP</div>
        <div className="font-mono text-white/60 text-[11px] text-center mt-2">This pixel doesn't exist. Yet.</div>
        <button className="pixel-btn mt-8 text-[11px]">BACK TO MAP</button>
      </div>
    </BrowserChrome>
  );
}

// ---------- Overlays ----------

function OverlayFrame({ children, w = 360, h = 500 }: { children: React.ReactNode; w?: number; h?: number }) {
  return (
    <div
      className="relative rounded-[20px] border border-white/15 bg-[#262626] overflow-hidden"
      style={{ width: w, height: h }}
    >
      <img src="/world-map.png" alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" style={{ imageRendering: 'pixelated' }} />
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative h-full">{children}</div>
    </div>
  );
}

function PixelInfoPanel() {
  return (
    <OverlayFrame>
      <div className="absolute bottom-0 left-0 right-0 bg-brand-black border-t-2 border-brand-lime p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-display text-brand-lime text-[11px] tracking-widest">PIXEL #4218</div>
            <div className="font-mono text-white/60 text-[9px] mt-0.5">42° 18' N · 12° 27' E</div>
          </div>
          <div className="w-9 h-9 bg-brand-orange border-2 border-white" />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div><div className="font-display text-white/60 text-[8px] tracking-widest">OWNER</div><div className="font-mono text-white text-[11px]">0x12…ab</div></div>
          <div><div className="font-display text-white/60 text-[8px] tracking-widest">PRICE</div><div className="font-mono text-brand-lime text-[11px]">0.4 cUSD</div></div>
          <div><div className="font-display text-white/60 text-[8px] tracking-widest">EPOCH</div><div className="font-mono text-white text-[11px]">#12</div></div>
        </div>
        <button className="pixel-btn pixel-btn-filled w-full mt-4 text-[12px]">CLAIM IT</button>
      </div>
    </OverlayFrame>
  );
}

function SelectionDrawer() {
  return (
    <OverlayFrame>
      <div className="absolute bottom-0 left-0 right-0 bg-brand-black border-t-2 border-brand-lime p-4">
        <div className="w-10 h-1 bg-white/30 rounded mx-auto mb-3" />
        <div className="font-display text-brand-lime text-[11px] tracking-widest">12 PIXELS SELECTED</div>
        <div className="font-mono text-white/70 text-[10px] mt-1">Italy · Rome region</div>
        <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
          <span className="font-mono text-white text-[11px]">Total</span>
          <span className="font-mono text-brand-lime text-[13px]">4.80 cUSD</span>
        </div>
        <div className="mt-3 flex gap-2">
          <button className="pixel-btn flex-1 text-[10px]">CANCEL</button>
          <button className="pixel-btn pixel-btn-filled flex-1 text-[10px]">CLAIM</button>
        </div>
      </div>
    </OverlayFrame>
  );
}

function TxProgress({ state = 'pending' as 'signing' | 'pending' | 'confirmed' }) {
  const label = state === 'signing' ? 'SIGN IN WALLET' : state === 'pending' ? 'CONFIRMING' : 'CONFIRMED';
  return (
    <OverlayFrame>
      <div className="absolute inset-0 grid place-items-center">
        <div className="bg-brand-black border-2 border-brand-lime px-8 py-6 flex flex-col items-center gap-3">
          <div className={`w-10 h-10 border-2 ${state === 'confirmed' ? 'border-brand-lime bg-brand-lime' : 'border-brand-lime'} ${state === 'pending' ? 'animate-spin-slow' : ''}`} />
          <div className="font-display text-brand-lime text-[11px] tracking-widest">{label}</div>
          <div className="font-mono text-white/60 text-[9px]">tx 0x9f…3a21</div>
        </div>
      </div>
    </OverlayFrame>
  );
}

function SuccessState() {
  return (
    <OverlayFrame>
      <div className="absolute inset-0 grid place-items-center px-6">
        <div className="bg-brand-cream p-6 text-center w-full">
          <div className="font-display text-brand-black text-[12px] tracking-widest">+12 PIXELS</div>
          <div className="font-display text-brand-orange text-[20px] tracking-widest mt-2">CLAIMED</div>
          <div className="font-mono text-brand-black/80 text-[11px] mt-3">You now own a piece of Italy.</div>
          <button className="pixel-btn pixel-btn-filled mt-5 text-[11px]">VIEW ON MAP</button>
        </div>
      </div>
    </OverlayFrame>
  );
}

function PaintModeBanner() {
  return (
    <OverlayFrame>
      <div className="absolute top-0 left-0 right-0 bg-brand-purple py-2 px-4 flex items-center justify-between">
        <div className="font-display text-white text-[10px] tracking-widest">PAINT MODE · TAP TO COLOR</div>
        <button className="font-display text-white text-[10px] tracking-widest underline">EXIT</button>
      </div>
    </OverlayFrame>
  );
}

function HeatmapLegend() {
  const stops = ['#3A1E0A','#6B2F0E','#A14310','#D85614','#FF4C00','#FF8A4C','#FFC499','#FFFFFF'];
  return (
    <OverlayFrame h={300}>
      <div className="absolute bottom-4 left-4 bg-brand-black border border-white/15 p-3">
        <div className="font-display text-white text-[8px] tracking-widest mb-2">PRICE HEAT</div>
        <div className="flex h-3 w-44">
          {stops.map(c => <div key={c} className="flex-1" style={{ background: c }} />)}
        </div>
        <div className="flex justify-between mt-1 font-mono text-white/60 text-[8px]">
          <span>CHEAP</span><span>HOT</span>
        </div>
      </div>
    </OverlayFrame>
  );
}

function ZoomHintToast() {
  return (
    <OverlayFrame h={300}>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-brand-black border border-brand-lime px-4 py-2">
        <div className="font-display text-brand-lime text-[10px] tracking-widest">PINCH TO ZOOM IN</div>
      </div>
    </OverlayFrame>
  );
}

function CampaignBanner() {
  return (
    <OverlayFrame h={200}>
      <div className="absolute top-0 left-0 right-0 bg-brand-lime py-2 overflow-hidden">
        <div className="font-display text-brand-black text-[10px] tracking-widest whitespace-nowrap">
          50 cUSD PRIZE POOL · ENDS SUNDAY · CLAIM NOW · 50 cUSD PRIZE POOL · ENDS SUNDAY · CLAIM NOW ·
        </div>
      </div>
    </OverlayFrame>
  );
}

function CustomColorPickerOverlay() {
  return (
    <OverlayFrame>
      <div className="absolute inset-0 grid place-items-center px-4">
        <div className="bg-brand-black border border-white/20 p-4 w-full">
          <div className="font-display text-brand-lime text-[10px] tracking-widest mb-2">COLOR</div>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full" style={{ background: '#FF4C00' }} />
            <div className="flex-1 h-6 rounded-sm" style={{ background: '#FF4C00' }} />
          </div>
          <div className="font-mono text-brand-lime text-[10px] mb-3">#FF4C00</div>
          <CustomColorPicker selected="#FF4C00" />
        </div>
      </div>
    </OverlayFrame>
  );
}

// ---------- Connect button states + zoom ----------

function ConnectStates() {
  return (
    <div className="flex flex-col items-start gap-4 bg-brand-black p-6 rounded-xl border border-white/15">
      <div className="flex items-center gap-3"><ConnectButton state="idle" /><span className="font-mono text-white/60 text-[10px]">idle</span></div>
      <div className="flex items-center gap-3"><ConnectButton state="connecting" /><span className="font-mono text-white/60 text-[10px]">connecting</span></div>
      <div className="flex items-center gap-3"><ConnectButton state="connected" address="0x12…ab9F" /><span className="font-mono text-white/60 text-[10px]">connected</span></div>
    </div>
  );
}

function ColorPicker({ selected = '#A7FF05' }: { selected?: string }) {
  const colors = ['#A7FF05','#FF4C00','#B430FF','#71BBFF','#F0E7D6','#FFFFFF'];
  return (
    <div className="flex gap-3 flex-wrap">
      {colors.map(c => {
        const isSelected = c === selected;
        return (
          <div key={c} className="relative">
            <div
              className="w-11 h-11"
              style={{
                background: c,
                outline: isSelected ? '2px solid #FFFFFF' : '1px solid rgba(255,255,255,0.15)',
                outlineOffset: isSelected ? '2px' : '0px',
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

function CustomColorPicker({ selected = '#FF4C00' }: { selected?: string }) {
  // HSV picker mockup: saturation/value pad, hue ramp, RGB read-outs.
  // Visual only — interaction wired up when migrating to the real component.
  const hue = '#FF4C00';
  return (
    <div className="bg-white w-full max-w-[280px] p-3">
      <div
        className="relative w-full h-28"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hue})`,
        }}
      >
        <div className="absolute right-3 top-3 w-3 h-3 rounded-full border-2 border-black ring-2 ring-white" />
      </div>
      <div className="flex items-center gap-2 mt-3">
        <span className="text-[10px]">⌕</span>
        <div className="w-6 h-6 rounded-full" style={{ background: selected }} />
        <div
          className="flex-1 h-3 relative"
          style={{
            background:
              'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
          }}
        >
          <div className="absolute right-2 -top-0.5 w-3 h-4 rounded-full border-2 border-white" style={{ background: hue }} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3">
        {['255','76','0'].map((v,i) => (
          <div key={i} className="flex flex-col items-center">
            <input
              type="text"
              defaultValue={v}
              readOnly
              className="w-full text-center border border-black/20 py-1 text-[12px] font-mono text-black bg-white"
            />
            <span className="font-mono text-black/60 text-[10px] mt-1">{['R','G','B'][i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaletteSwatches() {
  const swatches = [
    { name: 'white',  hex: '#FFFFFF' },
    { name: 'black',  hex: '#1B1B1B' },
    { name: 'lime',   hex: '#A7FF05' },
    { name: 'orange', hex: '#FF4C00' },
    { name: 'purple', hex: '#B430FF' },
    { name: 'cream',  hex: '#F0E7D6' },
    { name: 'blue',   hex: '#71BBFF' },
  ];
  return (
    <div className="grid grid-cols-7 gap-3">
      {swatches.map(s => (
        <div key={s.name} className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 border border-white/15" style={{ background: s.hex }} />
          <div className="font-display text-white text-[8px] tracking-widest uppercase">{s.name}</div>
          <div className="font-mono text-white/50 text-[8px]">{s.hex}</div>
        </div>
      ))}
    </div>
  );
}

// ---------- Section wrapper ----------

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="border-t border-white/10 py-12">
      <h2 className="font-display text-brand-lime text-[18px] tracking-widest uppercase mb-8">{title}</h2>
      <div className="flex flex-wrap items-start gap-10">{children}</div>
    </section>
  );
}

// ---------- Page ----------

export default function DesignPreviewPage() {
  return (
    <div className="min-h-screen bg-brand-black text-white px-6 py-10 max-w-[1400px] mx-auto">
      <header className="mb-12">
        <div className="flex items-center gap-3">
          <img src={`${BRAND}/logo/logo.svg`} alt="" className="w-10 h-10" style={{ imageRendering: 'pixelated' }} />
          <img src={`${BRAND}/wordmark/wordmark-white.svg`} alt="MONDETO" className="h-7" />
          <span className="font-display text-brand-lime text-[14px] tracking-widest ml-4">DESIGN PREVIEW</span>
        </div>
        <p className="font-mono text-white/60 text-[12px] mt-3 max-w-xl">
          Static mockups of every screen and overlay in the new brand. Nothing here is wired to the real app —
          review, flag anything wrong on the color/spacing/layout, then we migrate the real components.
        </p>
        <nav className="flex flex-wrap gap-x-4 gap-y-1 mt-4 font-mono text-[11px]">
          {['palette','chrome','screens','overlays'].map(s => (
            <Link key={s} href={`#${s}`} className="text-brand-lime underline">{`#${s}`}</Link>
          ))}
        </nav>
      </header>

      <Section id="palette" title="Palette">
        <PaletteSwatches />
      </Section>

      <Section id="chrome" title="Chrome">
        <div className="flex flex-col items-start gap-4">
          <span className="font-display text-white/70 text-[9px] tracking-widest">TOP BAR</span>
          <div style={{ width: 360 }} className="bg-brand-black rounded-md overflow-hidden border border-white/10"><TopBar /></div>
        </div>
        <div className="flex flex-col items-start gap-4">
          <span className="font-display text-white/70 text-[9px] tracking-widest">MAP SUB-HEADER</span>
          <div style={{ width: 360 }} className="overflow-hidden border border-white/10"><MapSubHeader /></div>
          <div style={{ width: 360 }} className="overflow-hidden border border-white/10"><MapSubHeader active="myland" /></div>
        </div>
        <div className="flex flex-col items-start gap-4">
          <span className="font-display text-white/70 text-[9px] tracking-widest">BOTTOM NAV</span>
          <div style={{ width: 360 }} className="rounded-md overflow-hidden border border-white/10"><BottomNav active="globe" /></div>
          <div style={{ width: 360 }} className="rounded-md overflow-hidden border border-white/10"><BottomNav active="trophy" /></div>
          <div style={{ width: 360 }} className="rounded-md overflow-hidden border border-white/10"><BottomNav active="user" /></div>
        </div>
        <div className="flex flex-col items-start gap-4">
          <span className="font-display text-white/70 text-[9px] tracking-widest">CONNECT BUTTON STATES</span>
          <ConnectStates />
        </div>
        <div className="flex flex-col items-start gap-4">
          <span className="font-display text-white/70 text-[9px] tracking-widest">ZOOM CONTROLS</span>
          <div className="bg-[#262626] p-4 rounded-md"><ZoomControls /></div>
        </div>
      </Section>

      <Section id="screens" title="Screens">
        <Frame title="splash / loading"><SplashScreen /></Frame>
        <Frame title="landing / intro"><LandingScreen /></Frame>
        <Frame title="map (heatmap)"><MapScreen subHeader="heatmap" /></Frame>
        <Frame title="map (my land)"><MapScreen subHeader="myland" activeTab="user" /></Frame>
        <Frame title="profile"><ProfileScreen /></Frame>
        <Frame title="ranks / leaderboard"><RanksScreen /></Frame>
        <Frame title="analytics"><AnalyticsScreen /></Frame>
        <Frame title="faq"><FaqScreen /></Frame>
        <Frame title="terms"><TermsScreen title="TERMS" /></Frame>
        <Frame title="privacy"><TermsScreen title="PRIVACY" /></Frame>
        <Frame title="not found"><NotFoundScreen /></Frame>
      </Section>

      <Section id="overlays" title="Overlays">
        <div className="flex flex-col items-center gap-3">
          <span className="font-display text-white/70 text-[9px] tracking-widest">PIXEL INFO PANEL</span>
          <PixelInfoPanel />
        </div>
        <div className="flex flex-col items-center gap-3">
          <span className="font-display text-white/70 text-[9px] tracking-widest">SELECTION DRAWER</span>
          <SelectionDrawer />
        </div>
        <div className="flex flex-col items-center gap-3">
          <span className="font-display text-white/70 text-[9px] tracking-widest">TX SIGNING</span>
          <TxProgress state="signing" />
        </div>
        <div className="flex flex-col items-center gap-3">
          <span className="font-display text-white/70 text-[9px] tracking-widest">TX PENDING</span>
          <TxProgress state="pending" />
        </div>
        <div className="flex flex-col items-center gap-3">
          <span className="font-display text-white/70 text-[9px] tracking-widest">TX CONFIRMED</span>
          <TxProgress state="confirmed" />
        </div>
        <div className="flex flex-col items-center gap-3">
          <span className="font-display text-white/70 text-[9px] tracking-widest">SUCCESS STATE</span>
          <SuccessState />
        </div>
        <div className="flex flex-col items-center gap-3">
          <span className="font-display text-white/70 text-[9px] tracking-widest">PAINT MODE BANNER</span>
          <PaintModeBanner />
        </div>
        <div className="flex flex-col items-center gap-3">
          <span className="font-display text-white/70 text-[9px] tracking-widest">HEATMAP LEGEND</span>
          <HeatmapLegend />
        </div>
        <div className="flex flex-col items-center gap-3">
          <span className="font-display text-white/70 text-[9px] tracking-widest">ZOOM HINT TOAST</span>
          <ZoomHintToast />
        </div>
        <div className="flex flex-col items-center gap-3">
          <span className="font-display text-white/70 text-[9px] tracking-widest">CAMPAIGN BANNER</span>
          <CampaignBanner />
        </div>
        <div className="flex flex-col items-center gap-3">
          <span className="font-display text-white/70 text-[9px] tracking-widest">CUSTOM COLOR PICKER</span>
          <CustomColorPickerOverlay />
        </div>
      </Section>

      <footer className="mt-16 py-8 border-t border-white/10 font-mono text-white/40 text-[11px] text-center">
        Mockups only. Confirm details and I migrate the real components.
      </footer>
    </div>
  );
}
