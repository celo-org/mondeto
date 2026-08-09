/**
 * On-screen error reporter for environments with no reachable console.
 *
 * MiniPay renders miniapps in the device's Android System WebView, and that
 * WebView is not remotely inspectable — with MiniPay running, the only
 * devtools socket on the device is Chrome's. So when the app dies there,
 * Next's "a client-side exception has occurred (see the browser console)"
 * is a dead end: there is no console to see.
 *
 * This installs `onerror` + `unhandledrejection` handlers that paint the
 * message, source and line into a fixed banner, so the failure is readable
 * on the device itself.
 *
 * Opt-in via `?debug=1` — it never runs for normal traffic. Inlined right
 * after the legacy shim (see `app/layout.tsx`) so it is armed before any
 * chunk evaluates and catches failures during bundle execution, which is
 * exactly where old engines break.
 *
 * ES5 only, same constraint as `legacyShim.ts`: this has to run on the
 * engines it is meant to diagnose.
 */
export const DEBUG_ERROR_OVERLAY = [
  '(function(){',
  'if(String(location.search).indexOf("debug=1")===-1){return}',
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
