const CACHE_NAME    = 'bible-pwa-v2';
const SETTINGS_KEY  = 'bible-settings-v1';
const ASSETS = [
  '/Unjourunebible/',
  '/Unjourunebible/index.html',
  '/Unjourunebible/manifest.json',
  '/Unjourunebible/icon.svg'
];

/* ── Installation ── */
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS).catch(() => {})));
  self.skipWaiting();
});

/* ── Activation ── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME && k !== SETTINGS_KEY).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => checkAndNotify())
  );
});

/* ── Fetch (cache-first) ── */
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

/* ── Message depuis la page (sauvegarde l'heure de rappel) ── */
self.addEventListener('message', async e => {
  if (e.data && e.data.type === 'SET_NOTIF_TIME') {
    const cache = await caches.open(SETTINGS_KEY);
    await cache.put('notif-time', new Response(e.data.time));
    await cache.delete('notif-sent-date'); // reset pour aujourd'hui
    await checkAndNotify();
  }
  if (e.data && e.data.type === 'MARK_READ') {
    const cache = await caches.open(SETTINGS_KEY);
    await cache.put('notif-sent-date', new Response(e.data.date));
  }
});

/* ── Periodic Background Sync (Android Chrome) ── */
self.addEventListener('periodicsync', e => {
  if (e.tag === 'daily-verse') e.waitUntil(checkAndNotify());
});

/* ── Clic sur la notification ── */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes('Unjourunebible')) return c.focus();
      }
      return clients.openWindow('/Unjourunebible/');
    })
  );
});

/* ── Logique de notification ── */
async function checkAndNotify() {
  const cache      = await caches.open(SETTINGS_KEY);
  const timeResp   = await cache.match('notif-time');
  const sentResp   = await cache.match('notif-sent-date');

  const notifTime  = timeResp ? await timeResp.text() : '07:00';
  const sentDate   = sentResp ? await sentResp.text() : '';

  const now   = new Date();
  const today = now.toISOString().split('T')[0];
  if (sentDate === today) return;

  const [h, m] = notifTime.split(':').map(Number);
  const target  = new Date(now);
  target.setHours(h, m, 0, 0);
  if (now < target) return;

  await self.registration.showNotification('✝ Votre verset du jour', {
    body: 'Prenez un moment pour lire la Parole avant de commencer votre journée.',
    icon: '/Unjourunebible/icon.svg',
    badge: '/Unjourunebible/icon.svg',
    tag: 'daily-verse',
    renotify: false,
    requireInteraction: false,
  });

  const c = await caches.open(SETTINGS_KEY);
  await c.put('notif-sent-date', new Response(today));
}
