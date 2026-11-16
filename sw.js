self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch (error) {
    console.error("Could not read the push notification payload.", error);
  }

  event.waitUntil(
    self.registration.showNotification(message.title || "Daylight reminder", {
      body: message.body || "Your unfinished tasks are ready.",
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: message.tag || "daylight-reminder",
      vibrate: [200, 100, 200],
      data: { url: message.url || "/?screen=reminders" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requestedTarget = new URL(
    event.notification.data?.url || "/?screen=reminders",
    self.location.origin
  );
  const target =
    requestedTarget.origin === self.location.origin
      ? requestedTarget
      : new URL("/?screen=reminders", self.location.origin);

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(
      async (clients) => {
        const existing = clients.find(
          (client) => new URL(client.url).origin === target.origin
        );
        if (existing) {
          await existing.navigate(target.href);
          return existing.focus();
        }
        return self.clients.openWindow(target.href);
      }
    )
  );
});
