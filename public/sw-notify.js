// 타이머 알림을 누르면 열려 있는 앱으로 돌아가거나 새로 연다 (workbox 서비스워커에 포함됨)
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || self.registration.scope
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.startsWith(self.registration.scope))
      return open ? open.focus() : self.clients.openWindow(url)
    })
  )
})
