// Basic API service wrapper
//export const API_BASE_URL = `${window.location.origin}/api`;
export const API_BASE_URL = (import.meta?.env?.VITE_API_BASE_URL ?? `${window.location.origin}/api`).replace(/\/$/, '');

export async function httpGet(path, params = {}) {
  const url = new URL(`${API_BASE_URL}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    url.searchParams.set(k, String(v));
  });
  const resp = await fetch(url.toString());
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

// Placeholders to be expanded in next steps
export async function fetchRankings({ period, market, industry, returnRange, volumeThreshold, date, limit = 50 }) {
  try {
    const json = await httpGet('/returns/rankings', { period, market, industry, returnRange, volumeThreshold, date, limit });
    return json?.data ?? [];
  } catch (e) {
    console.warn('fetchRankings error', e);
    return [];
  }
}

export async function fetchStatistics({ period, market, date }) {
  try {
    const json = await httpGet('/returns/statistics', { period, market, date });
    return { data: json?.data ?? null, asOfDate: json?.asOfDate ?? null };
  } catch (e) {
    console.warn('fetchStatistics error', e);
    return { data: null, asOfDate: null };
  }
}

export async function fetchComparison({ symbols, period, date, market }) {
  try {
    const symbolParam = Array.isArray(symbols) ? symbols.join(',') : symbols;
    const json = await httpGet('/returns/comparison', { symbols: symbolParam, period, date, market });
    return {
      data: json?.data ?? [],
      asOfDate: json?.asOfDate ?? null,
      count: json?.count ?? 0,
    };
  } catch (e) {
    console.warn('fetchComparison error', e);
    return { data: [], asOfDate: null, count: 0 };
  }
}

// Fetch stock news
export async function fetchStockNews(symbol, limit = 10) {
  try {
    const json = await httpGet(`/stocks/${symbol}/news`, { limit });
    return json?.data ?? [];
  } catch (e) {
    console.warn('fetchStockNews error', e);
    // Return mock data if API fails
    return [
      {
        id: 1,
        title: '股价创新高，市场关注度提升',
        source: '财经日报',
        time: '2小时前',
        publishedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
        sentiment: 'positive',
        summary: '受惠于营收成长及获利表现优异，股价突破前高，市场看好后续发展...'
      },
      {
        id: 2,
        title: '法人看好后市发展',
        source: '投资周刊',
        time: '5小时前',
        publishedAt: new Date(Date.now() - 5 * 3600000).toISOString(),
        sentiment: 'positive',
        summary: '外资连续买超，法人研究报告给予买进评等，目标价上看新高...'
      },
      {
        id: 3,
        title: '产业竞争加剧，关注市占率变化',
        source: '市场观察',
        time: '1天前',
        publishedAt: new Date(Date.now() - 24 * 3600000).toISOString(),
        sentiment: 'neutral',
        summary: '面对同业竞争压力，公司积极布局新产品线，市场关注市占率变化...'
      }
    ];
  }
}

// Fetch stock financial metrics
export async function fetchStockFinancials(symbol) {
  try {
    const json = await httpGet(`/stocks/${symbol}/financials`);
    return json?.data ?? null;
  } catch (e) {
    console.warn('fetchStockFinancials error', e);
    // Return mock data if API fails
    return {
      pe: '15.6',
      pb: '2.3',
      roe: '18.5%',
      dividend: '4.2%',
      marketCap: '1,250亿',
      eps: '6.8',
      revenue: '520亿',
      profit: '85亿',
      grossMargin: '48.5%',
      debtRatio: '12.3%'
    };
  }
}

// Fetch stock price history for charts
export async function fetchStockPriceHistory(symbol, period = '1M') {
  try {
    console.log('Fetching real price history for', symbol, period);
    const json = await httpGet(`/stocks/${symbol}/price-history`, { period });
    
    if (json?.data && Array.isArray(json.data) && json.data.length > 0) {
      console.log('Real data loaded:', json.data.length, 'records');
      // Transform backend data to chart format if needed
      return json.data.map(item => ({
        time: item.date || item.time,
        open: parseFloat(item.open),
        high: parseFloat(item.high),
        low: parseFloat(item.low),
        close: parseFloat(item.close),
        volume: parseInt(item.volume || item.vol || 0)
      }));
    }
    
    console.warn('No data from API for', symbol, period);
    return [];
  } catch (e) {
    console.warn('fetchStockPriceHistory error:', e.message);
    throw e;
  }
}

// Helper function to generate mock data
function generateMockPriceData(period = '1M', basePrice = null) {
  const now = Date.now();
  const mockData = [];
  // '1D' means daily K-line chart showing recent ~60 days
  const days = period === '1D' ? 60 : period === '1W' ? 90 : period === '1M' ? 120 : period === '3M' ? 180 : period === '6M' ? 365 : 730;
  
  let price = basePrice || (100 + Math.random() * 50);
  
  for (let i = days; i >= 0; i--) {
    const date = new Date(now - i * 24 * 3600000);
    // Add some trend and volatility
    price = price + (Math.random() - 0.48) * 2;
    const open = price + (Math.random() - 0.5) * 2;
    const close = price + (Math.random() - 0.5) * 2;
    const high = Math.max(open, close) + Math.random() * 3;
    const low = Math.min(open, close) - Math.random() * 3;
    
    mockData.push({
      time: date.toISOString().split('T')[0],
      open: Math.max(0, open),
      high: Math.max(0, high),
      low: Math.max(0, low),
      close: Math.max(0, close),
      volume: Math.floor(Math.random() * 10000000 + 1000000)
    });
  }
  return mockData;
}

// Fetch latest quote for a symbol
export async function fetchStockQuote(symbol) {
  try {
    const json = await httpGet(`/stocks/${symbol}/quote`);
    return json?.data ?? null;
  } catch (e) {
    console.warn('fetchStockQuote error', e);
    return null;
  }
}

// Fetch stock performance data
export async function fetchStockPerformance(symbol) {
  try {
    const json = await httpGet(`/stocks/${symbol}/performance`);
    return json?.data ?? null;
  } catch (e) {
    console.warn('fetchStockPerformance error', e);
    // Return mock data if API fails
    return {
      daily: (Math.random() - 0.5) * 5,
      weekly: (Math.random() - 0.5) * 10,
      monthly: (Math.random() - 0.5) * 15,
      quarterly: (Math.random() - 0.3) * 20,
      yearly: (Math.random() - 0.2) * 30
    };
  }
}

// Watchlist management
export async function fetchWatchlist() {
  try {
    const json = await httpGet('/user/watchlist');
    return json?.data ?? [];
  } catch (e) {
    console.warn('fetchWatchlist error', e);
    // Fallback to localStorage
    const stored = localStorage.getItem('watchlist');
    return stored ? JSON.parse(stored) : [];
  }
}

export async function addToWatchlist(symbol) {
  try {
    const json = await httpGet('/user/watchlist/add', { symbol });
    return json?.success ?? false;
  } catch (e) {
    console.warn('addToWatchlist error', e);
    // Fallback to localStorage
    const stored = localStorage.getItem('watchlist');
    const watchlist = stored ? JSON.parse(stored) : [];
    if (!watchlist.includes(symbol)) {
      watchlist.push(symbol);
      localStorage.setItem('watchlist', JSON.stringify(watchlist));
    }
    return true;
  }
}

export async function removeFromWatchlist(symbol) {
  try {
    const json = await httpGet('/user/watchlist/remove', { symbol });
    return json?.success ?? false;
  } catch (e) {
    console.warn('removeFromWatchlist error', e);
    // Fallback to localStorage
    const stored = localStorage.getItem('watchlist');
    const watchlist = stored ? JSON.parse(stored) : [];
    const filtered = watchlist.filter(s => s !== symbol);
    localStorage.setItem('watchlist', JSON.stringify(filtered));
    return true;
  }
}
