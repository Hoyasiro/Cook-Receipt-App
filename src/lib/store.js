import { reactive, watch } from 'vue'
import { detectSource, guessCategory, urlKey } from './recipes.js'
import { fetchMeta } from './meta.js'

// 레시피는 이 휴대폰 브라우저 저장소(localStorage)에만 보관한다. 서버 없음.
const KEY = 'cook-recipes:v1'

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    const data = raw ? JSON.parse(raw) : []
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

export const state = reactive({ recipes: load() })

watch(
  () => state.recipes,
  (list) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(list))
    } catch {
      /* 저장 공간 부족 등 */
    }
  },
  { deep: true }
)

// 브라우저가 저장소를 임의로 지우지 않도록 요청
navigator.storage?.persist?.().catch(() => {})

function newId() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function findByUrl(url) {
  const k = urlKey(url)
  return state.recipes.find((r) => urlKey(r.url) === k)
}

/** 레시피 추가. 이미 있는 링크면 기존 항목을 돌려준다 */
export function addRecipe({ url, title = '', category, memo = '', image = '' }) {
  const existing = findByUrl(url)
  if (existing) return { recipe: existing, created: false }
  const recipe = {
    id: newId(),
    url,
    title: title.trim(),
    category: category || guessCategory(title),
    memo,
    image,
    source: detectSource(url),
    favorite: false,
    createdAt: Date.now(),
    openedAt: 0,
    openCount: 0
  }
  state.recipes.unshift(recipe)
  fillMeta(recipe.id)
  return { recipe, created: true }
}

export function updateRecipe(id, patch) {
  const r = state.recipes.find((x) => x.id === id)
  if (!r) return
  const urlChanged = patch.url && patch.url !== r.url
  Object.assign(r, patch)
  if (urlChanged) {
    r.source = detectSource(r.url)
    r.image = ''
    fillMeta(id)
  }
}

export function removeRecipe(id) {
  const i = state.recipes.findIndex((x) => x.id === id)
  if (i >= 0) state.recipes.splice(i, 1)
}

export function markOpened(id) {
  const r = state.recipes.find((x) => x.id === id)
  if (!r) return
  r.openedAt = Date.now()
  r.openCount = (r.openCount || 0) + 1
}

/** 제목이 비었거나 사진이 없으면 인터넷에서 채운다 */
export async function fillMeta(id) {
  const r = state.recipes.find((x) => x.id === id)
  if (!r || (r.title && r.image)) return
  const meta = await fetchMeta(r.url)
  const cur = state.recipes.find((x) => x.id === id)
  if (!cur) return
  if (!cur.image && meta.image) cur.image = meta.image
  if (!cur.title && meta.title) {
    cur.title = meta.title
    if (cur.category === '기타') cur.category = guessCategory(meta.title)
  }
}

/** 사진이 없는 항목들을 차례로 채운다 (가져오기 직후 등) */
export async function fillMissingMeta() {
  for (const r of state.recipes.filter((x) => !x.image)) {
    await fillMeta(r.id)
  }
}

// ── 백업 ──────────────────────────────────────────
export function exportJson() {
  return JSON.stringify({ app: 'cook-recipes', version: 1, exportedAt: new Date().toISOString(), recipes: state.recipes }, null, 2)
}

/** 백업 파일을 합친다. 같은 링크는 건너뛴다. 추가된 개수를 돌려준다 */
export function importJson(text) {
  const data = JSON.parse(text)
  const list = Array.isArray(data) ? data : data?.recipes
  if (!Array.isArray(list)) throw new Error('레시피 백업 파일이 아니에요')
  let added = 0
  for (const r of list) {
    if (!r?.url || findByUrl(r.url)) continue
    state.recipes.push({
      openedAt: 0,
      openCount: 0,
      favorite: false,
      memo: '',
      image: '',
      ...r,
      id: r.id && !state.recipes.some((x) => x.id === r.id) ? r.id : newId(),
      source: detectSource(r.url),
      category: r.category || guessCategory(r.title)
    })
    added++
  }
  return added
}
