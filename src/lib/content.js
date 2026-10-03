// 웹 레시피(만개의레시피 등)의 재료·조리 순서를 가져와 요리 모드에서 보여준다.
// 정적 호스팅이라 다른 사이트를 직접 읽을 수 없어(CORS) 공개 프록시를 거친다. 실패하면 원본 열기로 안내한다.

/** HTML 안의 JSON-LD(schema.org Recipe)에서 재료·순서를 뽑는다 */
export function parseRecipeHtml(html) {
  const blocks = [...String(html).matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)]
  for (const [, raw] of blocks) {
    let data
    try {
      data = JSON.parse(raw.trim())
    } catch {
      continue
    }
    const recipe = findRecipe(data)
    if (!recipe) continue
    const ingredients = toArray(recipe.recipeIngredient || recipe.ingredients).map(clean).filter(Boolean)
    const steps = flattenSteps(recipe.recipeInstructions)
    if (ingredients.length || steps.length) {
      return { title: clean(recipe.name), ingredients, steps }
    }
  }
  return null
}

function findRecipe(node) {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipe(n)
      if (r) return r
    }
    return null
  }
  const type = toArray(node['@type'])
  if (type.includes('Recipe')) return node
  return findRecipe(node['@graph'])
}

function flattenSteps(ins) {
  const out = []
  for (const s of toArray(ins)) {
    if (typeof s === 'string') {
      // 문자열 하나에 여러 줄이 들어 있는 경우
      out.push(...s.split(/\n+/).map((t) => ({ text: clean(t) })))
    } else if (s?.['@type'] === 'HowToSection' || s?.itemListElement) {
      out.push(...flattenSteps(s.itemListElement))
    } else if (s) {
      out.push({ text: clean(s.text || s.name), image: firstImage(s.image) })
    }
  }
  return out.filter((s) => s.text)
}

function firstImage(img) {
  const v = toArray(img)[0]
  return typeof v === 'string' ? v : v?.url || ''
}

function toArray(v) {
  return v == null ? [] : Array.isArray(v) ? v : [v]
}

function clean(t) {
  return String(t || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * JSON-LD 가 없을 때 만개의레시피 화면 구조에서 직접 뽑는다 (브라우저 DOMParser 필요)
 *   재료: #divConfirmedMaterialArea li / .ready_ingre3 li   순서: [id^=stepdescr] / .step_list_txt
 */
export function parseRecipeDom(html) {
  if (typeof DOMParser === 'undefined') return null
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const pick = (sels) => {
    for (const sel of sels) {
      const els = [...doc.querySelectorAll(sel)]
      if (els.length) return els
    }
    return []
  }
  const ingredients = pick(['#divConfirmedMaterialArea li', '.ready_ingre3 li', '.ingre_list li', '[class*="ingredient"] li'])
    .map((li) => clean(li.textContent.replace(/구매/g, '')))
    .filter(Boolean)
  const steps = pick(['[id^="stepdescr"]', '.step_list_txt', '.view_step_cont .media-body', '[class*="step"] li'])
    .map((el) => ({ text: clean(el.textContent), image: el.closest('[id^="stepDiv"], li')?.querySelector('img')?.getAttribute('src') || '' }))
    .filter((s) => s.text)
  if (steps.length < 2) return null
  return { title: clean(doc.querySelector('h3, h1')?.textContent), ingredients, steps }
}

const JUNK = /(로그인|회원가입|광고|공유하기|스크랩|댓글|구독|팔로우|앱\s*다운|쿠키|copyright|ⓒ|©|바로가기|메뉴|검색|더보기|이전글|다음글|관련\s*레시피|추천\s*레시피|요리\s*후기|사진\s*후기|리뷰|신고)/i
const END_MARK = /^(#+\s*)?(댓글|요리\s*후기|관련\s*레시피|추천\s*레시피|이\s*레시피와|레시피\s*작성자|요리\s*팁\s*더보기)/
// 머리말 앞의 [ 【 < ( ▶ ✔ 같은 장식은 건너뛴다
const ING_MARK = /^(#+\s*)?[\[【<(▶✔✅•■◆\s-]*(재료|Ingredients)/i
const STEP_MARK = /^(#+\s*)?[\[【<(▶✔✅•■◆\s-]*(조리\s*(순서|법|방법)|요리\s*순서|만드는\s*(법|방법)|만들기|레시피\s*순서|Steps?|How to|Recipe)/i
const STEP_LINE = /^(step\s*\d+|\d+\s*[.)]|\d+\s*단계)\s*/i

/** 리더 서비스의 본문 텍스트에서 잡음을 지우고, 가능하면 재료·순서로 나눈다 */
export function structureText(raw) {
  let lines = String(raw || '')
    .replace(/^(Title|URL Source|Published Time|Markdown Content|Warning):.*$/gim, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>|]+/g, ' ')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l && !/^[-=#\s]+$/.test(l) && !/^https?:\/\//.test(l))

  // 후기·댓글 이후는 버린다
  const end = lines.findIndex((l, i) => i > 5 && END_MARK.test(l))
  if (end > 0) lines = lines.slice(0, end)
  lines = lines.filter((l) => !(l.length < 25 && JUNK.test(l)))

  const ingAt = lines.findIndex((l) => ING_MARK.test(l))
  const stepAt = lines.findIndex((l, i) => i > ingAt && STEP_MARK.test(l))

  let ingredients = []
  let steps = []
  if (ingAt >= 0 && stepAt > ingAt) {
    ingredients = lines
      .slice(ingAt + 1, stepAt)
      .map((l) => l.replace(/\s*구매$/, ''))
      .filter((l) => l && l.length <= 40 && !ING_MARK.test(l))
    steps = lines.slice(stepAt + 1)
  } else {
    const numbered = lines.filter((l) => STEP_LINE.test(l))
    if (numbered.length >= 2) steps = lines.slice(lines.indexOf(numbered[0]))
  }
  // 번호 줄을 기준으로 단계를 묶는다 (번호가 없으면 줄마다 한 단계)
  if (steps.length) {
    const grouped = []
    const hasNumbers = steps.filter((l) => STEP_LINE.test(l)).length >= 2
    for (const l of steps) {
      if (!hasNumbers || STEP_LINE.test(l) || !grouped.length) {
        const text = l.replace(STEP_LINE, '').trim()
        if (text) grouped.push({ text })
        else grouped.push({ text: '' })
      } else grouped[grouped.length - 1].text += ` ${l}`
    }
    steps = grouped.map((s) => ({ text: s.text.trim() })).filter((s) => s.text.length > 1)
  }
  if (steps.length >= 2) return { ingredients, steps, fromText: true }
  const text = lines.join('\n').trim()
  return text.length > 50 ? { text } : null
}

export async function getText(url, init = {}, ms = 15000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    return res.ok ? await res.text() : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function fromHtml(html) {
  if (!html) return null
  return parseRecipeHtml(html) || parseRecipeDom(html)
}

/**
 * { ingredients, steps } 또는 { text } 를 돌려준다. 모두 실패하면 null.
 * 1) 원본 HTML(allorigins) → JSON-LD / 화면 구조
 * 2) 리더 서비스의 HTML(r.jina.ai) → 같은 해석
 * 3) 리더 서비스의 본문 텍스트 → 잡음 제거·구조화
 */
export async function fetchRecipeContent(url) {
  const a = fromHtml(await getText(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`))
  if (a) return a
  const b = fromHtml(await getText(`https://r.jina.ai/${url}`, { headers: { 'X-Respond-With': 'html' } }))
  if (b) return b
  return structureText(await getText(`https://r.jina.ai/${url}`))
}
