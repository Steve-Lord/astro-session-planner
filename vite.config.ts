/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'catalog.json'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,json}'],
      },
      manifest: {
        name: 'Astro Session Planner',
        short_name: 'Session Planner',
        display: 'standalone',
        start_url: './',
        scope: './',
        background_color: '#0b1020',
        theme_color: '#0b1020',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
})
