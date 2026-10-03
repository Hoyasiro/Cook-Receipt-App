// 음성 명령: 크롬의 Web Speech API(한국어)로 듣고, 말한 문장을 동작으로 바꾼다.

const RULES = [
  // 순서가 중요하다: 더 구체적인 말을 먼저 검사
  ['top', /(맨\s*위|처음으로|맨\s*처음)/],
  ['bottom', /(맨\s*아래|맨\s*끝|끝으로)/],
  ['nextStep', /(다음\s*단계|다음\s*순서|다음\s*거)/],
  ['prevStep', /(이전\s*단계|전\s*단계|이전\s*순서|앞\s*단계)/],
  ['read', /(읽어|말해)/],
  ['play', /(재생|틀어|시작해|플레이)/],
  ['pause', /(멈춰|정지|일시\s*정지|스톱|잠깐)/],
  ['rewind', /(뒤로|되감|다시\s*보여)/],
  ['forward', /(앞으로|넘겨|건너)/],
  ['up', /(올려|위로|이전)/],
  ['down', /(내려|아래|밑으로|스크롤|다음)/],
  ['close', /(닫아|나가|종료)/],
  ['stop', /(그만\s*들어|듣지\s*마|마이크\s*꺼)/]
]

/** 말한 문장 → 동작 이름 (모르면 null) */
export function parseCommand(transcript) {
  const t = String(transcript || '').replace(/\s+/g, ' ').trim()
  if (!t) return null
  // 영상 속 말소리 같은 긴 문장은 명령으로 보지 않는다
  if (t.replace(/\s/g, '').length > 12) return null
  // "그만 들어"가 "들어"보다 먼저 걸리도록 stop 을 먼저 본다
  if (RULES.at(-1)[1].test(t)) return 'stop'
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
