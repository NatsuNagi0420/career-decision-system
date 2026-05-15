import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

// Import fonts first
import '@/assets/styles/fonts.css'
import '@/assets/styles/variables.css'
import '@/assets/styles/global.css'
import '@/assets/styles/unified.css'

createApp(App).use(router).mount('#app')
