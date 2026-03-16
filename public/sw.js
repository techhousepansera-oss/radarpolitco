// BOW 360 — Service Worker v3
// Estratégia: Network-first para HTML, Cache-first para assets imutáveis (JS/CSS com hash)

const CACHE_NAME = 'bow360-v3'

self.addEventListener('install', (event) => {
  // Não pré-cacheia nada — evita servir HTML obsoleto
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // Remove caches antigos (incluindo o bow360-v2 que causava o bug)
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)

  // Supabase e APIs externas: sempre rede
  if (url.hostname.includes('supabase.co')) return
  if (url.hostname.includes('nominatim.openstreetmap.org')) return
  if (url.hostname !== self.location.hostname) return

  // HTML (/, /index.html, /login, /analytics etc): sempre rede primeiro
  // Isso garante que o browser sempre receba o HTML atualizado após cada deploy
  if (!url.pathname.includes('/assets/')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/index.html'))
    )
    return
  }

  // Arquivos /assets/* têm hash no nome (imutáveis): cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      })
    })
  )
})
