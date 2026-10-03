import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages 프로젝트 사이트는 /<저장소 이름>/ 아래에서 서비스된다.
// 배포 워크플로가 BASE_PATH 로 넘겨주고, 로컬 개발은 / 를 쓴다.
const base = process.env.BASE_PATH || '/'

export default defineConfig({
  base,
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        id: base,
        name: '요리 레시피',
        short_name: '요리 레시피',
        description: '유튜브·만개의레시피 링크를 모아 보는 나만의 요리 레시피 앱',
        lang: 'ko',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#fff8f3',
        theme_color: '#e8622c',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        // 유튜브·브라우저의 "공유하기" → 이 앱 선택 시 ?title=&text=&url= 로 열린다
        share_target: {
          action: base,
          method: 'GET',
          params: { title: 'title', text: 'text', url: 'url' }
        },
        // 앱 아이콘 길게 누르기 메뉴
        shortcuts: [
          { name: '레시피 추가', url: `${base}?add=1`, icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: '오늘 뭐 먹지?', url: `${base}?random=1`, icons: [{ src: 'icon-192.png', sizes: '192x192' }] }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        navigateFallback: `${base}index.html`,
        importScripts: ['sw-notify.js'],
        // 썸네일·조리 사진을 한 번 보면 저장해 두어 인터넷이 약해도 보이게 한다
        runtimeCaching: [
          {
            urlPattern: ({ request, sameOrigin }) => request.destination === 'image' && !sameOrigin,
            handler: 'CacheFirst',
            options: {
              cacheName: 'recipe-images',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ],
  test: {
    include: ['tests/**/*.test.js']
  }
})
