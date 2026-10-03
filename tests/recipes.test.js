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

import { parseCommand } from '../src/lib/voice.js'
import { parseRecipeHtml } from '../src/lib/content.js'

describe('parseCommand', () => {
  it('한국어 음성 명령을 동작으로 바꾼다', () => {
    const cases = {
      '내려 줘': 'down',
      '아래로 스크롤': 'down',
      '스크롤 해줘': 'down',
      '위로 스크롤': 'up',
      '올려': 'up',
      '맨 위로': 'top',
      '맨 아래로 가 줘': 'bottom',
      '다음 단계': 'nextStep',
      '다음': 'nextStep',
      '이전': 'prevStep',
      '이전 단계': 'prevStep',
      '읽어 줘': 'read',
      '재생': 'play',
      '멈춰': 'pause',
      '10초 뒤로': 'rewind',
      '앞으로 넘겨': 'forward',
      '그만 들어': 'stop',
      '닫아 줘': 'close',
      '글씨 크게': 'bigger',
      '작게 해 줘': 'smaller',
      '재료 보여 줘': 'ingredients',
      '전체 보기': 'all',
      '1번으로 이동해 줘': 'goto:1',
      '7번으로 가 줘': 'goto:7',
      '칠 번': 'goto:7',
      '일곱 번째 단계': 'goto:7',
      '세 번째': 'goto:3',
      '첫 번째로 가': 'goto:1',
      '3단계': 'goto:3',
      '십이 번': 'goto:12',
      '열두 번째': 'goto:12',
      '끝으로 이동해 줘': 'bottom',
      '마지막 단계': 'bottom',
      '맨 위로 올라가': 'top',
      '처음으로 가 줘': 'top',
      '재료 화면으로 이동해 줘': 'ingredients',
      '다음 단계': 'nextStep',
      '이전 단계': 'prevStep',
      '한 번 더 읽어 줘': 'read',
      '다시 한 번 재생': 'play',
      '오늘 날씨 어때': null,
      '이제 멸치를 팬에 넣고 아래쪽까지 잘 볶아 주세요': null
    }
    for (const [said, action] of Object.entries(cases)) expect([said, parseCommand(said)]).toEqual([said, action])
  })
})

describe('parseRecipeHtml', () => {
  it('JSON-LD Recipe 에서 재료와 순서를 뽑는다', () => {
    const html = `<html><head>
      <script type="application/ld+json">{"@context":"http://schema.org","@type":"Organization","name":"x"}</script>
      <script type="application/ld+json">{"@context":"http://schema.org/","@type":"Recipe","name":"간장 멸치볶음",
        "recipeIngredient":["잔멸치 1컵","간장 1스푼","올리고당 2스푼"],
        "recipeInstructions":[{"@type":"HowToStep","text":"팬에 멸치를 &amp; 볶아요.","image":"https://a/1.jpg"},
          {"@type":"HowToStep","text":"간장과 <b>올리고당</b>을 넣어요."}]}</script></head></html>`
    expect(parseRecipeHtml(html)).toEqual({
      title: '간장 멸치볶음',
      ingredients: ['잔멸치 1컵', '간장 1스푼', '올리고당 2스푼'],
      steps: [
        { text: '팬에 멸치를 & 볶아요.', image: 'https://a/1.jpg' },
        { text: '간장과 올리고당 을 넣어요.', image: '' }
      ]
    })
  })

  it('@graph 와 문자열 순서도 처리하고, Recipe 가 없으면 null', () => {
    const html = `<script type="application/ld+json">{"@graph":[{"@type":["Recipe"],"name":"a","recipeInstructions":"1. 썰기\\n2. 볶기"}]}</script>`
    expect(parseRecipeHtml(html).steps.map((s) => s.text)).toEqual(['1. 썰기', '2. 볶기'])
    expect(parseRecipeHtml('<html>nothing</html>')).toBeNull()
  })
})

import { structureText } from '../src/lib/content.js'

describe('structureText', () => {
  it('리더 본문에서 잡음을 지우고 재료·순서로 나눈다', () => {
    const md = `Title: 멸치볶음 만드는 법
URL Source: https://m.10000recipe.com/recipe/6891816
Markdown Content:
로그인
회원가입
![사진](https://img/1.jpg)
마지막 한 젓가락까지 바삭한 멸치볶음
[재료] Ingredients
* 잔멸치 1컵
* 간장 1스푼 [구매](https://shop)
조리순서 Steps
1. 팬에 기름 없이 멸치를 볶아 비린내를 날려요.
체에 쳐서 가루를 털어요.
2. 간장과 올리고당을 넣고 약불에서 볶아요.
3. 깨를 뿌려 마무리해요.
요리 후기
맛있어요!`
    const r = structureText(md)
    expect(r.ingredients).toEqual(['잔멸치 1컵', '간장 1스푼'])
    expect(r.steps.map((s) => s.text)).toEqual([
      '팬에 기름 없이 멸치를 볶아 비린내를 날려요. 체에 쳐서 가루를 털어요.',
      '간장과 올리고당을 넣고 약불에서 볶아요.',
      '깨를 뿌려 마무리해요.'
    ])
  })

  it('구조를 못 찾으면 정리된 본문 텍스트를 준다', () => {
    const r = structureText('Title: x\n로그인\n이 요리는 아주 간단합니다. 멸치를 볶고 간장을 넣은 다음 잘 섞어서 완성하면 됩니다. 정말 쉬워요.')
    expect(r.text).not.toMatch(/로그인|Title/)
    expect(structureText('')).toBeNull()
  })
})
