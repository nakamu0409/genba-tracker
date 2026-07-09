// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@vite-pwa/nuxt'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    genbaAdminKey: process.env.GENBA_ADMIN_KEY || '',
    turso: {
      databaseUrl: process.env.TURSO_DATABASE_URL || '',
      authToken: process.env.TURSO_AUTH_TOKEN || ''
    },
    r2: {
      accountId: process.env.R2_ACCOUNT_ID || '',
      accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
      bucket: process.env.R2_BUCKET_NAME || '',
      publicUrlBase: process.env.R2_PUBLIC_URL_BASE || ''
    },
    resend: {
      apiKey: process.env.RESEND_API_KEY || ''
    },
    public: {
      // アフィリエイトID（未設定でもリンク自体は表示され、通常リンクになる）
      rakutenAffiliateId: process.env.NUXT_PUBLIC_RAKUTEN_AFFILIATE_ID || '',
      tripAllianceId: process.env.NUXT_PUBLIC_TRIP_ALLIANCE_ID || '',
      tripSid: process.env.NUXT_PUBLIC_TRIP_SID || ''
    }
  },

  routeRules: {
    '/': { prerender: true },
    '/genba': { ssr: false },
    '/genba/**': { ssr: false }
  },

  compatibilityDate: '2025-01-15',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: '現場記録',
      short_name: '現場記録',
      description: 'アイドル現場のチケット・チェキ・グッズ・ドリンク代を記録するアプリ',
      theme_color: '#00A155',
      background_color: '#ffffff',
      display: 'standalone',
      start_url: '/genba',
      icons: [
        { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    },
    workbox: {
      navigateFallback: '/genba',
      globPatterns: ['**/*.{js,css,html,png,svg,ico}']
    },
    devOptions: {
      enabled: true,
      type: 'module'
    }
  }
})
