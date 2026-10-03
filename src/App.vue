<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import RecipeCard from './components/RecipeCard.vue'
import RecipeForm from './components/RecipeForm.vue'
import ImportPanel from './components/ImportPanel.vue'
import Sheet from './components/Sheet.vue'
import Thumb from './components/Thumb.vue'
import { CATEGORIES, matchesQuery, parseShare, SOURCE_LABEL } from './lib/recipes.js'
import { addRecipe, fillMissingMeta, findByUrl, markOpened, removeRecipe, state, updateRecipe } from './lib/store.js'

const query = ref('')
const filter = ref('전체') // 전체 | ★ | 카테고리
const sort = ref('recent') // recent | opened | name

const SORTS = { recent: '최근 추가', opened: '최근 본', name: '이름순' }

const counts = computed(() => {
  const c = {}
  for (const r of state.recipes) c[r.category] = (c[r.category] || 0) + 1
  return c
})
const filters = computed(() => {
  const extra = Object.keys(counts.value).filter((c) => !CATEGORIES.includes(c))
  return ['전체', '★', ...CATEGORIES, ...extra].filter((c) => c === '전체' || c === '★' || counts.value[c])
})

const visible = computed(() => {
  let list = state.recipes.filter((r) => matchesQuery(r, query.value))
  if (filter.value === '★') list = list.filter((r) => r.favorite)
  else if (filter.value !== '전체') list = list.filter((r) => r.category === filter.value)
  const by = {
    recent: (a, b) => b.createdAt - a.createdAt,
    opened: (a, b) => (b.openedAt || 0) - (a.openedAt || 0) || b.createdAt - a.createdAt,
    name: (a, b) => (a.title || '').localeCompare(b.title || '', 'ko')
  }[sort.value]
  return [...list].sort((a, b) => (b.favorite && sort.value !== 'name') - (a.favorite && sort.value !== 'name') || by(a, b))
})

// ── 모달 (안드로이드 뒤로가기 버튼으로 닫히도록 history 와 연동) ──
const modal = ref(null) // { type: 'form'|'import'|'menu'|'pick'|'voice', ... }

function openModal(m) {
  if (!modal.value) history.pushState({ modal: true }, '')
  modal.value = m
}
function closeModal() {
  if (!modal.value) return
  if (history.state?.modal) history.back()
  else modal.value = null
}
function onPopState() {
  modal.value = null
}

// ── 토스트 ──
const toast = ref('')
let toastTimer
function showToast(msg) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 2600)
}

// ── 동작 ──
function onOpen(recipe) {
  markOpened(recipe.id)
}
function onFavorite(recipe) {
  updateRecipe(recipe.id, { favorite: !recipe.favorite })
}
function onSave(data) {
  const editing = modal.value?.recipe
  if (editing) {
    updateRecipe(editing.id, data)
    showToast('저장했어요')
  } else {
    const { created } = addRecipe(data)
    showToast(created ? '레시피를 추가했어요' : '이미 등록된 링크예요')
  }
  closeModal()
}
function onRemove(recipe) {
  if (!confirm(`'${recipe.title || '이 레시피'}'를 삭제할까요?`)) return
  removeRecipe(recipe.id)
  closeModal()
  showToast('삭제했어요')
}

function pickRandom(excludeId) {
  const pool = visible.value.length ? visible.value : state.recipes
  const candidates = pool.length > 1 ? pool.filter((r) => r.id !== excludeId) : pool
  if (!candidates.length) {
    showToast('먼저 레시피를 추가해 주세요')
    return
  }
  const r = candidates[Math.floor(Math.random() * candidates.length)]
  openModal({ type: 'pick', recipe: r, title: '오늘 뭐 먹지?' })
}

