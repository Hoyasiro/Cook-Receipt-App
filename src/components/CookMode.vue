<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { youtubeId, SOURCE_LABEL } from '../lib/recipes.js'
import { fetchRecipeContent } from '../lib/content.js'
import { createVoiceListener, isVoiceSupported, speak } from '../lib/voice.js'
import { updateRecipe } from '../lib/store.js'

const props = defineProps({ recipe: { type: Object, required: true } })
const emit = defineEmits(['close'])

const VOICE_PREF = 'cook-recipes:voice'
const body = ref(null)
const ytId = youtubeId(props.recipe.url)

// ── 레시피 내용 (웹 레시피만) ──
const content = ref(props.recipe.content || null)
const loading = ref(false)
const failed = ref(false)
const step = ref(-1)
const steps = computed(() => content.value?.steps || [])

async function loadContent(force = false) {
  if (ytId || (content.value && !force)) return
  loading.value = true
  failed.value = false
  const c = await fetchRecipeContent(props.recipe.url)
  loading.value = false
  if (c) {
    content.value = c
    updateRecipe(props.recipe.id, { content: c })
  } else failed.value = true
}

// ── 유튜브 플레이어 ──
const playerEl = ref(null)
let player = null
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve()
  return new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev?.()
      resolve()
    }
    if (!document.querySelector('script[data-yt-api]')) {
      const s = document.createElement('script')
      s.src = 'https://www.youtube.com/iframe_api'
      s.dataset.ytApi = '1'
      document.head.appendChild(s)
    }
  })
}
async function initPlayer() {
  if (!ytId) return
  await loadYouTubeApi()
  if (!playerEl.value) return
  player = new window.YT.Player(playerEl.value, {
    videoId: ytId,
    playerVars: { playsinline: 1, rel: 0 }
  })
}
function seek(delta) {
  if (!player?.getCurrentTime) return
  player.seekTo(Math.max(0, player.getCurrentTime() + delta), true)
}

