// 음성 명령: 크롬의 Web Speech API(한국어)로 듣고, 말한 문장을 동작으로 바꾼다.

const RULES = [
  // 순서가 중요하다: 더 구체적인 말을 먼저 검사
  ['bigger', /(크게|키워|확대)/],
  ['smaller', /(작게|줄여|축소)/],
  ['ingredients', /(재료)/],
  ['all', /(전체\s*보기|전체|다\s*보여)/],
  ['top', /(맨\s*위|처음|위로\s*올라)/],
  ['bottom', /(맨\s*아래|끝|마지막)/],
  ['nextStep', /(다음)/],
  ['prevStep', /(이전|전\s*단계|앞\s*단계)/],
  ['read', /(읽어|말해)/],
  ['play', /(재생|틀어|시작해|플레이)/],
  ['pause', /(멈춰|정지|일시\s*정지|스톱|잠깐)/],
  ['rewind', /(뒤로|되감|다시\s*보여)/],
  ['forward', /(앞으로|넘겨|건너)/],
  ['up', /(올려|위로)/],
  ['down', /(내려|아래|밑으로|스크롤)/],
  ['close', /(닫아|나가|종료)/],
  ['stop', /(그만\s*들어|듣지\s*마|마이크\s*꺼)/]
]

// ── 숫자 말하기: "7", "칠", "일곱", "십이", "열두", "첫" ──
const SINO = { 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 륙: 6, 칠: 7, 팔: 8, 구: 9 }
const NATIVE_ONES = { 한: 1, 하나: 1, 첫: 1, 두: 2, 둘: 2, 세: 3, 셋: 3, 네: 4, 넷: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9 }
const NATIVE_TENS = { 열: 10, 스무: 20, 스물: 20, 서른: 30 }

export function koreanNumber(word) {
  const w = String(word || '').replace(/\s/g, '')
  if (!w) return null
  if (/^\d+$/.test(w)) return Number(w)
  if (w in NATIVE_ONES) return NATIVE_ONES[w]
  for (const [k, v] of Object.entries(NATIVE_TENS)) {
    if (w === k) return v
    if (w.startsWith(k) && w.slice(k.length) in NATIVE_ONES) return v + NATIVE_ONES[w.slice(k.length)]
  }
  // 한자어: 십, 십이, 이십, 이십삼
  const m = w.match(/^([일이삼사오육륙칠팔구])?(십)?([일이삼사오육륙칠팔구])?$/)
  if (m && (m[1] || m[2] || m[3])) {
    if (!m[2]) return m[3] ? null : SINO[m[1]]
    return (m[1] ? SINO[m[1]] : 1) * 10 + (m[3] ? SINO[m[3]] : 0)
  }
  return null
}

/** "7번으로 이동해 줘", "세 번째 단계", "3단계" → 7 / 3 / 3 */
export function parseStepNumber(t) {
  const m = String(t).match(/([0-9]+|[가-힣]+?)\s*(번째|번|단계|스텝)/)
  return m ? koreanNumber(m[1]) : null
}

/** 말한 문장 → 동작 이름 (모르면 null). 번호 이동은 "goto:7" */
export function parseCommand(transcript) {
  const t = String(transcript || '').replace(/\s+/g, ' ').trim()
  if (!t) return null
  // 영상 속 말소리 같은 긴 문장은 명령으로 보지 않는다
  if (t.replace(/\s/g, '').length > 14) return null
  // "그만 들어"가 "들어"보다 먼저 걸리도록 stop 을 먼저 본다
  if (RULES.at(-1)[1].test(t)) return 'stop'
  // "한 번 더 읽어 줘", "다시 한 번 재생" 의 '한 번' 은 번호가 아니다
  if (!/(읽어|말해|재생|틀어|더)/.test(t)) {
    const n = parseStepNumber(t)
    if (n) return `goto:${n}`
  }
  for (const [action, re] of RULES) if (re.test(t)) return action
  return null
}

export function isVoiceSupported() {
  return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition)
}

/**
 * 계속 듣는 음성 인식기. 크롬은 몇 초 조용하면 스스로 끝나므로 켜져 있는 동안 자동으로 다시 시작한다.
 * onCommand(action, transcript), onState({ listening, heard, error })
 */
export function createVoiceListener({ onCommand, onState }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SR) return null
  let rec = null
  let wanted = false
  let paused = false

  function start() {
    if (rec) return
    rec = new SR()
    rec.lang = 'ko-KR'
    rec.continuous = true
    rec.interimResults = false
    rec.maxAlternatives = 3
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (!e.results[i].isFinal) continue
        const alts = [...e.results[i]].map((a) => a.transcript)
        const action = alts.map(parseCommand).find(Boolean) || null
        onState?.({ heard: alts[0] })
        if (action) onCommand(action, alts[0])
      }
    }
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        wanted = false
        onState?.({ listening: false, error: '마이크 권한을 허용해 주세요' })
      }
    }
    rec.onend = () => {
      rec = null
      if (wanted && !paused) setTimeout(start, 250)
      else onState?.({ listening: false })
    }
    try {
      rec.start()
      onState?.({ listening: true, error: '' })
    } catch {
      rec = null
    }
  }

  return {
    start() {
      wanted = true
      paused = false
      start()
    },
    stop() {
      wanted = false
      rec?.abort()
      onState?.({ listening: false })
    },
    // 앱이 말하는 동안(읽어주기) 자기 목소리를 듣지 않도록 잠시 멈춘다
    pause() {
      paused = true
      rec?.abort()
    },
    resume() {
      paused = false
      if (wanted) start()
    },
    get active() {
      return wanted
    }
  }
}

/** 한국어로 읽어주기. 끝나면 resolve */
export function speak(text) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window) || !text) return resolve()
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'ko-KR'
    u.rate = 1
    u.onend = u.onerror = () => resolve()
    speechSynthesis.speak(u)
  })
}
