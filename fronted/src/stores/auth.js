import { ref, computed } from 'vue';
import { httpGet } from '../services/api';

// 本地儲存 key
const TOKEN_KEY = 'quantgem_auth_token';
const USER_KEY = 'quantgem_user';

// 全局狀態
const token = ref(localStorage.getItem(TOKEN_KEY) || null);
const user = ref(JSON.parse(localStorage.getItem(USER_KEY) || 'null'));
const loading = ref(false);
const error = ref(null);

// Computed properties
const isAuthenticated = computed(() => !!token.value && !!user.value);
const isPro = computed(() => user.value?.plan === 'pro' || user.value?.plan === 'enterprise');
const isEnterprise = computed(() => user.value?.plan === 'enterprise');

// API Base URL
const API_BASE = 'http://localhost:3001/api';

// ===================================
// 工具函數
// ===================================

function saveToken(newToken) {
  token.value = newToken;
  if (newToken) {
    localStorage.setItem(TOKEN_KEY, newToken);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

function saveUser(newUser) {
  user.value = newUser;
  if (newUser) {
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
  } else {
    localStorage.removeItem(USER_KEY);
  }
}

function getAuthHeaders() {
  if (!token.value) return {};
  return {
    'Authorization': `Bearer ${token.value}`
  };
}

// ===================================
// 認證API
// ===================================

async function register(email, password, username, fullName) {
  loading.value = true;
  error.value = null;
  
  try {
    const response = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        username,
        full_name: fullName,
      }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || '註冊失敗');
    }
    
    // 儲存 token 和用戶資訊
    saveToken(data.data.token);
    saveUser(data.data.user);
    
    return { success: true, data: data.data };
  } catch (err) {
    error.value = err.message;
    return { success: false, error: err.message };
  } finally {
    loading.value = false;
  }
}

async function login(email, password) {
  loading.value = true;
  error.value = null;
  
  try {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || '登入失敗');
    }
    
    // 儲存 token 和用戶資訊
    saveToken(data.data.token);
    saveUser(data.data.user);
    
    return { success: true, data: data.data };
  } catch (err) {
    error.value = err.message;
    return { success: false, error: err.message };
  } finally {
    loading.value = false;
  }
}

async function logout() {
  loading.value = true;
  
  try {
    // 呼叫後端登出 API（記錄日誌）
    if (token.value) {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
    }
  } catch (err) {
    console.error('Logout error:', err);
  } finally {
    // 無論如何都清除本地資料
    saveToken(null);
    saveUser(null);
    loading.value = false;
  }
}

async function fetchCurrentUser() {
  if (!token.value) {
    return { success: false, error: '未登入' };
  }
  
  loading.value = true;
  error.value = null;
  
  try {
    const response = await fetch(`${API_BASE}/auth/me`, {
      headers: getAuthHeaders(),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      // Token 過期或無效，清除本地資料
      if (response.status === 401) {
        saveToken(null);
        saveUser(null);
      }
      throw new Error(data.message || '獲取用戶資訊失敗');
    }
    
    // 更新用戶資訊
    saveUser(data.data.user);
    
    return { success: true, data: data.data.user };
  } catch (err) {
    error.value = err.message;
    return { success: false, error: err.message };
  } finally {
    loading.value = false;
  }
}

async function updateProfile(profileData) {
  if (!token.value) {
    return { success: false, error: '未登入' };
  }
  
  loading.value = true;
  error.value = null;
  
  try {
    const response = await fetch(`${API_BASE}/auth/profile`, {
      method: 'PUT',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(profileData),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || '更新失敗');
    }
    
    // 更新用戶資訊
    saveUser(data.data.user);
    
    return { success: true, data: data.data.user };
  } catch (err) {
    error.value = err.message;
    return { success: false, error: err.message };
  } finally {
    loading.value = false;
  }
}

async function changePassword(currentPassword, newPassword) {
  if (!token.value) {
    return { success: false, error: '未登入' };
  }
  
  loading.value = true;
  error.value = null;
  
  try {
    const response = await fetch(`${API_BASE}/auth/change-password`, {
      method: 'PUT',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || '修改密碼失敗');
    }
    
    return { success: true, message: data.message };
  } catch (err) {
    error.value = err.message;
    return { success: false, error: err.message };
  } finally {
    loading.value = false;
  }
}

// ===================================
// 權限檢查
// ===================================

function requireAuth() {
  if (!isAuthenticated.value) {
    throw new Error('請先登入');
  }
}

function requirePlan(minPlan = 'pro') {
  requireAuth();
  
  const plans = ['free', 'pro', 'enterprise'];
  const currentPlanIndex = plans.indexOf(user.value.plan);
  const requiredPlanIndex = plans.indexOf(minPlan);
  
  if (currentPlanIndex < requiredPlanIndex) {
    throw new Error(`此功能需要 ${minPlan} 方案`);
  }
}

// ===================================
// 導出
// ===================================

export function useAuth() {
  return {
    // State
    token,
    user,
    loading,
    error,
    
    // Computed
    isAuthenticated,
    isPro,
    isEnterprise,
    
    // Actions
    register,
    login,
    logout,
    fetchCurrentUser,
    updateProfile,
    changePassword,
    
    // Utils
    getAuthHeaders,
    requireAuth,
    requirePlan,
    setToken: saveToken, // 為 OAuth 回調提供的方法
    saveUser,
  };
}
