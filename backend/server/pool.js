import pkg from 'pg';
const { Pool } = pkg;

const baseConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'quantgem',
    };

const requireSsl = String(process.env.DB_SSL_REQUIRE ?? (process.env.NODE_ENV === 'production'))
  .toLowerCase() === 'true';

if (requireSsl) {
  baseConfig.ssl = { 
    rejectUnauthorized: false 
  };
}

// 連接池配置
baseConfig.max = 10; // 最大連線數（免費方案建議 5-10）
baseConfig.idleTimeoutMillis = 30000; // 閒置連線 30 秒後釋放
baseConfig.connectionTimeoutMillis = 10000; // 連線超時 10 秒

export const pool = new Pool(baseConfig);

// 連接池錯誤處理
pool.on('error', (err) => {
  console.error('Unexpected pool error:', err);
});

// 優雅關閉
process.on('SIGTERM', () => {
  pool.end(() => {
    console.log('Pool has ended');
  });
});
