/**
 * webpack loader: down-level dependency JavaScript to the browser support
 * floor, using the SWC binary Next already ships (#225).
 *
 * Next runs SWC over our own source with the browserslist target, but ships
 * `node_modules` as published. `transpilePackages` is not the answer: it
 * matches the named package only, not its dependencies, and the syntax that
 * breaks the floor arrives transitively (`@noble/hashes` via `viem`). This
 * loader is applied by `next.config.mjs` to every `node_modules` script in
 * the client compilation, as a `post` loader so it sees the final module
 * source after Next's own loaders.
 *
 * With `coreJsEntry` set it additionally runs SWC's preset-env in `entry`
 * mode, which rewrites `import 'core-js/stable'` into the specific core-js
 * modules the targets lack — the browserslist-driven polyfill set.
 *
 * CommonJS because webpack `require`s loaders.
 */
const { transform } = require('next/dist/build/swc')

module.exports = function downlevelLoader(source, inputSourceMap) {
  const callback = this.async()
  const { targets, coreJsEntry, coreJsVersion } = this.getOptions()
  if (!targets || Object.keys(targets).length === 0) {
    callback(new Error('downlevel-loader: `targets` option is required (no silent default on the support floor)'))
    return
  }
  transform(source, {
    filename: this.resourcePath,
    sourceFileName: this.resourcePath,
    inputSourceMap: inputSourceMap ? JSON.stringify(inputSourceMap) : undefined,
    sourceMaps: this.sourceMap,
    inlineSourcesContent: this.sourceMap,
    // Let SWC decide script vs module per file: dependencies ship both.
    isModule: 'unknown',
    swcrc: false,
    configFile: false,
    minify: false,
    jsc: {
      parser: { syntax: 'ecmascript', jsx: false },
      loose: false,
      externalHelpers: false,
    },
    env: {
      targets,
      // Private methods and accessors (`#m() {}`, Chrome 84) are above the
      // floor, but SWC's preset-env only rewrites them as part of its
      // class-properties transform, which a `chrome 80` target alone does
      // not enable (measured on #225: 13 private methods from
      // @tanstack/query-core survived). Forcing it rewrites every class
      // field too, which is the price of reaching the floor.
      include: ['transform-class-properties'],
      ...(coreJsEntry ? { mode: 'entry', coreJs: coreJsVersion } : {}),
    },
  }).then(
    (out) => callback(null, out.code, out.map ? JSON.parse(out.map) : undefined),
    (err) => callback(err),
  )
}
