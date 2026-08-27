// Fixture: everything in here parses on Chrome 80. The string literal is a
// control — a regex-based checker would flag it, a parser must not.
(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([[1], {
  1: function (e, t, n) {
    "use strict";
    const o = n(2);
    const note = "a ||= b and c ??= d live inside a string and must not count";
    class K { static x = 1; #p = 2; get p() { return this.#p } }
    const v = o?.value ?? 1_000;
    try { o() } catch { }
    e.exports = { K, v, note, big: 10n, re: /(?<year>\d{4})/u };
  },
}]);
