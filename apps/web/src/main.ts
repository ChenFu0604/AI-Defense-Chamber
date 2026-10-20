import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import './styles/main.css'
import './styles/projects.css'
import './styles/analysis.css'
import './styles/judges.css'
import './styles/defense.css'
import './styles/settings.css'
import './styles/report.css'

createApp(App).use(createPinia()).use(router).mount('#app')
