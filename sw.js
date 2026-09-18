const CACHE='flovo-v239';
const ASSETS=['./','./index.html','./styles.css','./app.js','./xlsx.full.min.js','./manifest.webmanifest','./icon.svg','./flovo-wordmark-v3.png','./Import-data_format.xlsx'];
self.addEventListener('install',event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)))});
self.addEventListener('activate',event=>event.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))])));
self.addEventListener('fetch',event=>{if(event.request.method==='GET')event.respondWith(fetch(event.request,{cache:event.request.mode==='navigate'?'no-store':'no-cache'}).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response}).catch(()=>caches.match(event.request)))});
