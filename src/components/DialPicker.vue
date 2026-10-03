<script setup>
import { computed, ref } from 'vue'

// 시계 다이얼로 분·초를 고르는 팝업. 분을 고르면 자동으로 초 다이얼로 넘어간다.
const props = defineProps({
  minutes: { type: Number, default: 5 },
  seconds: { type: Number, default: 0 },
  startLabel: { type: String, default: '타이머 시작' }
})
const emit = defineEmits(['confirm', 'cancel'])

const min = ref(Math.min(59, Math.max(0, props.minutes)))
const sec = ref(Math.min(59, Math.max(0, props.seconds)))
const mode = ref('min') // 'min' | 'sec'
const value = computed(() => (mode.value === 'min' ? min.value : sec.value))
const total = computed(() => min.value * 60 + sec.value)

// 다이얼 그리기 (viewBox 0..300, 중심 150)
const C = 150
const R_LABEL = 112
const R_HAND = 112
const labels = Array.from({ length: 12 }, (_, i) => {
  const v = i * 5
  const a = (v / 60) * 2 * Math.PI - Math.PI / 2
  return { v, x: C + R_LABEL * Math.cos(a), y: C + R_LABEL * Math.sin(a) }
})
const ticks = Array.from({ length: 60 }, (_, v) => {
  const a = (v / 60) * 2 * Math.PI - Math.PI / 2
  const r1 = v % 5 ? 138 : 134
  return { v, x1: C + r1 * Math.cos(a), y1: C + r1 * Math.sin(a), x2: C + 144 * Math.cos(a), y2: C + 144 * Math.sin(a) }
})
const hand = computed(() => {
  const a = (value.value / 60) * 2 * Math.PI - Math.PI / 2
  return { x: C + R_HAND * Math.cos(a), y: C + R_HAND * Math.sin(a) }
})

// 손가락 위치 → 값
const svg = ref(null)
let dragging = false
function pick(e) {
  const rect = svg.value.getBoundingClientRect()
  const x = ((e.clientX - rect.left) / rect.width) * 300 - C
  const y = ((e.clientY - rect.top) / rect.height) * 300 - C
  let deg = (Math.atan2(y, x) * 180) / Math.PI + 90
  if (deg < 0) deg += 360
  const v = Math.round(deg / 6) % 60
  if (mode.value === 'min') min.value = v
  else sec.value = v
}
function onDown(e) {
  dragging = true
  svg.value.setPointerCapture?.(e.pointerId)
  pick(e)
}
function onMove(e) {
  if (dragging) pick(e)
}
function onUp() {
  if (!dragging) return
  dragging = false
  if (mode.value === 'min') mode.value = 'sec' // 분을 고르면 초로
}
function nudge(d) {
  if (mode.value === 'min') min.value = (min.value + d + 60) % 60
  else sec.value = (sec.value + d + 60) % 60
}
const pad = (n) => String(n).padStart(2, '0')
</script>

<template>
  <div class="dial-backdrop" @click.self="emit('cancel')">
    <div class="dial-box" role="dialog" aria-label="타이머 시간 설정">
      <p class="dial-title">타이머 시간 설정</p>

      <div class="dial-readout">
        <button :class="{ on: mode === 'min' }" aria-label="분 고르기" @click="mode = 'min'">{{ pad(min) }}<small>분</small></button>
        <span>:</span>
        <button :class="{ on: mode === 'sec' }" aria-label="초 고르기" @click="mode = 'sec'">{{ pad(sec) }}<small>초</small></button>
      </div>

      <svg
        ref="svg"
        class="dial"
        viewBox="0 0 300 300"
        @pointerdown.prevent="onDown"
        @pointermove.prevent="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
      >
        <circle :cx="C" :cy="C" r="148" class="dial-face" />
        <line v-for="t in ticks" :key="t.v" :x1="t.x1" :y1="t.y1" :x2="t.x2" :y2="t.y2" class="dial-tick" :class="{ major: t.v % 5 === 0 }" />
        <line :x1="C" :y1="C" :x2="hand.x" :y2="hand.y" class="dial-hand" />
        <circle :cx="C" :cy="C" r="6" class="dial-center" />
        <circle :cx="hand.x" :cy="hand.y" r="24" class="dial-knob" />
        <text
          v-for="l in labels"
          :key="l.v"
          :x="l.x"
          :y="l.y"
          class="dial-label"
          :class="{ sel: l.v === value }"
          text-anchor="middle"
          dominant-baseline="central"
        >
          {{ l.v }}
        </text>
        <text v-if="value % 5" :x="hand.x" :y="hand.y" class="dial-label sel" text-anchor="middle" dominant-baseline="central">
          {{ value }}
        </text>
      </svg>

      <div class="dial-nudge">
        <button aria-label="1 줄이기" @click="nudge(-1)">−1</button>
        <span>{{ mode === 'min' ? '분' : '초' }} 고르는 중 · 돌리거나 눌러서 선택</span>
        <button aria-label="1 늘리기" @click="nudge(1)">+1</button>
      </div>

      <div class="dial-actions">
        <button class="btn ghost" @click="emit('cancel')">취소</button>
        <button class="btn primary" :disabled="!total" @click="emit('confirm', total)">{{ startLabel }}</button>
      </div>
    </div>
  </div>
</template>
