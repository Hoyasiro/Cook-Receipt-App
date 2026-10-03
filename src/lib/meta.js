import { youtubeId } from './recipes.js'

// 정적 호스팅(GitHub Pages)이라 다른 사이트 HTML 을 직접 읽을 수 없다(CORS).
// 그래서 CORS 를 허용하는 공개 API 로 제목·대표 사진을 가져온다. 실패해도 앱은 그대로 동작한다.

async function getJson(url, ms = 8000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** 링크의 { title, image } 를 최대한 가져온다 */
export async function fetchMeta(url) {
  const yt = youtubeId(url)
  if (yt) {
    // 유튜브 썸네일은 영상 ID 만으로 주소가 정해진다
    const image = `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`
    const data = await getJson(`https://noembed.com/embed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${yt}`)}`)
    return { title: data?.title || '', image }
  }
  const data = await getJson(`https://api.microlink.io/?url=${encodeURIComponent(url)}`)
  if (data?.status === 'success') {
    return { title: data.data?.title || '', image: data.data?.image?.url || '' }
  }
  return { title: '', image: '' }
}
