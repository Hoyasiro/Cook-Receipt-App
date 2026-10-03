<script setup>
import { computed, ref } from 'vue'
import { guessCategory, parseNoteText, SOURCE_LABEL, detectSource } from '../lib/recipes.js'
import { addRecipe, exportJson, fillMissingMeta, findByUrl, importJson } from '../lib/store.js'

const props = defineProps({ initialText: { type: String, default: '' } })
const emit = defineEmits(['done', 'toast'])

const text = ref(props.initialText)
const parsed = computed(() =>
  parseNoteText(text.value).map((it) => ({
    ...it,
    source: detectSource(it.url),
    category: guessCategory(it.title),
    exists: !!findByUrl(it.url)
  }))
)
const newOnes = computed(() => parsed.value.filter((it) => !it.exists))

function importNote() {
  const items = newOnes.value
  for (const it of items) addRecipe(it)
  emit('toast', `${items.length}개 레시피를 가져왔어요`)
  fillMissingMeta()
  emit('done')
}

// ── 백업 ──
function backupFileName() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `요리레시피-백업-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`
}

async function backup() {
  const file = new File([exportJson()], backupFileName(), { type: 'application/json' })
  // 갤럭시에서는 공유 시트로 카카오톡 나에게·드라이브 등에 바로 보낼 수 있다
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: '요리 레시피 백업' })
      return
    } catch (e) {
      if (e?.name === 'AbortError') return
    }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(file)
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

async function restore(ev) {
  const file = ev.target.files?.[0]
  ev.target.value = ''
  if (!file) return
  try {
    const added = importJson(await file.text())
    emit('toast', `백업에서 ${added}개를 복원했어요`)
    fillMissingMeta()
    emit('done')
  } catch (e) {
    emit('toast', e.message || '백업 파일을 읽지 못했어요')
  }
}
</script>

<template>
  <div class="import">
    <section>
      <h3>삼성 노트에서 가져오기</h3>
      <p class="muted">
        노트에서 글을 <b>모두 선택 → 공유 → 요리 레시피</b>를 누르거나,<br />
        <b>복사</b>해서 아래에 붙여넣으세요. 이미 있는 링크는 건너뛰어요.<br />
        링크 바로 다음 줄에 적은 글자를 요리 이름으로 인식해요.
      </p>
      <textarea
        v-model="text"
        rows="7"
        placeholder="https://youtu.be/…&#10;미숫가루&#10;&#10;https://m.10000recipe.com/recipe/6891816&#10;멸치볶음"
      />
      <ul v-if="parsed.length" class="preview">
        <li v-for="it in parsed" :key="it.url" :class="{ dim: it.exists }">
          <span class="chip small">{{ it.category }}</span>
          <span class="p-title">{{ it.title || '(이름 없음 · 자동으로 채워요)' }}</span>
          <span class="muted">{{ it.exists ? '이미 있음' : SOURCE_LABEL[it.source] }}</span>
        </li>
      </ul>
      <button class="btn primary block" :disabled="!newOnes.length" @click="importNote">
        {{ newOnes.length ? `${newOnes.length}개 가져오기` : '붙여넣으면 미리보기가 나와요' }}
      </button>
    </section>

    <section>
      <h3>백업 · 복원</h3>
      <p class="muted">레시피는 이 휴대폰 안에만 저장돼요. 폰을 바꾸거나 앱을 지우기 전에 백업해 두세요.</p>
      <div class="row">
        <button class="btn ghost grow" @click="backup">백업 파일 만들기</button>
        <label class="btn ghost grow">
          백업에서 복원
          <input type="file" accept="application/json,.json" hidden @change="restore" />
        </label>
      </div>
    </section>
  </div>
</template>
