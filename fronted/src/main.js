import { createApp } from 'vue'
import './style.css'
import './legacy.css'
import './styles/auth.css'
import './styles/payment.css'
// import './styles/gaming-leaderboard.css'  // 方案三：競技風格
// import './styles/dashboard-leaderboard.css'  // 方案二：儀表板風格
import './styles/waterfall-leaderboard.css'  // 方案五：分組瀑布流
import App from './App.vue'

createApp(App).mount('#app')
