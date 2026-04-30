// sw.js — Midzo Flight Service Worker
const CACHE = 'midzo-v1';
const STATIC = [
  '/',
  '/index.html',
  '/logo.png',
  '/images/paris.jpg',
  '/images/dubai.jpg',
  '/images/newyork.jpg',
  '/images/abidjan.jpg',
  '/images/bangkok.jpg',
];

// Install — cache les ressources statiques
self.addEventListener('install', e=>{
  e.waitUntil(
    caches.open(CACHE).then(c=> c.addAll(STATIC).catch(()=>{}))
  );
  self.skipWaiting();
});

// Activate — nettoie les anciens caches
self.addEventListener('activate', e=>{
  e.waitUntil(
    caches.keys().then(keys=>
      Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network first, cache fallback
self.addEventListener('fetch', e=>{
  const url = new URL(e.request.url);

  // API calls → toujours network, jamais cache
  if(url.pathname.startsWith('/api/')) return;

  e.respondWith(
    fetch(e.request)
      .then(res=>{
        // Cache les ressources statiques réussies
        if(res.ok && e.request.method==='GET'){
          const clone = res.clone();
          caches.open(CACHE).then(c=> c.put(e.request, clone));
        }
        return res;
      })
      .catch(()=> caches.match(e.request))
  );
});
