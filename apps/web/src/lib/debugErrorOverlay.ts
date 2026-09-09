/**
 * On-screen error reporter for environments with no reachable console.
 *
 * MiniPay renders miniapps in the device's Android System WebView, and that
 * WebView is not remotely inspectable — with MiniPay running, the only
 * devtools socket on the device is Chrome's. So when the app dies there,
 * Next's "a client-side exception has occurred (see the browser console)"
 * is a dead end: there is no console to see. This is how the parse failure
 * behind #196 was finally read off a handset (see the diagnosis on #204).
 *
 * This installs `onerror` + `unhandledrejection` handlers that paint the
 * message, source and line into a fixed banner, so the failure is readable
 * on the device itself.
 *
 * Opt-in via `?debug=1` — it never runs for normal traffic. Inlined as a
 * raw <script> in the <head> of `app/layout.tsx`, so the HTML parser runs it
 * before any `async` chunk can execute and it depends on nothing else
 * parsing. That is the point: a parse error in a chunk happens before any
 * React error boundary exists, and (measured, see the layout test) before
 * Next's own `beforeInteractive` queue would ever have drained.
 *
 * ES5 only, deliberately: this has to run on the engine it is meant to
 * diagnose (Chrome 80, the support floor tracked in #225). Next down-levels
 * our source but ships an inline string verbatim, so nothing in the build
 * would catch a stray arrow function here — `__tests__/lib/debugErrorOverlay
 * .test.ts` pins the syntax instead.
 *
 * Display-only: nothing is sent anywhere. What it paints is what the engine
 * hands `onerror` / `unhandledrejection`, on the device of the person who
 * opted in.
 */
export const DEBUG_ERROR_OVERLAY = [
  '(function(){',
  // Exact parameter match: `?debug=10` and `?xdebug=1` are not the flag.
  'if(!/[?&]debug=1(&|$)/.test(String(location.search))){return}',
  'var box=null;',
  'function show(kind,msg,src,line){',
  'try{',
  'if(!box){',
  'box=document.createElement("div");',
  'box.setAttribute("style","position:fixed;left:0;right:0;top:0;z-index:2147483647;'
    + 'max-height:60%;overflow:auto;background:#1B1B1B;color:#A7FF05;'
    + 'font:11px/1.45 monospace;padding:8px;border-bottom:2px solid #FF4C00;'
    + 'white-space:pre-wrap;word-break:break-word");',
  '(document.body||document.documentElement).appendChild(box)}',
  'var e=document.createElement("div");',
  'e.setAttribute("style","margin-bottom:8px");',
  'e.appendChild(document.createTextNode(',
  'kind+": "+msg+(src?("\\n  at "+src+(line?(":"+line):"")):"")));',
  'box.appendChild(e)',
  '}catch(ignored){}}',
  'window.onerror=function(msg,src,line){show("ERROR",msg,src,line)};',
  'window.addEventListener("unhandledrejection",function(ev){',
  'var r=ev&&ev.reason;',
  'show("UNHANDLED REJECTION",(r&&(r.stack||r.message))||String(r),"",0)});',
  // Engine report, so a failure comes with the environment that produced it.
  'window.addEventListener("DOMContentLoaded",function(){',
  'show("UA",navigator.userAgent,"",0);',
  'show("HAS",("hasOwn:"+(typeof Object.hasOwn)+" replaceAll:"',
  '+(typeof String.prototype.replaceAll)),"",0)});',
  '})();',
].join('')
