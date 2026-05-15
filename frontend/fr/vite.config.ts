import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiBaseUrl = env.VITE_API_BASE_URL || 'http://localhost:8080/api'
  const backendOrigin = env.VITE_BACKEND_ORIGIN || apiBaseUrl.replace(/\/api\/?$/, '')

  return {
    plugins: [
      vue(),
      AutoImport({
        resolvers: [ElementPlusResolver()],
      }),
      Components({
        resolvers: [ElementPlusResolver()],
      }),
    ],
    server: {
      host: '0.0.0.0', // 允许通过 IP 访问
      port: 5173,      // 前端监听端口
      allowedHosts: ['frp-end.com', '.natfrp.cloud', 'localhost', '127.0.0.1'],
      // hmr: {
      //   clientPort: 443, // 如果使用 HTTPS 穿透时启用
      // },
      proxy: {
        '/api': {
          target: backendOrigin,
          changeOrigin: true,
        },
        '/images': {
          target: backendOrigin,
          changeOrigin: true,
        },
      },
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vue-vendor': ['vue', 'vue-router', 'pinia'],
            'element-plus': ['element-plus'],
            'echarts': ['echarts'],
            'utils': [
              './src/utils/request',
              './src/utils/storage',
              './src/utils/sseParser'
            ]
          }
        }
      },
      chunkSizeWarningLimit: 1000,
      cssCodeSplit: true
    }
  }
})
