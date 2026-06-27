import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: '凝时 Zept',
        short_name: '凝时',
        description: '备考专注陪伴 PWA — 番茄计时 + AI 洞察 + 关怀门',
        theme_color: '#0E1014',
        background_color: '#0E1014',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,           // 监听 0.0.0.0，允许局域网设备访问
    port: 5173,
    strictPort: false,    // 端口被占时自动找下一个（5174/5175...）
  },
});
