// 유튜브 영상 페이지에서 레시피 재료를 모은다 (API 키 없이, 공개 페이지 HTML 해석)
// - 설명란(videoDetails.shortDescription): 재료·순서가 적혀 있으면 단계 카드로
// - 챕터: 유튜버가 만든 챕터(chapterRenderer) 또는 유튜브 자동 챕터(macroMarkersListItemRenderer)
//   → 단계 제목 + 영상 위치(초)
// 비공식 방식이라 유튜브가 페이지 구조를 바꾸면 깨질 수 있다. 실패하면 null.

import { getText, structureText } from './content.js'
import { youtubeId } from './recipes.js'

/** html 안의 `marker = {...}` JSON 을 괄호 짝을 맞춰 꺼낸다 */
export function extractJson(html, marker) {
  const at = html.indexOf(marker)
  if (at < 0) return null
  const start = html.indexOf('{', at)
  if (start < 0) return null
  let depth = 0
  let inStr = false
  for (let i = start; i < html.length; i++) {
    const c = html[i]
    if (inStr) {
      if (c === '\\') i++
      else if (c === '"') inStr = false
    } else if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) {
      try {
        return JSON.parse(html.slice(start, i + 1))
      } catch {
        return null
      }
    }
  }
  return null
}

function text(v) {
  if (!v) return ''
  if (typeof v === 'string') return v
  if (v.simpleText) return v.simpleText
  if (Array.isArray(v.runs)) return v.runs.map((r) => r.text).join('')
  return ''
}

/** 객체 트리에서 key 를 가진 값을 모두 모은다 */
function collect(node, key, out = [], depth = 0) {
  if (!node || typeof node !== 'object' || depth > 60) return out
  if (Array.isArray(node)) {
    for (const n of node) collect(n, key, out, depth + 1)
    return out
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === key) out.push(v)
    else if (v && typeof v === 'object') collect(v, key, out, depth + 1)
  }
  return out
}

function dedupeByTime(list) {
  const seen = new Set()
  return list
    .filter((c) => Number.isFinite(c.t) && c.title && !seen.has(c.t) && seen.add(c.t))
    .sort((a, b) => a.t - b.t)
}

export function parseClock(s) {
  const parts = String(s).split(':').map(Number)
  if (parts.some((n) => !Number.isFinite(n))) return null
  return parts.reduce((acc, n) => acc * 60 + n, 0)
}

/** 설명란의 "00:26 양념 만들기" 목차 */
export function chaptersFromDescription(desc) {
  const re = /(?:^|\s)((?:\d{1,2}:)?\d{1,2}:\d{2})\s*[-–:)]?\s*(.+?)(?=\s+(?:\d{1,2}:)?\d{1,2}:\d{2}(?:\s|$)|\n|$)/g
  const out = []
  for (const m of String(desc || '').matchAll(re)) {
    const t = parseClock(m[1])
    const title = m[2].trim()
    if (t != null && title && !/^https?:/.test(title)) out.push({ t, title })
  }
  return out.length >= 2 ? dedupeByTime(out) : []
}

/** 유튜브 영상 페이지 HTML → { title, author, description, chapters } */
export function parseYouTubePage(html) {
  if (!html) return null
  const player = extractJson(html, 'ytInitialPlayerResponse')
  const data = extractJson(html, 'ytInitialData')
  const details = player?.videoDetails
  if (!details && !data) return null

  const creator = collect(data, 'chapterRenderer').map((c) => ({
    t: Math.round((c.timeRangeStartMillis ?? 0) / 1000),
    title: text(c.title)
  }))
  const auto = collect(data, 'macroMarkersListItemRenderer').map((m) => ({
    t: m.onTap?.watchEndpoint?.startTimeSeconds ?? parseClock(text(m.timeDescription)),
    title: text(m.title)
  }))
  const description = details?.shortDescription || ''
  let chapters = dedupeByTime(creator)
  if (chapters.length < 2) chapters = chaptersFromDescription(description)
  if (chapters.length < 2) chapters = dedupeByTime(auto)

  return {
    title: details?.title || '',
    author: details?.author || '',
    description,
    chapters
  }
}

// 요리와 관계없는 챕터 (인트로, 구독 인사, 제품 추천 …)
const JUNK_CHAPTER = /(인트로|intro|오프닝|opening|구독|인사|아웃트로|outro|엔딩|ending|광고|ppl|추천|쿠키\s*영상|예고|q&a|비하인드|먹방|시식|리뷰)/i
// 설명란의 홍보·연락처 줄
const PROMO_LINE = /(https?:\/\/|www\.|@\w|구독|좋아요|알림\s*설정|인스타|instagram|페이스북|facebook|틱톡|tiktok|블로그|카페|네이버\s*tv|문의|협찬|제휴|비즈니스|쿠팡|파트너스|수수료|제품\s*정보|구매\s*링크|사용한\s*제품|이메일|e-?mail|출연|채널|멤버십|BGM|music|음원)/i

/** 설명란에서 홍보·링크·해시태그를 걷어낸 메모 */
export function cleanDescription(desc) {
  return String(desc || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !PROMO_LINE.test(l) && !/^(#\S+\s*)+$/.test(l) && !/^(?:\d{1,2}:)?\d{1,2}:\d{2}\s/.test(l))
    .map((l) => l.replace(/#\S+/g, '').trim())
    .filter(Boolean)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 800)
}

/**
 * 페이지 정보 → 요리 모드 내용.
 *  steps 에 t(초)가 있으면 그 단계의 영상 장면으로 이동할 수 있다.
 *  note 는 설명란 요약(정정 공지 등). 아무것도 없으면 null.
 */
export function buildYouTubeContent(page) {
  if (!page) return null
  const chapters = page.chapters.filter((c) => !JUNK_CHAPTER.test(c.title))
  const recipe = structureText(page.description)
  let ingredients = recipe?.ingredients || []
  let steps = recipe?.steps || []

  if (steps.length >= 2) {
    // 설명란 단계 수와 챕터 수가 같으면 순서대로 영상 위치를 붙인다
    if (chapters.length === steps.length) steps = steps.map((s, i) => ({ ...s, t: chapters[i].t }))
  } else if (chapters.length >= 2) {
    steps = chapters.map((c) => ({ text: c.title, t: c.t }))
  } else {
    steps = []
  }
  const note = steps.length && recipe?.steps?.length >= 2 ? '' : cleanDescription(page.description)
  if (!steps.length && !ingredients.length && !note) return null
  return { ingredients, steps, note, fromVideo: true }
}

/** 유튜브 링크 → 요리 모드 내용 (공개 중계 서비스로 영상 페이지를 읽는다) */
export async function fetchYouTubeContent(url) {
  const id = youtubeId(url)
  if (!id) return null
  const watch = `https://www.youtube.com/watch?v=${id}&hl=ko`
  let page = parseYouTubePage(await getText(`https://api.allorigins.win/raw?url=${encodeURIComponent(watch)}`))
  if (!page?.description && !page?.chapters?.length) {
    page = parseYouTubePage(await getText(`https://r.jina.ai/${watch}`, { headers: { 'X-Respond-With': 'html' } }))
  }
  return buildYouTubeContent(page)
}
