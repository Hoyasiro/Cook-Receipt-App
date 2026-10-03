// 레시피 링크 관련 순수 함수 모음 (테스트 대상)

export const CATEGORIES = ['반찬', '국·찌개', '메인요리', '밥·면', '간식', '음료', '기타']

const URL_RE = /https?:\/\/[^\s<>"']+/i

/** 문자열에서 첫 번째 URL 을 뽑는다. 없으면 null */
export function extractUrl(text) {
  if (!text) return null
  const m = String(text).match(URL_RE)
  return m ? m[0].replace(/[),.]+$/, '') : null
}

/** 유튜브 영상 ID (youtu.be, watch?v=, shorts/, embed/) */
export function youtubeId(url) {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^(www\.|m\.)/, '')
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null
    if (host === 'youtube.com' || host === 'music.youtube.com') {
      if (u.searchParams.get('v')) return u.searchParams.get('v')
      const m = u.pathname.match(/^\/(shorts|embed|live)\/([^/?#]+)/)
      if (m) return m[2]
    }
  } catch {
    /* 잘못된 URL */
  }
  return null
}

/** 링크 출처 구분 */
export function detectSource(url) {
  if (youtubeId(url)) return 'youtube'
  try {
    const host = new URL(url).hostname
    if (host.endsWith('10000recipe.com')) return '10000recipe'
    if (host.includes('instagram.com')) return 'instagram'
    if (host.includes('naver.com')) return 'naver'
  } catch {
    /* 무시 */
  }
  return 'web'
}

export const SOURCE_LABEL = {
  youtube: '유튜브',
  '10000recipe': '만개의레시피',
  instagram: '인스타그램',
  naver: '네이버',
  web: '웹'
}

/** 같은 레시피인지 비교하기 위한 키 (공유 추적 파라미터 제거) */
export function urlKey(url) {
  const yt = youtubeId(url)
  if (yt) return `yt:${yt}`
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^(www\.|m\.)/, '')
    return `${host}${u.pathname.replace(/\/$/, '')}`
  } catch {
    return url
  }
}

const CATEGORY_RULES = [
  ['음료', /(커피|라떼|주스|스무디|에이드|차$|미숫가루|음료|쉐이크|밀크티)/],
  ['국·찌개', /(국$|국\s|찌개|탕$|전골|스프|수프)/],
  ['밥·면', /(밥|볶음밥|덮밥|김밥|면$|국수|파스타|라면|우동|냉면|비빔면)/],
  ['간식', /(빵|케이크|쿠키|떡볶이|토스트|과자|디저트|와플|핫케이크)/],
  ['반찬', /(볶음|무침|조림|나물|장아찌|전$|부침|김치|절임|샐러드|계란말이)/],
  ['메인요리', /(구이|찜|갈비|불고기|스테이크|수육|보쌈|치킨|닭|삼겹|돈까스|카레)/]
]

/** 요리 이름으로 카테고리 추측 */
export function guessCategory(title) {
  const t = (title || '').trim()
  for (const [cat, re] of CATEGORY_RULES) if (re.test(t)) return cat
  return '기타'
}

/**
 * 삼성 노트 등에 적어둔 텍스트를 레시피 목록으로 바꾼다.
 * 지원 형식:
 *   https://link        ← 링크
 *   멸치볶음             ← 다음 줄(빈 줄 전까지)이 요리 이름
 * 또는 한 줄에 "멸치볶음 https://link" / "https://link 멸치볶음"
 */
export function parseNoteText(text) {
  const lines = String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())

  const items = []
  let pendingTitle = '' // 링크보다 위에 적힌 이름 (한 줄 형식 대비)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) {
      pendingTitle = ''
      continue
    }
    const url = extractUrl(line)
    if (!url) {
      pendingTitle = line
      continue
    }

    // 링크가 줄바꿈으로 잘린 경우 (예: ".../recipe/" 다음 줄 "6891816#review_div")
    let fullUrl = url
    while (i + 1 < lines.length && /^[\w#%&=?/.-]+$/.test(lines[i + 1]) && /[/=?&-]$/.test(fullUrl)) {
      fullUrl += lines[++i]
    }

    let title = line.replace(url, '').trim()
    if (!title && i + 1 < lines.length && lines[i + 1] && !extractUrl(lines[i + 1])) {
      title = lines[++i]
    }
    if (!title) title = pendingTitle
    pendingTitle = ''

    items.push({ url: fullUrl, title: cleanTitle(title) })
  }

  // 같은 링크 중복 제거
  const seen = new Set()
  return items.filter((it) => {
    const k = urlKey(it.url)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

function cleanTitle(t) {
  return (t || '').replace(/^[-*•·\d.)\s]+/, '').trim()
}

/** 공유하기로 들어온 값(title/text/url)에서 링크와 이름을 뽑는다 */
export function parseShare({ title, text, url }) {
  const link = extractUrl(url) || extractUrl(text) || extractUrl(title)
  if (!link) return null
  let name = (title || '').trim()
  if (!name || extractUrl(name)) {
    name = (text || '').replace(link, '').trim()
  }
  if (extractUrl(name)) name = ''
  return { url: link, title: name.split('\n')[0].trim() }
}

/** 검색: 이름·메모·카테고리·태그에 공백으로 나눈 모든 단어가 들어 있어야 한다 */
export function matchesQuery(recipe, query) {
  const words = (query || '').toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = [recipe.title, recipe.memo, recipe.category, ...(recipe.tags || [])].join(' ').toLowerCase()
  return words.every((w) => hay.includes(w))
}
