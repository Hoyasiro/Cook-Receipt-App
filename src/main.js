import { createApp } from 'vue'
import { registerSW } from 'virtual:pwa-register'
import App from './App.vue'
import './style.css'

createApp(App).mount('#app')

// ── 새 버전 자동 적용 ──
// 앱을 열거나 다시 볼 때마다 새 버전을 확인한다. 새 서비스워커가 자리를 잡으면 화면을 새로고침해
// 바로 새 버전을 보여준다. 요리 모드(.cook)가 열려 있으면 갑자기 바뀌지 않도록 닫을 때까지 미룬다.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller // 첫 설치 때는 새로고침하지 않는다
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return
    const apply = () => {
      if (document.querySelector('.cook')) return setTimeout(apply, 5000)
      reloading = true
      location.reload()
    }
    apply()
  })

  registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      if (!reg) return
      const check = () => navigator.onLine && reg.update().catch(() => {})
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
      setInterval(check, 30 * 60 * 1000)
    }
  })
}
