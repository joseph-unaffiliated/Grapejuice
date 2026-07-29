#!/usr/bin/env node
/**
 * Post-install: add CSP header to Expo CLI's web HTML response so Metro dev
 * (eval/HMR) and Unsplash API work in the browser. Run after npm install.
 *
 * If the target file is not found (e.g. Expo 54 uses public/index.html only),
 * this script exits silently. The app's public/index.html already includes
 * connect-src https://api.unsplash.com and img-src https://images.unsplash.com.
 */
const path = require('path');
const fs = require('fs');

const appRoot = path.join(__dirname, '..');
const possiblePaths = [
  path.join(appRoot, 'node_modules', 'expo', 'node_modules', '@expo', 'cli', 'build', 'src', 'start', 'server', 'middleware', 'ManifestMiddleware.js'),
  path.join(appRoot, 'node_modules', '@expo', 'cli', 'build', 'src', 'start', 'server', 'middleware', 'ManifestMiddleware.js'),
];

// Same as public/index.html CSP but single-line for header: allow Unsplash API + images
const cspValue =
  "default-src 'self' 'unsafe-inline' 'unsafe-eval'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com; connect-src 'self' https://*.googleapis.com https://*.google.com https://*.firebaseio.com wss://*.firebaseio.com https://*.cloudfunctions.net https://accounts.google.com https://api.unsplash.com https://api.stripe.com https://*.stripe.com; frame-src 'self' https://js.stripe.com https://hooks.stripe.com; img-src 'self' data: blob: https://images.unsplash.com https://placehold.co https://*.stripe.com https://*.googleusercontent.com https://storage.googleapis.com https://*.firebasestorage.app https://firebasestorage.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com;";

const cacheControlLine =
  "res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');";
const searchNoCsp =
  "res.setHeader('Content-Type', 'text/html');\n        res.end(await this.getSingleHtmlTemplateAsync());";
const replaceNoCsp = `res.setHeader('Content-Type', 'text/html');
        ${cacheControlLine}
        res.setHeader('Content-Security-Policy', "${cspValue}");
        res.end(await this.getSingleHtmlTemplateAsync());`;

const searchWithCsp =
  /(res\.setHeader\('Content-Type', 'text\/html'\);)[\s\S]*?(res\.setHeader\('Content-Security-Policy', "[^"]*"\);)/;

let targetPath = null;
for (const p of possiblePaths) {
  if (fs.existsSync(p)) {
    targetPath = p;
    break;
  }
}

if (!targetPath) {
  console.warn('patch-expo-csp: ManifestMiddleware.js not found (Expo may use public/index.html only). Skipping.');
  process.exit(0);
}

let content = fs.readFileSync(targetPath, 'utf8');
if (content.includes('Content-Security-Policy')) {
  const updated = content.replace(searchWithCsp, (_, contentTypeLine) => {
    return `${contentTypeLine}
        ${cacheControlLine}
        res.setHeader('Content-Security-Policy', "${cspValue}");`;
  });
  if (updated === content) {
    console.warn('patch-expo-csp: Could not update existing CSP block.');
    process.exit(0);
  }
  content = updated;
} else if (content.includes(searchNoCsp)) {
  content = content.replace(searchNoCsp, replaceNoCsp);
} else {
  console.warn('patch-expo-csp: Expected snippet not found in', targetPath, '- skipping.');
  process.exit(0);
}

fs.writeFileSync(targetPath, content);
console.log('patch-expo-csp: Applied CSP header (including api.unsplash.com) for Expo web.');
