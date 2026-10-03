import { describe, expect, it } from 'vitest'
import { detectSource, extractUrl, guessCategory, matchesQuery, parseNoteText, parseShare, urlKey, youtubeId } from '../src/lib/recipes.js'

describe('youtubeId', () => {
  it('여러 유튜브 주소 형식을 인식한다', () => {
    expect(youtubeId('https://youtu.be/jwsHzs558DQ?si=0ISzzOVFsm0-5fX8')).toBe('jwsHzs558DQ')
    expect(youtubeId('https://www.youtube.com/watch?v=abc123&t=10')).toBe('abc123')
    expect(youtubeId('https://m.youtube.com/shorts/xyz789')).toBe('xyz789')
    expect(youtubeId('https://m.10000recipe.com/recipe/6891816')).toBeNull()
  })
})

describe('parseNoteText', () => {
  it('삼성 노트 형식(링크 다음 줄이 요리 이름)을 읽는다', () => {
    const note = `마지막 한 젓가락까지 바삭하고 고소한 간장 멸치볶음
https://youtu.be/jwsHzs558DQ?si=0ISzzOVFsm0-5fX8
미숫가루

https://youtu.be/oyotmQ-vQLs?si=T-8LFvdjFHOt9VrM
믹스커피

https://m.10000recipe.com/recipe/6891816#review_div
멸치볶음

https://m.10000recipe.com/recipe/6858156
진미채볶음`
    expect(parseNoteText(note)).toEqual([
      { url: 'https://youtu.be/jwsHzs558DQ?si=0ISzzOVFsm0-5fX8', title: '미숫가루' },
      { url: 'https://youtu.be/oyotmQ-vQLs?si=T-8LFvdjFHOt9VrM', title: '믹스커피' },
      { url: 'https://m.10000recipe.com/recipe/6891816#review_div', title: '멸치볶음' },
      { url: 'https://m.10000recipe.com/recipe/6858156', title: '진미채볶음' }
    ])
  })

  it('줄바꿈으로 잘린 링크를 이어 붙인다', () => {
    expect(parseNoteText('https://m.10000recipe.com/recipe/\n6891816#review_div\n멸치볶음')).toEqual([
      { url: 'https://m.10000recipe.com/recipe/6891816#review_div', title: '멸치볶음' }
    ])
  })

  it('한 줄 형식과 이름 없는 링크, 중복을 처리한다', () => {
    const list = parseNoteText('김치찌개 https://youtu.be/AAA\nhttps://youtu.be/AAA?si=x\n\nhttps://example.com/a\nhttps://example.com/b\n계란말이')
    expect(list).toEqual([
      { url: 'https://youtu.be/AAA', title: '김치찌개' },
      { url: 'https://example.com/a', title: '' },
      { url: 'https://example.com/b', title: '계란말이' }
    ])
  })
})

describe('기타 도우미', () => {
  it('출처·카테고리·키', () => {
    expect(detectSource('https://m.10000recipe.com/recipe/1')).toBe('10000recipe')
    expect(guessCategory('콩나물무침')).toBe('반찬')
    expect(guessCategory('믹스커피')).toBe('음료')
    expect(guessCategory('된장찌개')).toBe('국·찌개')
    expect(guessCategory('무언가')).toBe('기타')
    expect(urlKey('https://youtu.be/AAA?si=1')).toBe(urlKey('https://www.youtube.com/watch?v=AAA'))
    expect(urlKey('https://m.10000recipe.com/recipe/1#x')).toBe(urlKey('https://www.10000recipe.com/recipe/1'))
    expect(extractUrl('보세요 https://a.com/x).')).toBe('https://a.com/x')
  })

  it('공유하기 값 해석', () => {
    expect(parseShare({ title: '', text: '백종원 제육볶음 https://youtu.be/Q1', url: '' })).toEqual({ url: 'https://youtu.be/Q1', title: '백종원 제육볶음' })
    expect(parseShare({ title: '시금치나물', text: '', url: 'https://m.10000recipe.com/recipe/6840346' })).toEqual({
      url: 'https://m.10000recipe.com/recipe/6840346',
      title: '시금치나물'
    })
    expect(parseShare({ title: '그냥 글', text: '링크 없음', url: '' })).toBeNull()
  })

  it('검색은 모든 단어를 포함해야 한다', () => {
    const r = { title: '간장 멸치볶음', memo: '물엿 줄이기', category: '반찬' }
    expect(matchesQuery(r, '멸치 물엿')).toBe(true)
    expect(matchesQuery(r, '멸치 고추장')).toBe(false)
  })
})
