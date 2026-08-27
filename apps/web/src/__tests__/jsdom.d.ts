/**
 * `jsdom` is already a devDependency (it is vitest's DOM environment) but it
 * ships no types and `@types/jsdom` is not in the tree. This declares only
 * the sliver `lib/debugErrorOverlay.test.ts` uses — a fresh window per test
 * case, so `window.onerror` and the listeners the overlay installs never
 * leak from one case into the next — without adding a dependency.
 *
 * If `@types/jsdom` is ever added, delete this file: the two would collide.
 */
declare module 'jsdom' {
  export interface JSDOMOptions {
    url?: string
    runScripts?: 'dangerously' | 'outside-only'
  }
  export class JSDOM {
    constructor(html?: string, options?: JSDOMOptions)
    readonly window: Window & typeof globalThis
  }
}
