self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  notification.close();

  if (event.action === 'snooze') {
    // Snooze for 1 hour
    const snoozeTime = new Date().getTime() + (60 * 60 * 1000);
    
    event.waitUntil(
      self.registration.showNotification(notification.title, {
        ...notification.options,
        showTrigger: new TimestampTrigger(snoozeTime),
        tag: notification.tag
      })
    );
  } else if (event.action === 'done') {
    // Send message to client to mark task as done
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'MAINTENANCE_DONE',
            data: notification.data,
            notificationTag: notification.tag
          });
        });
      })
    );
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

// Handle notification close
self.addEventListener('notificationclose', (event) => {
  // Optional: Track when notifications are dismissed
  console.log('Notification closed', event.notification.tag);
});

// Handle scheduled notifications
self.addEventListener('notificationtrigger', (event) => {
  const notification = event.notification;
  const data = notification.data;
  
  // Schedule next notification
  if (data?.nextScheduled) {
    const nextDate = new Date(data.nextScheduled);
    if (nextDate > new Date()) {
      self.registration.showNotification(notification.title, {
        ...notification.options,
        showTrigger: new TimestampTrigger(nextDate.getTime())
      });
    }
  }
});