import { reactive, ref, watch } from 'vue'

// ── 단계 문장에서 시간 찾기 ─────────────────────────
// "2분", "1분 30초", "2~3분"(짧은 쪽), "1시간", "30초간" → 초 단위
const UNIT = { 시간: 3600, 분: 60, 초: 1 }
const TOKEN = /(\d+(?:\.\d+)?)(?:\s*(?:~|-|∼|에서)\s*(\d+(?:\.\d+)?))?\s*(시간|분|초)(?!량|리|해|말|류|쇄|비)/g

export function parseDurations(text) {
  const out = []
  let group = null
  let lastEnd = -1
  for (const m of String(text || '').matchAll(TOKEN)) {
    const lo = Number(m[1])
    const hi = m[2] ? Number(m[2]) : null
    const unit = m[3]
    const between = String(text).slice(lastEnd, m.index)
    // "1분 30초"처럼 바로 붙어 있으면 하나로 합친다
    if (group && lastEnd >= 0 && /^\s*$/.test(between) && UNIT[unit] < group.lastUnit) {
      group.seconds += lo * UNIT[unit]
      group.label += ` ${m[0].trim()}`
      group.lastUnit = UNIT[unit]
    } else {
      group = { seconds: lo * UNIT[unit], label: m[0].trim(), lastUnit: UNIT[unit], range: hi != null }
      out.push(group)
    }
    lastEnd = m.index + m[0].length
  }
  return out
    .filter((g) => g.seconds >= 5 && g.seconds <= 12 * 3600)
    .map(({ seconds, label }) => ({ seconds: Math.round(seconds), label }))
    .filter((g, i, arr) => arr.findIndex((x) => x.seconds === g.seconds) === i)
}

export function formatRemaining(sec) {
  const s = Math.max(0, Math.ceil(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const pad = (n) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`
}

export function formatDuration(sec) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return [h && `${h}시간`, m && `${m}분`, s && `${s}초`].filter(Boolean).join(' ') || '0초'
}

// ── 실행 중인 타이머 (앱을 껐다 켜도 이어지도록 종료 시각으로 저장) ──
const KEY = 'cook-recipes:timers'
function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
export const timers = reactive(load())
export const now = ref(Date.now())
watch(timers, (v) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(v))
  } catch {
    /* 무시 */
  }
}, { deep: true })

export function remaining(t) {
  return Math.max(0, (t.endAt - now.value) / 1000)
}

/** 알림 권한을 묻는다 (처음 한 번). 허용되면 true */
export async function ensureNotifyPermission() {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  try {
    return (await Notification.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

export function startTimer({ recipeId, recipeTitle, step = null, seconds, label }) {
  const t = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    recipeId,
    recipeTitle: recipeTitle || '레시피',
    step,
    seconds,
    label: label || formatDuration(seconds),
    endAt: Date.now() + seconds * 1000,
    fired: false
  }
  timers.push(t)
  ensureNotifyPermission()
  unlockAudio()
  tick()
  return t
}

export function cancelTimer(id) {
  const i = timers.findIndex((t) => t.id === id)
  if (i >= 0) timers.splice(i, 1)
  if (!timers.some((t) => t.fired)) stopAlarm()
}

export function cancelRecipeTimers(recipeId) {
  for (const t of timers.filter((x) => x.recipeId === recipeId)) cancelTimer(t.id)
}

/** 울리고 있는 알람을 모두 끄고 끝난 타이머를 지운다 */
export function dismissFired() {
  for (const t of timers.filter((x) => x.fired)) cancelTimer(t.id)
  stopAlarm()
}

export const ringing = ref(false)

// ── 종료 처리: 시스템 알림(카톡처럼) + 알람음 + 진동 + 음성 ──
async function fire(t) {
  t.fired = true
  ringing.value = true
  const step = t.step != null ? ` · ${t.step + 1}단계` : ''
  const title = '⏰ 타이머 끝!'
  const body = `${t.recipeTitle}${step} (${t.label})`
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const reg = await navigator.serviceWorker?.getRegistration()
      const options = {
        body,
        tag: t.id,
        renotify: true,
        requireInteraction: true,
        vibrate: [400, 200, 400, 200, 800],
        icon: new URL('icon-192.png', document.baseURI).href,
        badge: new URL('icon-192.png', document.baseURI).href,
        data: { url: location.href.split('?')[0] }
      }
      if (reg) await reg.showNotification(title, options)
      else new Notification(title, options)
    }
  } catch {
    /* 알림 실패해도 앱 안 알람은 울린다 */
  }
  startAlarm(`${t.recipeTitle}${step} 타이머가 끝났어요`)
}

let interval = null
function tick() {
  now.value = Date.now()
  for (const t of timers) if (!t.fired && t.endAt <= now.value) fire(t)
  if (timers.some((t) => !t.fired)) {
    interval ||= setInterval(tick, 500)
  } else if (interval) {
    clearInterval(interval)
    interval = null
  }
}
if (typeof document !== 'undefined') {
  // 앱을 다시 열었을 때 그 사이 끝난 타이머를 바로 알린다
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && tick())
  tick()
}

// ── 알람음 (Web Audio, 확인할 때까지 최대 1분 반복) ──
let ctx = null
let alarmTimer = null
function unlockAudio() {
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume()
  } catch {
    /* 무시 */
  }
}
function beep(at, freq) {
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = 'sine'
  o.frequency.value = freq
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(0.6, at + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.25)
  o.connect(g).connect(ctx.destination)
  o.start(at)
  o.stop(at + 0.3)
}
function startAlarm(sayText) {
  stopAlarm()
  ringing.value = true
  const started = Date.now()
  let spoke = false
  const ring = () => {
    if (Date.now() - started > 60000) return stopAlarm(false)
    try {
      unlockAudio()
      const t0 = ctx.currentTime
      ;[0, 0.3, 0.6].forEach((d, i) => beep(t0 + d, i === 2 ? 1320 : 880))
    } catch {
      /* 무시 */
    }
    navigator.vibrate?.([400, 200, 400])
    if (!spoke && 'speechSynthesis' in window) {
      spoke = true
      setTimeout(() => {
        const u = new SpeechSynthesisUtterance(sayText)
        u.lang = 'ko-KR'
        speechSynthesis.speak(u)
      }, 1000)
    }
  }
  ring()
  alarmTimer = setInterval(ring, 2500)
}
export function stopAlarm(clear = true) {
  clearInterval(alarmTimer)
  alarmTimer = null
  navigator.vibrate?.(0)
  if (clear) ringing.value = false
}