// ── 시작 시 주소 파라미터 처리 (공유하기 · 바로가기 · 빅스비 딥링크) ──
function handleLaunchParams() {
  const p = new URLSearchParams(location.search)
  if (![...p.keys()].length) return
  history.replaceState(null, '', location.pathname)

  const shared = parseShare({ title: p.get('title'), text: p.get('text'), url: p.get('url') })
  if (shared) {
    const exists = findByUrl(shared.url)
    if (exists) openModal({ type: 'pick', recipe: exists, title: '이미 등록된 레시피예요' })
    else openModal({ type: 'form', prefill: shared })
    return
  }
  if (p.get('add')) return openModal({ type: 'form' })
  if (p.get('random')) return pickRandom()
  const q = p.get('q')
  if (q) {
    query.value = q
    const hits = state.recipes.filter((r) => matchesQuery(r, q))
    if (hits.length === 1) openModal({ type: 'pick', recipe: hits[0], title: `‘${q}’ 레시피` })
  }
}

// ── 앱 설치 (크롬의 설치 창을 버튼으로 띄운다) ──
const installPrompt = ref(null)
const installed = ref(window.matchMedia?.('(display-mode: standalone)').matches)
function onBeforeInstall(e) {
  e.preventDefault()
  installPrompt.value = e
}
function onInstalled() {
  installPrompt.value = null
  installed.value = true
  showToast('설치했어요! 홈 화면의 요리 레시피 아이콘으로 여세요')
}
window.addEventListener('beforeinstallprompt', onBeforeInstall)
window.addEventListener('appinstalled', onInstalled)

async function install() {
  if (!installPrompt.value) {
    openModal({ type: 'install' })
    return
  }
  installPrompt.value.prompt()
  await installPrompt.value.userChoice.catch(() => {})
  installPrompt.value = null
}

onMounted(() => {
  window.addEventListener('popstate', onPopState)
  handleLaunchParams()
  fillMissingMeta()
})
onUnmounted(() => {
  window.removeEventListener('popstate', onPopState)
  window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  window.removeEventListener('appinstalled', onInstalled)
})

watch(filters, (f) => {
  if (!f.includes(filter.value)) filter.value = '전체'
})

const appUrl = computed(() => location.origin + location.pathname)
</script>

