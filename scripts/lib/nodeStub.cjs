/**
 * Inert stand-in for native / browser-only packages when app modules load in Node:
 * every property and call returns the stub itself, so module-level setup (zustand stores,
 * contexts, StyleSheet.create) doesn't throw.
 */
const target = function stub() {};
const stub = new Proxy(target, {
  get(_t, key) {
    if (key === '__esModule') return true;
    if (key === Symbol.toPrimitive) return () => '';
    if (key === Symbol.iterator) return function* empty() {};
    if (key === 'then') return undefined;
    if (key === 'Platform') return { OS: 'node', select: (o) => (o ? o.default : undefined) };
    if (key === 'StyleSheet') {
      return { create: (s) => s, flatten: (s) => s, hairlineWidth: 1, absoluteFillObject: {} };
    }
    return stub;
  },
  apply() {
    return stub;
  },
  construct() {
    return stub;
  },
});
module.exports = stub;
