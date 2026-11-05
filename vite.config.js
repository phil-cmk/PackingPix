import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { createHash } from 'node:crypto';

function offlineBundle() {
  return {
    name: 'packlane-offline',
    enforce: 'post',
    generateBundle(_, bundle) {
      const names = [...Object.keys(bundle), 'index.html', 'icon.svg', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest', 'timepix-school-logo.png', 'timepix-template.csv', 'timepix-sample.csv'];
      const version = createHash('sha256').update(Object.values(bundle).map(x => x.type === 'chunk' ? x.code : String(x.source)).join('')).digest('hex').slice(0, 12);
      this.emitFile({type: 'asset', fileName: 'sw.js', source: `
const PREFIX = 'packlane:' + new URL('.', self.location.href).pathname + ':';
const CACHE = PREFIX + '${version}';
const ASSETS = ${JSON.stringify([...new Set(names)])};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(event.request, {ignoreSearch: true});
    if (cached) return cached;
    if (event.request.mode === 'navigate') return cache.match(new URL('index.html', self.registration.scope));
    return fetch(event.request);
  }));
});
`});
    }
  };
}
export default defineConfig({base: './', plugins: [tailwindcss(), offlineBundle()], build: {target: 'es2022'}});