self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'snooze') {
    // Snooze for 1 hour
    const snoozeTime = new Date().getTime() + (60 * 60 * 1000);
    self.registration.showNotification(event.notification.title, {
      ...event.notification.options,
      timestamp: snoozeTime,
      data: event.notification.data
    });
  } else if (event.action === 'done') {
    // Send message to client to mark task as done
    self.clients.matchAll().then((clients) => {
      clients.forEach((client) => {
        client.postMessage({
          type: 'MAINTENANCE_DONE',
          data: event.notification.data,
          notificationTag: event.notification.tag
        });
      });
    });
  } else {
    // Open the app when clicking the notification
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clientList) => {
        if (clientList.length > 0) {
          return clientList[0].focus();
        }
        return self.clients.openWindow('/');
      })
    );
  }
});

self.addEventListener('notificationclose', (event) => {
  // Log notification close for debugging
  console.log('Notification closed:', event.notification.tag);
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title, {
        body: data.message,
        icon: '/bonsai-icon.png',
        tag: data.tag,
        data: data.data,
        requireInteraction: true,
        actions: [
          { action: 'done', title: 'Mark as Done' },
          { action: 'snooze', title: 'Snooze 1hr' }
        ]
      })
    );
  } catch (error) {
    console.error('Error showing push notification:', error);
  }
});