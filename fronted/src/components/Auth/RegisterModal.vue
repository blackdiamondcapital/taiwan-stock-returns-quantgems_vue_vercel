<script setup>
import { ref } from 'vue';
import { useAuth } from '../../stores/auth';

const emit = defineEmits(['close', 'switchToLogin', 'registerSuccess']);

const { register, loading } = useAuth();

const formData = ref({
  email: '',
  password: '',
  confirmPassword: '',
  username: '',
  fullName: '',
  agreeTerms: false,
});

const showPassword = ref(false);
const showConfirmPassword = ref(false);
const errorMessage = ref('');

async function handleSubmit() {
  errorMessage.value = '';
  
  // 驗證
  if (!formData.value.email) {
    errorMessage.value = '請輸入 Email';
    return;
  }
  
  if (!formData.value.password) {
    errorMessage.value = '請輸入密碼';
    return;
  }
  
  if (formData.value.password.length < 6) {
    errorMessage.value = '密碼至少需要 6 個字元';
    return;
  }
  
  if (formData.value.password !== formData.value.confirmPassword) {
    errorMessage.value = '密碼不一致';
    return;
  }
  
  if (!formData.value.agreeTerms) {
    errorMessage.value = '請同意服務條款';
    return;
  }
  
  const result = await register(
    formData.value.email,
    formData.value.password,
    formData.value.username,
    formData.value.fullName
  );
  
  if (result.success) {
    emit('registerSuccess');
    emit('close');
  } else {
    errorMessage.value = result.error;
  }
}

function handleSwitchToLogin() {
  emit('switchToLogin');
}

function handleGoogleLogin() {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  window.location.href = `${apiUrl}/api/auth/google`;
}

function handleFacebookLogin() {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  window.location.href = `${apiUrl}/api/auth/facebook`;
}
</script>

<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="auth-modal auth-modal--large">
      <button class="modal-close" @click="$emit('close')">
        <i class="fas fa-times"></i>
      </button>
      
      <div class="auth-modal-content">
        <div class="auth-header">
          <div class="auth-icon">
            <i class="fas fa-rocket"></i>
          </div>
          <h2>加入 QuantGem</h2>
          <p>開始您的智能投資之旅</p>
        </div>
        
        <form @submit.prevent="handleSubmit" class="auth-form">
          <div v-if="errorMessage" class="alert alert--error">
            <i class="fas fa-exclamation-circle"></i>
            {{ errorMessage }}
          </div>
          
          <div class="form-row">
            <div class="form-field">
              <label>Email *</label>
              <div class="input-wrapper">
                <i class="fas fa-envelope"></i>
                <input
                  v-model="formData.email"
                  type="email"
                  placeholder="your@email.com"
                  required
                  autocomplete="email"
                />
              </div>
            </div>
          </div>
          
          <div class="form-row">
            <div class="form-field">
              <label>用戶名稱</label>
              <div class="input-wrapper">
                <i class="fas fa-user"></i>
                <input
                  v-model="formData.username"
                  type="text"
                  placeholder="選填"
                  autocomplete="username"
                />
              </div>
            </div>
            
            <div class="form-field">
              <label>姓名</label>
              <div class="input-wrapper">
                <i class="fas fa-id-card"></i>
                <input
                  v-model="formData.fullName"
                  type="text"
                  placeholder="選填"
                  autocomplete="name"
                />
              </div>
            </div>
          </div>
          
          <div class="form-row">
            <div class="form-field">
              <label>密碼 *</label>
              <div class="input-wrapper">
                <i class="fas fa-lock"></i>
                <input
                  v-model="formData.password"
                  :type="showPassword ? 'text' : 'password'"
                  placeholder="至少 6 個字元"
                  required
                  autocomplete="new-password"
                />
                <button
                  type="button"
                  class="toggle-password"
                  @click="showPassword = !showPassword"
                >
                  <i class="fas" :class="showPassword ? 'fa-eye-slash' : 'fa-eye'"></i>
                </button>
              </div>
            </div>
            
            <div class="form-field">
              <label>確認密碼 *</label>
              <div class="input-wrapper">
                <i class="fas fa-lock"></i>
                <input
                  v-model="formData.confirmPassword"
                  :type="showConfirmPassword ? 'text' : 'password'"
                  placeholder="再次輸入密碼"
                  required
                  autocomplete="new-password"
                />
                <button
                  type="button"
                  class="toggle-password"
                  @click="showConfirmPassword = !showConfirmPassword"
                >
                  <i class="fas" :class="showConfirmPassword ? 'fa-eye-slash' : 'fa-eye'"></i>
                </button>
              </div>
            </div>
          </div>
          
          <div class="form-field-checkbox">
            <label>
              <input
                v-model="formData.agreeTerms"
                type="checkbox"
                required
              />
              <span>我同意 <a href="#" class="link">服務條款</a> 和 <a href="#" class="link">隱私政策</a></span>
            </label>
          </div>
          
          <button type="submit" class="btn-auth" :disabled="loading">
            <span v-if="loading">
              <i class="fas fa-spinner fa-spin"></i> 註冊中...
            </span>
            <span v-else>
              <i class="fas fa-user-plus"></i> 註冊帳號
            </span>
          </button>
        </form>
        
        <div class="divider">
          <span>或使用社群帳號註冊</span>
        </div>
        
        <div class="oauth-buttons">
          <button @click="handleGoogleLogin" class="btn-oauth btn-google">
            <svg class="oauth-icon" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span>使用 Google 註冊</span>
          </button>
          
          <button @click="handleFacebookLogin" class="btn-oauth btn-facebook">
            <svg class="oauth-icon" viewBox="0 0 24 24">
              <path fill="#1877F2" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            <span>使用 Facebook 註冊</span>
          </button>
        </div>
        
        <div class="auth-footer">
          <p>
            已經有帳號了？
            <button class="link-button" @click="handleSwitchToLogin">
              立即登入
            </button>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.divider {
  position: relative;
  text-align: center;
  margin: 24px 0;
}

.divider::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
}

.divider span {
  position: relative;
  padding: 0 16px;
  background: #1a1d2e;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
}

.oauth-buttons {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
}

.btn-oauth {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  padding: 12px 20px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: white;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-oauth:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
  transform: translateY(-1px);
}

.btn-oauth:active {
  transform: translateY(0);
}

.btn-google:hover {
  background: rgba(66, 133, 244, 0.1);
  border-color: #4285F4;
}

.btn-facebook:hover {
  background: rgba(24, 119, 242, 0.1);
  border-color: #1877F2;
}

.oauth-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}
</style>
