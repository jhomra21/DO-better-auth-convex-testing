import { defineConfig } from 'vite'

import solidPlugin from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import { resolve } from 'node:path'
import solid from 'vite-plugin-solid'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    TanStackRouterVite({ target: 'solid', autoCodeSplitting: true }),
    solidPlugin(),
    tailwindcss(),
    solid(),
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  resolve: {
    alias: {
      '~': resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'tools': ['@tanstack/solid-query', 'solid-transition-group', '@tanstack/solid-router-devtools', '@kobalte/core'],
        },
      },
    },
  },
})
