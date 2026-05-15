/**
 * 模块：前端应用入口 main。
 * 职责：创建 Vue 应用实例，挂载 Pinia、路由，并启动到 #app 根节点。
 *
 * 性能优化：Element Plus 使用按需导入（通过 unplugin-vue-components 自动处理）
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
// Element Plus 按需导入 - 由 unplugin-vue-components 自动处理
// 仅保留全局样式和中文语言包
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'

import './assets/global.css'

import App from './App.vue'
import router from './router'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
