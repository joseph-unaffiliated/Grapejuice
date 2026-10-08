/**
 * Load app TypeScript modules (copy constants, pricing, SEO rules) in plain Node for build
 * scripts. Sucrase strips types; every npm package imported from src/ and all bundled media
 * resolve to inert stubs, so only pure data and helpers are usable.
 */
const Module = require('module');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const STUB = path.join(__dirname, 'nodeStub.cjs');
const MEDIA = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.mp4', '.mov', '.ttf', '.otf', '.woff', '.woff2'];

let registered = false;

function register() {
  if (registered) return;
  registered = true;
  for (const ext of MEDIA) {
    Module._extensions[ext] = (m, filename) => {
      m.exports = { uri: path.relative(ROOT, filename) };
    };
  }
  require('sucrase/register/ts');
  require('sucrase/register/tsx');
  const resolve = Module._resolveFilename;
  Module._resolveFilename = function resolveWithStubs(request, parent, ...rest) {
    const fromApp = parent?.filename?.startsWith(path.join(ROOT, 'src'));
    const bare = !request.startsWith('.') && !path.isAbsolute(request);
    if (fromApp && bare && !Module.isBuiltin(request)) return STUB;
    return resolve.call(this, request, parent, ...rest);
  };
}

/** `loadAppModule('src/constants/seo')` → module exports. */
function loadAppModule(relPath) {
  register();
  return require(path.join(ROOT, relPath));
}

module.exports = { loadAppModule, ROOT };