<template>
  <header class="top">
    <div class="title-row">
      <h1>🍳 요리 레시피 <small>{{ state.recipes.length }}</small></h1>
      <span class="spacer" />
      <button v-if="!installed" class="btn primary small" @click="install">📲 앱 설치</button>
      <button class="icon-btn" aria-label="메뉴" @click="openModal({ type: 'menu' })">☰</button>
    </div>
    <div class="search">
      <input v-model="query" type="search" placeholder="요리 이름·메모 검색" enterkeyhint="search" />
      <button v-if="query" class="icon-btn" aria-label="검색어 지우기" @click="query = ''">✕</button>
    </div>
    <nav class="chips scroll">
      <button v-for="f in filters" :key="f" class="chip" :class="{ active: filter === f }" @click="filter = f">
        {{ f === '★' ? '★ 즐겨찾기' : f }}
        <small v-if="counts[f]">{{ counts[f] }}</small>
      </button>
    </nav>
  </header>

  <main>
    <div v-if="state.recipes.length" class="toolbar">
      <select v-model="sort" aria-label="정렬">
        <option v-for="(label, k) in SORTS" :key="k" :value="k">{{ label }}</option>
      </select>
      <button class="btn ghost small" @click="pickRandom()">🎲 오늘 뭐 먹지?</button>
    </div>

    <div v-if="!state.recipes.length" class="empty">
      <p class="big">아직 레시피가 없어요</p>
      <p>유튜브나 만개의레시피에서 <b>공유 → 요리 레시피</b>를 누르거나<br />아래 <b>＋</b> 버튼으로 링크를 추가하세요.</p>
      <button class="btn primary" @click="openModal({ type: 'import' })">삼성 노트에서 한 번에 가져오기</button>
    </div>
    <p v-else-if="!visible.length" class="empty">조건에 맞는 레시피가 없어요</p>

    <div class="grid">
      <RecipeCard
        v-for="r in visible"
        :key="r.id"
        :recipe="r"
        @open="onOpen"
        @favorite="onFavorite"
        @edit="openModal({ type: 'form', recipe: r })"
      />
    </div>
  </main>

  <button class="fab" aria-label="레시피 추가" @click="openModal({ type: 'form' })">＋</button>

  <Transition name="fade">
    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
  </Transition>

  <!-- 추가 / 편집 -->
  <Sheet v-if="modal?.type === 'form'" :title="modal.recipe ? '레시피 편집' : '레시피 추가'" @close="closeModal">
    <RecipeForm :recipe="modal.recipe" :prefill="modal.prefill" @save="onSave" @remove="onRemove" @cancel="closeModal" />
  </Sheet>

  <!-- 가져오기 / 백업 -->
  <Sheet v-if="modal?.type === 'import'" title="가져오기 · 백업" @close="closeModal">
    <ImportPanel @done="closeModal" @toast="showToast" />
  </Sheet>

  <!-- 랜덤 추천 · 딥링크 결과 -->
  <Sheet v-if="modal?.type === 'pick'" :title="modal.title" @close="closeModal">
    <div class="pick">
      <Thumb class="big" :recipe="modal.recipe" />
      <h3>{{ modal.recipe.title || '이름 없는 레시피' }}</h3>
      <p class="muted">{{ modal.recipe.category }} · {{ SOURCE_LABEL[modal.recipe.source] }}</p>
      <p v-if="modal.recipe.memo" class="memo-box">{{ modal.recipe.memo }}</p>
      <a class="btn primary block" :href="modal.recipe.url" target="_blank" rel="noopener" @click="onOpen(modal.recipe)">
        레시피 열기
      </a>
      <button v-if="modal.title === '오늘 뭐 먹지?'" class="btn ghost block" @click="pickRandom(modal.recipe.id)">
        🎲 다른 거 추천
      </button>
    </div>
  </Sheet>

  <!-- 메뉴 -->
  <Sheet v-if="modal?.type === 'menu'" title="메뉴" @close="closeModal">
    <div class="menu">
      <button class="btn ghost block" @click="modal = { type: 'import' }">📋 삼성 노트에서 가져오기 · 백업</button>
      <button class="btn ghost block" @click="modal = { type: 'voice' }">🎙️ 음성으로 앱 열기 설정</button>
    </div>
  </Sheet>

  <!-- 설치 안내 (설치 창을 띄울 수 없을 때) -->
  <Sheet v-if="modal?.type === 'install'" title="앱 설치하기" @close="closeModal">
    <div class="guide">
      <ol>
        <li>크롬 오른쪽 위 <b>⋮</b> 를 누르세요.</li>
        <li><b>설치 및 바로가기 만들기</b> (또는 <b>앱 설치</b>) → <b>설치</b></li>
        <li>홈 화면에 생긴 <b>요리 레시피</b> 아이콘으로 여세요.</li>
      </ol>
      <p class="muted">삼성 인터넷이 아니라 <b>크롬</b>에서 열어야 “공유 → 요리 레시피”가 나타나요.</p>
    </div>
  </Sheet>

  <!-- 빅스비 설정 안내 -->
  <Sheet v-if="modal?.type === 'voice'" title="음성으로 앱 열기" @close="closeModal">
    <div class="guide">
      <ol>
        <li><b>먼저 앱 설치:</b> 크롬에서 이 페이지를 열고 <b>⋮ → 설치 및 바로가기 만들기 → 설치</b>를 누르세요.</li>
        <li>
          바로 <b>"하이 빅스비, 요리 레시피 열어줘"</b>라고 말해도 열려요.
        </li>
        <li>
          내 말투로 부르려면 <b>빅스비 → 설정 → 빠른 명령어 → ＋</b>
          <ul>
            <li>명령어: <code>요리를 시작해 볼게</code></li>
            <li>빅스비가 할 일: <code>요리 레시피 열어줘</code></li>
          </ul>
        </li>
        <li>
          특정 요리를 바로 띄우려면 빅스비가 할 일에 아래 주소를 여는 명령을 넣으세요.
          <code class="url">{{ appUrl }}?q=멸치볶음</code>
          <code class="url">{{ appUrl }}?random=1</code>
        </li>
      </ol>
      <p class="muted">앱 아이콘을 길게 누르면 “레시피 추가”, “오늘 뭐 먹지?” 바로가기도 있어요.</p>
    </div>
  </Sheet>
</template>
