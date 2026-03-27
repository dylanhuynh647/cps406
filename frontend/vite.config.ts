import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return
          }

          if (id.includes('@supabase')) {
            return 'supabase'
          }

          if (id.includes('@tanstack/react-query')) {
            return 'react-query'
          }

          if (id.includes('react-router-dom')) {
            return 'router'
          }

          if (id.includes('react-hook-form') || id.includes('@hookform/resolvers') || id.includes('zod')) {
            return 'forms'
          }

          return 'vendor'
        },
      },
      onwarn(warning, warn) {
        if (
          warning.code === 'MODULE_LEVEL_DIRECTIVE' &&
          typeof warning.message === 'string' &&
          warning.message.includes('"use client"')
        ) {
          return
        }
        warn(warning)
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
