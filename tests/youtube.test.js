import { describe, expect, it } from 'vitest'
import { buildYouTubeContent, chaptersFromDescription, cleanDescription, extractJson, parseYouTubePage } from '../src/lib/youtube.js'

// 실제 유튜브 영상 페이지와 같은 구조로 만든 테스트용 HTML
function page({ title = '', description = '', chapters = [], autoChapters = [] }) {
  const player = { videoDetails: { videoId: 'x', title, author: '채널', shortDescription: description } }
  const data = {
    playerOverlays: { playerOverlayRenderer: { decoratedPlayerBarRenderer: { decoratedPlayerBarRenderer: { playerBar: { multiMarkersPlayerBarRenderer: {
      markersMap: chapters.length ? [{ key: 'DESCRIPTION_CHAPTERS', value: { chapters: chapters.map(([t, ti]) => ({ chapterRenderer: { title: { simpleText: ti }, timeRangeStartMillis: t * 1000 } })) } }] : []
    } } } } } },
    engagementPanels: [{ engagementPanelSectionListRenderer: { content: { macroMarkersListRenderer: {
      contents: autoChapters.map(([t, ti]) => ({ macroMarkersListItemRenderer: { title: { simpleText: ti }, timeDescription: { simpleText: `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` }, onTap: { watchEndpoint: { startTimeSeconds: t } } } }))
    } } } }]
  }
  return `<html><script nonce="a">var ytInitialPlayerResponse = ${JSON.stringify(player)};var meta = document.createElement('meta');</script>
<script nonce="b">var ytInitialData = ${JSON.stringify(data)};</script></html>`
}

// 테스트 영상 1: 믹스커피 (지식인사이드) — 레시피 글은 없고 챕터만 있다
const coffeeDesc = `오늘은 박태진 바리스타님을 모시고 쉽게 구할 수 있는 믹스커피로 호텔에서 산 것같은 고급 커피를 즐기는 방법에 대해서 알아봤습니다.
영상이 유익 했다면 구독!! 영상이 재밌으셨다면 좋아요 버튼을 눌러주세요!
#박태진 #지식인사이드 #커피 #맥심 #카누

00:00 인트로
00:19 구독자 인사
00:26 가성비 끝판왕 '믹스커피' 하나로 고급 커피 만들기 -1
04:23 가성비 끝판왕 '믹스커피' 하나로 고급 커피 만들기 -2
06:54 '캡슐 커피'만으로 카페 커피 안 부러운 간편 레시피 -1
09:09 '캡슐 커피'만으로 카페 커피 안 부러운 간편 레시피 -2
12:09 바리스타가 남몰래 소장하는 캡슐커피 머신 추천
13:53 집에 두고 안 쓰는 캡슐머신, 100% 즐기는 방법

👇지식인사이드에 출연을 원하신다면 여기를 눌러주세요
https://forms.gle/u4Lx
knowledgeinside7@gmail.com
인스타그램: / knowledgeins_kr`

// 테스트 영상 2: 미숫가루 (유랄라) — 레시피 글·챕터 없음, 정정 공지만
const misuDesc = `영상에 미숫가루 50g이라고 되어있는데 30g입니다!

안녕하세요 유랄라에요 :) 오늘은 미숫가루 황금비율 레시피 준비했습니다! 카페에서 아이들에게 최고로 인기가 많았던 미숫가루 레시피에요!
구독 좋아요는 사랑입니다 :)

제품정보
미숫가루 : https://link.coupang.com/a
유기농 황설탕 : https://link.coupang.com/b
*영상은 쿠팡 파트너스 활동의 일환으로 이에따른 일정액의 수수료를 제공 받습니다`

describe('유튜브 페이지 해석', () => {
  it('JSON 을 괄호 짝으로 꺼낸다 (문자열 속 괄호 무시)', () => {
    expect(extractJson('x = {"a":"}{","b":{"c":1}}; y', 'x =')).toEqual({ a: '}{', b: { c: 1 } })
    expect(extractJson('nothing', 'x =')).toBeNull()
  })

  it('설명란 목차 → 챕터', () => {
    expect(chaptersFromDescription(coffeeDesc).map((c) => c.t)).toEqual([0, 19, 26, 263, 414, 549, 729, 833])
    // 한 줄로 이어 붙은 목차도
    expect(chaptersFromDescription('00:00 인트로 00:26 커피 만들기 1:04:23 정리').map((c) => [c.t, c.title])).toEqual([
      [0, '인트로'], [26, '커피 만들기'], [3863, '정리']
    ])
  })

  it('믹스커피: 챕터를 단계로, 인트로·인사·추천 챕터는 뺀다', () => {
    const p = parseYouTubePage(page({ title: '믹스커피', description: coffeeDesc }))
    expect(p.chapters).toHaveLength(8)
    const c = buildYouTubeContent(p)
    expect(c.steps.map((s) => s.t)).toEqual([26, 263, 414, 549, 833])
    expect(c.steps[0].text).toBe("가성비 끝판왕 '믹스커피' 하나로 고급 커피 만들기 -1")
    expect(c.note).toMatch(/박태진 바리스타/)
    expect(c.note).not.toMatch(/구독|https|@|#|인스타/)
  })

  it('유튜버 챕터(chapterRenderer)를 설명란보다 먼저 쓴다', () => {
    const p = parseYouTubePage(page({ description: '그냥 설명', chapters: [[0, '인트로'], [30, '양념 만들기'], [95, '볶기']] }))
    expect(buildYouTubeContent(p).steps).toEqual([{ text: '양념 만들기', t: 30 }, { text: '볶기', t: 95 }])
  })

  it('챕터가 없으면 유튜브 자동 챕터를 쓴다', () => {
    const p = parseYouTubePage(page({ description: '', autoChapters: [[12, '재료 손질'], [80, '끓이기']] }))
    expect(buildYouTubeContent(p).steps).toEqual([{ text: '재료 손질', t: 12 }, { text: '끓이기', t: 80 }])
  })

  it('미숫가루: 단계 없음 → 홍보를 걷어낸 설명(정정 공지)만', () => {
    const c = buildYouTubeContent(parseYouTubePage(page({ description: misuDesc })))
    expect(c.steps).toEqual([])
    expect(c.note.split('\n')[0]).toBe('영상에 미숫가루 50g이라고 되어있는데 30g입니다!')
    expect(c.note).not.toMatch(/쿠팡|수수료|구독|제품정보/)
  })

  it('설명란에 레시피가 있으면 재료·순서 카드로, 챕터 수가 같으면 장면을 붙인다', () => {
    const desc = `[재료]\n돼지고기 300g\n고추장 2큰술\n\n[만드는 법]\n1. 고기를 썰어요\n2. 양념에 10분 재워요\n3. 센불에 3분 볶아요`
    const p = parseYouTubePage(page({ description: desc, chapters: [[5, '썰기'], [60, '재우기'], [120, '볶기']] }))
    const c = buildYouTubeContent(p)
    expect(c.ingredients).toEqual(['돼지고기 300g', '고추장 2큰술'])
    expect(c.steps).toEqual([
      { text: '고기를 썰어요', t: 5 },
      { text: '양념에 10분 재워요', t: 60 },
      { text: '센불에 3분 볶아요', t: 120 }
    ])
    expect(c.note).toBe('')
  })

  it('페이지가 아니면 null', () => {
    expect(parseYouTubePage('<html>consent</html>')).toBeNull()
    expect(buildYouTubeContent(null)).toBeNull()
    expect(cleanDescription('구독 부탁\nhttps://x.y')).toBe('')
  })
})
