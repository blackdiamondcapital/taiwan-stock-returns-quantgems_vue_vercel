<script setup>
import { onMounted, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuth } from '../../stores/auth';

const router = useRouter();
const route = useRoute();
const { setToken } = useAuth();

const status = ref('processing'); // processing, success, error
const message = ref('正在處理登入...');

onMounted(async () => {
  try {
    // 從 URL 查詢參數中獲取 token
    const token = route.query.token;
    const provider = route.query.provider;
    const error = route.query.error;

    if (error) {
      status.value = 'error';
      message.value = getErrorMessage(error);
      setTimeout(() => {
        router.push('/');
      }, 3000);
      return;
    }

    if (!token) {
      status.value = 'error';
      message.value = '未收到認證令牌';
      setTimeout(() => {
        router.push('/');
      }, 3000);
      return;
    }

    // 儲存 token
    setToken(token);
    
    status.value = 'success';
    message.value = `${provider === 'google' ? 'Google' : 'Facebook'} 登入成功！`;
    
    // 重定向到首頁
    setTimeout(() => {
      router.push('/');
      window.location.reload(); // 重新載入以更新用戶狀態
    }, 1500);

  } catch (error) {
    console.error('OAuth callback error:', error);
    status.value = 'error';
    message.value = '登入處理失敗，請稍後再試';
    setTimeout(() => {
      router.push('/');
    }, 3000);
  }
});

function getErrorMessage(error) {
  const errorMessages = {
    'google_auth_failed': 'Google 登入失敗',
    'facebook_auth_failed': 'Facebook 登入失敗',
    'token_generation_failed': '令牌生成失敗',
  };
  return errorMessages[error] || '登入失敗';
}
</script>

<template>
  <div class="oauth-callback">
    <div class="callback-card">
      <div v-if="status === 'processing'" class="status-content">
        <div class="spinner">
          <i class="fas fa-spinner fa-spin"></i>
        </div>
        <h2>{{ message }}</h2>
        <p>請稍候，正在為您完成登入...</p>
      </div>

      <div v-else-if="status === 'success'" class="status-content success">
        <div class="icon">
          <i class="fas fa-check-circle"></i>
        </div>
        <h2>{{ message }}</h2>
        <p>即將跳轉到首頁...</p>
      </div>

      <div v-else-if="status === 'error'" class="status-content error">
        <div class="icon">
          <i class="fas fa-exclamation-circle"></i>
        </div>
        <h2>{{ message }}</h2>
        <p>將自動返回首頁...</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.oauth-callback {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1d2e 0%, #16213e 100%);
  padding: 20px;
}

.callback-card {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 48px 40px;
  max-width: 500px;
  width: 100%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.status-content {
  text-align: center;
  color: white;
}

.spinner {
  font-size: 48px;
  color: #4fc3f7;
  margin-bottom: 24px;
}

.icon {
  font-size: 64px;
  margin-bottom: 24px;
}

.success .icon {
  color: #4caf50;
}

.error .icon {
  color: #f44336;
}

h2 {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 12px;
  color: white;
}

p {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.7);
  margin: 0;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.fa-spin {
  animation: spin 1s linear infinite;
}
</style>
