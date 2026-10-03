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

async function getText(url, ms = 12000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    return res.ok ? await res.text() : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * { ingredients, steps } 또는 { text } 를 돌려준다. 둘 다 실패하면 null.
 * 1) 원본 HTML 을 받아 JSON-LD 해석  2) 실패 시 본문 텍스트(리더 서비스)
 */
export async function fetchRecipeContent(url) {
  const html = await getText(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`)
  const parsed = html && parseRecipeHtml(html)
  if (parsed) return parsed

  const md = await getText(`https://r.jina.ai/${url}`)
  if (md) {
    const text = md
      .replace(/^(Title|URL Source|Published Time|Markdown Content):.*$/gm, '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // 이미지
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 링크 → 글자만
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    if (text.length > 50) return { text }
  }
  return null
}
