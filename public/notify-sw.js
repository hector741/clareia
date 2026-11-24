// Service worker mínimo do Clareia: existe só para mostrar as notificações do Pomodoro
// em navegadores que não aceitam `new Notification()` (celular). Não intercepta
// requisições nem guarda nada em cache.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((w) => 'focus' in w);
      if (existing) return existing.focus();
      return self.clients.openWindow(self.registration.scope);
    }),
  );
});
