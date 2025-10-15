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
  baseConfig.ssl = { require: true, rejectUnauthorized: false };
}

export const pool = new Pool(baseConfig);