// ── 스크롤 · 단계 ──
function scrollPage(dir) {
  const el = body.value
  if (el) el.scrollBy({ top: dir * el.clientHeight * 0.6, behavior: 'smooth' })
}
function scrollEdge(top) {
  const el = body.value
  if (el) el.scrollTo({ top: top ? 0 : el.scrollHeight, behavior: 'smooth' })
}
async function goStep(i) {
  if (!steps.value.length) return false
  step.value = Math.min(Math.max(i, 0), steps.value.length - 1)
  await nextTick()
  body.value?.querySelector(`[data-step="${step.value}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  return true
}
async function read() {
  let text = ''
  if (steps.value.length) {
    if (step.value < 0) await goStep(0)
    text = `${step.value + 1}단계. ${steps.value[step.value].text}`
  } else if (content.value?.ingredients?.length) {
    text = `재료. ${content.value.ingredients.join(', ')}`
  }
  if (!text) return
  voice?.pause()
  await speak(text)
  voice?.resume()
}

// ── 음성 명령 ──
const voiceSupported = isVoiceSupported()
const listening = ref(false)
const heard = ref('')
const voiceError = ref('')
let voice = null

async function onCommand(action) {
  flash.value = action
  setTimeout(() => (flash.value = ''), 900)
  switch (action) {
    case 'down': return scrollPage(1)
    case 'up': return scrollPage(-1)
    case 'top': return scrollEdge(true)
    case 'bottom': return scrollEdge(false)
    case 'nextStep': return (await goStep(step.value + 1)) || scrollPage(1)
    case 'prevStep': return (await goStep(step.value - 1)) || scrollPage(-1)
    case 'read': return read()
    case 'play': return player?.playVideo?.()
    case 'pause': return player?.pauseVideo?.()
    case 'rewind': return player ? seek(-10) : scrollPage(-1)
    case 'forward': return player ? seek(10) : scrollPage(1)
    case 'close': return emit('close')
    case 'stop': return toggleVoice(false)
  }
}
const flash = ref('')
const ACTION_LABEL = {
  down: '⬇ 내려요', up: '⬆ 올려요', top: '⏫ 맨 위', bottom: '⏬ 맨 아래', nextStep: '▶ 다음 단계',
  prevStep: '◀ 이전 단계', read: '🔊 읽어요', play: '▶ 재생', pause: '⏸ 멈춤', rewind: '⏪ 10초 뒤로',
  forward: '⏩ 10초 앞으로', close: '닫기', stop: '🎤 끔'
}

function toggleVoice(on = !listening.value) {
  try {
    localStorage.setItem(VOICE_PREF, on ? '1' : '0')
  } catch {
    /* 무시 */
  }
  if (!voice) return
  if (on) voice.start()
  else voice.stop()
}

// ── 화면 꺼짐 방지 ──
let wakeLock = null
async function keepAwake() {
  try {
    if (document.visibilityState === 'visible') wakeLock = await navigator.wakeLock?.request('screen')
  } catch {
    /* 지원 안 함 */
  }
}
function onVisible() {
  if (document.visibilityState === 'visible') keepAwake()
}

onMounted(() => {
  loadContent()
  initPlayer()
  keepAwake()
  document.addEventListener('visibilitychange', onVisible)
  if (voiceSupported) {
    voice = createVoiceListener({
      onCommand,
      onState: (s) => {
        if ('listening' in s) listening.value = s.listening
        if (s.heard) heard.value = s.heard
        if (s.error !== undefined) voiceError.value = s.error
      }
    })
    let pref = '0'
    try {
      pref = localStorage.getItem(VOICE_PREF) || '0'
    } catch {
      /* 무시 */
    }
    if (pref === '1') voice.start()
  }
})
onUnmounted(() => {
  voice?.stop()
  speechSynthesis?.cancel?.()
  wakeLock?.release?.().catch(() => {})
  document.removeEventListener('visibilitychange', onVisible)
  player?.destroy?.()
})
</script>

<template>
  <div class="cook" role="dialog" aria-label="요리 모드">
    <header class="cook-head">
      <button class="icon-btn" aria-label="닫기" @click="emit('close')">←</button>
      <h2>{{ props.recipe.title || '레시피' }}</h2>
      <button
        v-if="voiceSupported"
        class="mic"
        :class="{ on: listening }"
        :aria-label="listening ? '음성 명령 끄기' : '음성 명령 켜기'"
        @click="toggleVoice()"
      >
        🎤
      </button>
    </header>

    <div v-if="listening || voiceError" class="voice-bar" :class="{ err: voiceError }">
      <template v-if="voiceError">{{ voiceError }}</template>
      <template v-else>
        <span class="dot" /> 듣는 중 · “내려” “올려” “다음 단계” “읽어 줘”<template v-if="ytId"> “재생” “멈춰” “뒤로”</template>
        <small v-if="heard" class="heard">들은 말: {{ heard }}</small>
      </template>
    </div>
    <Transition name="fade"><div v-if="flash" class="flash">{{ ACTION_LABEL[flash] }}</div></Transition>

    <div ref="body" class="cook-body">
      <div v-if="ytId" class="player"><div ref="playerEl" /></div>

      <p v-if="props.recipe.memo" class="memo-box">📝 {{ props.recipe.memo }}</p>

      <template v-if="!ytId">
        <p v-if="loading" class="muted center">레시피 내용을 가져오는 중…</p>

        <template v-else-if="content?.ingredients || content?.steps">
          <section v-if="content.ingredients?.length" class="ingredients">
            <h3>재료</h3>
            <ul>
              <li v-for="(it, i) in content.ingredients" :key="i">{{ it }}</li>
            </ul>
          </section>
          <section v-if="steps.length" class="steps">
            <h3>조리 순서</h3>
            <ol>
              <li
                v-for="(s, i) in steps"
                :key="i"
                :data-step="i"
                :class="{ current: i === step }"
                @click="goStep(i)"
              >
                <span class="no">{{ i + 1 }}</span>
                <div>
                  <p>{{ s.text }}</p>
                  <img v-if="s.image" :src="s.image" alt="" loading="lazy" referrerpolicy="no-referrer" />
                </div>
              </li>
            </ol>
          </section>
        </template>

        <pre v-else-if="content?.text" class="plain">{{ content.text }}</pre>

        <div v-else-if="failed" class="empty">
          <p>이 레시피 내용은 앱 안에서 보여줄 수 없었어요.</p>
          <button class="btn ghost" @click="loadContent(true)">다시 시도</button>
        </div>
      </template>

      <a class="btn ghost block" :href="props.recipe.url" target="_blank" rel="noopener">
        {{ SOURCE_LABEL[props.recipe.source] }}에서 원본 열기 ↗
      </a>
      <p v-if="!voiceSupported" class="muted center small-note">이 브라우저는 음성 명령을 지원하지 않아요. 크롬에서 열어 주세요.</p>
    </div>
  </div>
</template>
