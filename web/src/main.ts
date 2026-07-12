/**
 * 模块：前端应用入口 main。
 * 职责：创建 Vue 应用实例，挂载 Pinia、路由，并启动到 #app 根节点。
 *
 * Material Web 只提供基础控件，业务页面通过项目 M3 组件使用。
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@material/web/button/filled-button.js'
import '@material/web/button/filled-tonal-button.js'
import '@material/web/button/outlined-button.js'
import '@material/web/button/text-button.js'
import '@material/web/checkbox/checkbox.js'
import '@material/web/chips/assist-chip.js'
import '@material/web/chips/filter-chip.js'
import '@material/web/dialog/dialog.js'
import '@material/web/divider/divider.js'
import '@material/web/fab/fab.js'
import '@material/web/iconbutton/filled-icon-button.js'
import '@material/web/iconbutton/filled-tonal-icon-button.js'
import '@material/web/iconbutton/icon-button.js'
import '@material/web/iconbutton/outlined-icon-button.js'
import '@material/web/menu/menu-item.js'
import '@material/web/progress/circular-progress.js'
import '@material/web/progress/linear-progress.js'
import '@material/web/radio/radio.js'
import '@material/web/slider/slider.js'
import '@material/web/switch/switch.js'
import '@material/web/textfield/outlined-text-field.js'

import './design-system/tokens/md3.css'
import './assets/global.css'

import App from './App.vue'
import { CareerDesignSystem } from './design-system/plugin'
import router from './router'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(CareerDesignSystem)

app.mount('#app')
