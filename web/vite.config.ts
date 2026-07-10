import { fileURLToPath, URL } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

const defaultLocalHttpsCertFile = fileURLToPath(
  new URL('../.local-https/local-cert.pem', import.meta.url)
)
const defaultLocalHttpsKeyFile = fileURLToPath(
  new URL('../.local-https/local-key.pem', import.meta.url)
)

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

function backendOriginFromEnv(env: Record<string, string>) {
  const backendBaseUrl = env.VITE_BACKEND_BASE_URL?.trim()
  if (backendBaseUrl) return stripTrailingSlash(backendBaseUrl)

  const apiBaseUrl = env.VITE_API_BASE_URL?.trim()
  if (apiBaseUrl) {
    return stripTrailingSlash(apiBaseUrl.replace(/\/api(?:\/v1)?\/?$/, ''))
  }

  return 'https://127.0.0.1:8443'
}

function createLocalHttpsOptions(env: Record<string, string>) {
  if (env.VITE_DEV_HTTPS !== 'true') return undefined

  const certFile = (env.VITE_HTTPS_CERT_FILE || defaultLocalHttpsCertFile).trim()
  const keyFile = (env.VITE_HTTPS_KEY_FILE || defaultLocalHttpsKeyFile).trim()

  if (!existsSync(certFile) || !existsSync(keyFile)) {
    throw new Error(
      `Local HTTPS certificate files were not found. Run scripts/setup-local-https.ps1 first. cert=${certFile}, key=${keyFile}`
    )
  }

  return {
    cert: readFileSync(certFile),
    key: readFileSync(keyFile)
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendOrigin = backendOriginFromEnv(env)

  return {
    plugins: [
      vue(),
      AutoImport({
        resolvers: [ElementPlusResolver()]
      }),
      Components({
        resolvers: [ElementPlusResolver()]
      })
    ],
    server: {
      host: '0.0.0.0',
      port: 5173,
      https: createLocalHttpsOptions(env),
      allowedHosts: true,
      proxy: {
        '/api': {
          target: backendOrigin,
          changeOrigin: true,
          secure: false
        },
        '/images': {
          target: backendOrigin,
          changeOrigin: true,
          secure: false
        }
      }
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vue-vendor': ['vue', 'vue-router', 'pinia'],
            'element-plus': ['element-plus'],
            echarts: ['echarts'],
            utils: [
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
