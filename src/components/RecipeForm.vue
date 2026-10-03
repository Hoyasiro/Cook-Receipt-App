<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { CATEGORIES, extractUrl, guessCategory } from '../lib/recipes.js'
import { fetchMeta } from '../lib/meta.js'

const props = defineProps({
  recipe: { type: Object, default: null }, // 편집할 레시피 (없으면 새로 추가)
  prefill: { type: Object, default: null } // 공유하기로 들어온 값 { url, title }
})
const emit = defineEmits(['save', 'remove', 'cancel'])

const src = props.recipe || props.prefill || {}
const form = reactive({
  url: src.url || '',
  title: src.title || '',
  category: src.category || (src.title ? guessCategory(src.title) : '기타'),
  memo: src.memo || ''
})
const categoryTouched = ref(!!props.recipe)
const suggested = ref('')
const loading = ref(false)
const error = ref('')

const validUrl = computed(() => extractUrl(form.url))

watch(
  () => form.title,
  (t) => {
    if (!categoryTouched.value) form.category = guessCategory(t)
  }
)

// 링크가 들어오면 제목 미리 가져오기 (이름 칸이 비어 있을 때만 채움)
let lastFetched = ''
watch(
  validUrl,
  async (url) => {
    if (!url || url === lastFetched || props.recipe) return
    lastFetched = url
    loading.value = true
    const meta = await fetchMeta(url)
    loading.value = false
    if (url !== validUrl.value) return
    suggested.value = meta.title
    if (!form.title && meta.title) form.title = meta.title
  },
  { immediate: true }
)

async function paste() {
  try {
    const text = await navigator.clipboard.readText()
    const url = extractUrl(text)
    if (url) form.url = url
    else error.value = '클립보드에 링크가 없어요'
  } catch {
    error.value = '붙여넣기 권한이 없어요. 칸을 길게 눌러 붙여넣어 주세요'
  }
}

function pickCategory(c) {
  form.category = c
  categoryTouched.value = true
}

function submit() {
  error.value = ''
  if (!validUrl.value) {
    error.value = '레시피 링크(https://…)를 넣어 주세요'
    return
  }
  emit('save', { url: validUrl.value, title: form.title.trim(), category: form.category, memo: form.memo.trim() })
}
</script>

<template>
  <form class="form" @submit.prevent="submit">
    <label class="field">
      <span>레시피 링크</span>
      <div class="row">
        <input v-model.trim="form.url" type="url" inputmode="url" placeholder="https://youtu.be/… 또는 만개의레시피 주소" />
        <button type="button" class="btn ghost" @click="paste">붙여넣기</button>
      </div>
    </label>

    <label class="field">
      <span>요리 이름 <small v-if="loading" class="muted">· 제목 가져오는 중…</small></span>
      <input v-model="form.title" type="text" placeholder="예: 멸치볶음" enterkeyhint="done" />
      <button
        v-if="suggested && suggested !== form.title"
        type="button"
        class="suggest"
        @click="form.title = suggested"
      >
        원래 제목 쓰기: {{ suggested }}
      </button>
    </label>

    <div class="field">
      <span>분류</span>
      <div class="chips wrap">
        <button
          v-for="c in CATEGORIES"
          :key="c"
          type="button"
          class="chip"
          :class="{ active: form.category === c }"
          @click="pickCategory(c)"
        >
          {{ c }}
        </button>
      </div>
    </div>

    <label class="field">
      <span>내 메모</span>
      <textarea v-model="form.memo" rows="3" placeholder="예: 간장 1스푼 줄이기, 물엿 대신 올리고당" />
    </label>

    <p v-if="error" class="error">{{ error }}</p>

    <div class="form-actions">
      <button v-if="props.recipe" type="button" class="btn danger" @click="emit('remove', props.recipe)">삭제</button>
      <span class="spacer" />
      <button type="button" class="btn ghost" @click="emit('cancel')">취소</button>
      <button type="submit" class="btn primary">{{ props.recipe ? '저장' : '추가' }}</button>
    </div>
  </form>
</template>
