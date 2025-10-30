import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import passport from './config/passport.js';
import authRoutes from './routes/auth.js';
import paymentRoutes from './routes/payment.js';
import notificationRoutes from './routes/notifications.js';
import createStockRoutes from './routes/stocks.js';
import createReturnsRoutes from './routes/returns.js';
import { pool } from './pool.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// .env has already been loaded via import 'dotenv/config' at module load time
// Whether to serve demo responses when DB queries fail
const USE_FALLBACK = String(process.env.USE_FALLBACK).toLowerCase() === 'true';

// Global error handlers to avoid process crash and keep server alive
process.on('unhandledRejection', (reason) => {
  console.error('UnhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('UncaughtException:', err);
});

const app = express();
const PORT = process.env.PORT || 3000;

// Configure CORS to allow requests from frontend
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests from any origin in development, specific origins in production
    if (process.env.NODE_ENV === 'production') {
      const allowedOrigins = [
        'https://quantgems.com',
        'https://www.quantgems.com',
        'https://quantgems.vercel.app'
      ];
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    } else {
      // Allow all origins in development
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // For ECPay form data

// Session middleware (required for Passport)
app.use(session({
  secret: process.env.SESSION_SECRET || 'quantgem-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// PostgreSQL pool is imported from ./pool.js

const stockRoutes = createStockRoutes(pool);
const returnsRoutes = createReturnsRoutes(pool);

// 認證路由
app.use('/api/auth', authRoutes);

// 支付路由
app.use('/api/payment', paymentRoutes);

// 通知路由
app.use('/api/notifications', notificationRoutes);

// 股票報酬率路由
app.use('/api/returns', returnsRoutes);

// 股票資料路由
app.use('/api/stocks', stockRoutes);

// Map period to frequency code used in DB
function mapPeriod(period) {
  if (!period) return 'all';
  const p = String(period).toLowerCase();
  if (p.startsWith('day')) return 'D';
  if (p.startsWith('week')) return 'W';
  if (p.startsWith('month')) return 'M';
  if (p.startsWith('quarter')) return 'Q';
  if (p.startsWith('year')) return 'Y';
  return 'all';
}

function toIsoDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function normalizeSymbolValue(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\.(TW|TWO)$/i, '');
}

function parseSymbolsParam(raw) {
  if (!raw) return [];

  const seen = new Set();
  const result = [];

  const push = (value) => {
    const sym = String(value || '').trim().toUpperCase();
    if (!sym) return;
    if (seen.has(sym)) return;
    seen.add(sym);
    result.push(sym);
  };

  const entries = Array.isArray(raw)
    ? raw.flatMap(item => String(item || '').split(/[\,\s]+/))
    : String(raw).split(/[\,\s]+/);

  entries.forEach(item => {
    const trimmed = String(item || '').trim();
    if (!trimmed) return;

    const upper = trimmed.toUpperCase();
    push(upper);

    const normalized = normalizeSymbolValue(upper);
    if (normalized && normalized !== upper) push(normalized);

    if (!upper.includes('.') && normalized) {
      push(`${normalized}.TW`);
      push(`${normalized}.TWO`);
    }
  });

  return result.slice(0, 60);
}

async function resolveStockDate(client, requestedDate) {
  const isoRequested = toIsoDate(requestedDate);
  if (isoRequested) {
    const check = await client.query('SELECT COUNT(*) AS cnt FROM tw_stock_returns WHERE date = $1', [isoRequested]);
    if (Number(check.rows[0]?.cnt || 0) > 0) return isoRequested;
    const fallback = await client.query('SELECT MAX(date) AS latest FROM tw_stock_returns WHERE date <= $1', [isoRequested]);
    if (fallback.rows[0]?.latest) return fallback.rows[0].latest;

    const priceExact = await client.query('SELECT COUNT(*) AS cnt FROM tw_stock_prices WHERE date = $1', [isoRequested]);
    if (Number(priceExact.rows[0]?.cnt || 0) > 0) return isoRequested;

    const priceFallback = await client.query('SELECT MAX(date) AS latest FROM tw_stock_prices WHERE date <= $1', [isoRequested]);
    if (priceFallback.rows[0]?.latest) return priceFallback.rows[0].latest;
  }
  const latestReturns = await client.query('SELECT MAX(date) AS latest FROM tw_stock_returns');
  if (latestReturns.rows[0]?.latest) return latestReturns.rows[0].latest;

  const latestPrices = await client.query('SELECT MAX(date) AS latest FROM tw_stock_prices');
  return latestPrices.rows[0]?.latest || null;
}

// Health
app.get('/api/health', async (req, res) => {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    res.json({ status: 'connected', database: 'PostgreSQL', timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ status: 'disconnected', error: e.message });
  }
});

// Statistics endpoint expected by front-end
app.get('/api/returns/statistics', async (req, res) => {
  const { period = 'daily', market = 'all', date } = req.query;
  const periodKey = String(period || 'daily').toLowerCase();
  const periodReturnColumns = {
    daily: 'daily_return',
    weekly: 'weekly_return',
    monthly: 'monthly_return',
    quarterly: 'quarterly_return',
    yearly: 'yearly_return',
  };
  const returnColumn = periodReturnColumns[periodKey] || periodReturnColumns.daily;
  const periodWindowDays = {
    daily: 1,
    weekly: 5,
    monthly: 21,
    quarterly: 63,
    yearly: 252,
  };
  const windowDays = periodWindowDays[periodKey] || periodWindowDays.daily;
  let client;
  try {
    client = await pool.connect();
    const targetDate = await resolveStockDate(client, date);

    if (!targetDate) {
      if (!USE_FALLBACK) return res.status(404).json({ error: 'No data available' });
      return res.json({ data: fallbackStats(), asOfDate: date || new Date().toISOString().slice(0, 10), fallback: true });
    }

    const isoDate = toIsoDate(targetDate) || targetDate;

    const metricsSql = `
      WITH twii_volume AS (
        SELECT
          COALESCE(volume, 0)::numeric AS market_volume
        FROM tw_stock_prices
        WHERE symbol = '^TWII'
          AND date = $1::date
        LIMIT 1
      ),
      base AS (
        SELECT
          r.symbol,
          r.date,
          COALESCE(r.daily_return, 0)::numeric AS daily_return,
          COALESCE(sp.volume, 0)::numeric AS volume,
          COALESCE(sp.close_price, 0)::numeric AS close_price,
          ROW_NUMBER() OVER (PARTITION BY r.symbol ORDER BY r.date DESC) AS rn
        FROM tw_stock_returns r
        LEFT JOIN tw_stock_prices sp ON sp.symbol = r.symbol AND sp.date = r.date
        LEFT JOIN tw_stock_symbols s ON s.symbol = r.symbol
        WHERE r.date <= $1::date
          AND (
            $2::text = 'all'
            OR s.market = $2::text
          )
      ),
      aggregated AS (
        SELECT
          symbol,
          SUM(
            CASE
              WHEN rn BETWEEN 1 AND $3 AND (1 + daily_return) > 0 THEN LN(1 + daily_return)
              ELSE 0
            END
          ) AS log_return_sum,
          BOOL_AND(
            CASE
              WHEN rn BETWEEN 1 AND $3 THEN (1 + daily_return) > 0
              ELSE TRUE
            END
          ) AS all_positive_returns,
          COUNT(*) FILTER (WHERE rn BETWEEN 1 AND $3) AS window_count,
          MAX(volume) FILTER (WHERE rn = 1)::numeric AS latest_volume,
          MAX(close_price) FILTER (WHERE rn = 1)::numeric AS latest_close,
          MAX(close_price) FILTER (WHERE rn = $3 + 1)::numeric AS prior_close,
          MAX(daily_return) FILTER (WHERE rn = 1)::numeric AS latest_daily_return,
          BOOL_OR(
            CASE
              WHEN rn = $3 + 1 AND close_price IS NOT NULL AND close_price > 0 THEN TRUE
              ELSE FALSE
            END
          ) AS has_prior_close
        FROM base
        WHERE rn <= $3 + 1
        GROUP BY symbol
      ),
      prior_price AS (
        SELECT
          sp.symbol,
          sp.close_price AS price_before_window,
          sp.date AS price_date
        FROM (
          SELECT DISTINCT ON (sp.symbol)
            sp.symbol,
            sp.close_price,
            sp.date
          FROM tw_stock_prices sp
          LEFT JOIN tw_stock_symbols s ON s.symbol = sp.symbol
          WHERE sp.date < $1::date
            AND (
              $2::text = 'all'
              OR s.market = $2::text
            )
          ORDER BY sp.symbol, sp.date DESC
        ) sp
      ),
      returns AS (
        SELECT
          a.symbol,
          CASE
            WHEN $3 = 1 AND a.latest_daily_return IS NOT NULL THEN a.latest_daily_return
            WHEN a.has_prior_close THEN (a.latest_close / a.prior_close) - 1
            WHEN a.window_count = $3 AND a.all_positive_returns THEN EXP(a.log_return_sum) - 1
            WHEN pp.price_before_window IS NOT NULL AND pp.price_before_window > 0 THEN (a.latest_close / pp.price_before_window) - 1
            ELSE NULL
          END AS period_return,
          COALESCE(a.latest_volume, 0)::numeric AS volume,
          COALESCE(a.latest_close, 0)::numeric AS latest_close,
          CASE
            WHEN a.has_prior_close THEN a.prior_close
            WHEN a.window_count = $3 AND a.all_positive_returns THEN a.latest_close / NULLIF(EXP(a.log_return_sum), 0)
            ELSE pp.price_before_window
          END AS prior_close
        FROM aggregated a
        LEFT JOIN prior_price pp ON pp.symbol = a.symbol
      ),
      price_today AS (
        SELECT
          sp.symbol,
          COALESCE(sp.high_price, sp.close_price, 0)::numeric AS current_high,
          COALESCE(sp.close_price, 0)::numeric AS current_close,
          COALESCE(sp.low_price, sp.close_price, 0)::numeric AS current_low
        FROM tw_stock_prices sp
        LEFT JOIN tw_stock_symbols s ON s.symbol = sp.symbol
        WHERE sp.date = $1::date
          AND (
            $2::text = 'all'
            OR s.market = $2::text
          )
      ),
      high_52w AS (
        SELECT
          sp.symbol,
          MAX(COALESCE(sp.high_price, sp.close_price, 0))::numeric AS high_52w
        FROM tw_stock_prices sp
        LEFT JOIN tw_stock_symbols s ON s.symbol = sp.symbol
        WHERE sp.date BETWEEN $1::date - INTERVAL '365 days' AND $1::date
          AND (
            $2::text = 'all'
            OR s.market = $2::text
          )
        GROUP BY sp.symbol
      ),
      low_52w AS (
        SELECT
          sp.symbol,
          MIN(COALESCE(sp.low_price, sp.close_price, 0))::numeric AS low_52w
        FROM tw_stock_prices sp
        LEFT JOIN tw_stock_symbols s ON s.symbol = sp.symbol
        WHERE sp.date BETWEEN $1::date - INTERVAL '365 days' AND $1::date
          AND (
            $2::text = 'all'
            OR s.market = $2::text
          )
        GROUP BY sp.symbol
      ),
      ma60 AS (
        SELECT
          sp.symbol,
          AVG(COALESCE(sp.close_price, 0))::numeric AS ma60_value,
          COUNT(*) AS sample_count
        FROM tw_stock_prices sp
        LEFT JOIN tw_stock_symbols s ON s.symbol = sp.symbol
        WHERE sp.date BETWEEN $1::date - INTERVAL '59 days' AND $1::date
          AND (
            $2::text = 'all'
            OR s.market = $2::text
          )
        GROUP BY sp.symbol
      ),
      ma5 AS (
        SELECT
          sp.symbol,
          AVG(COALESCE(sp.close_price, 0))::numeric AS ma5_value,
          COUNT(*) AS sample_count
        FROM tw_stock_prices sp
        LEFT JOIN tw_stock_symbols s ON s.symbol = sp.symbol
        WHERE sp.date BETWEEN $1::date - INTERVAL '4 days' AND $1::date
          AND (
            $2::text = 'all'
            OR s.market = $2::text
          )
        GROUP BY sp.symbol
      ),
      ma10 AS (
        SELECT
          sp.symbol,
          AVG(COALESCE(sp.close_price, 0))::numeric AS ma10_value,
          COUNT(*) AS sample_count
        FROM tw_stock_prices sp
        LEFT JOIN tw_stock_symbols s ON s.symbol = sp.symbol
        WHERE sp.date BETWEEN $1::date - INTERVAL '9 days' AND $1::date
          AND (
            $2::text = 'all'
            OR s.market = $2::text
          )
        GROUP BY sp.symbol
      ),
      ma20 AS (
        SELECT
          sp.symbol,
          AVG(COALESCE(sp.close_price, 0))::numeric AS ma20_value,
          COUNT(*) AS sample_count
        FROM tw_stock_prices sp
        LEFT JOIN tw_stock_symbols s ON s.symbol = sp.symbol
        WHERE sp.date BETWEEN $1::date - INTERVAL '19 days' AND $1::date
          AND (
            $2::text = 'all'
            OR s.market = $2::text
          )
        GROUP BY sp.symbol
      ),
      ma120 AS (
        SELECT
          sp.symbol,
          AVG(COALESCE(sp.close_price, 0))::numeric AS ma120_value,
          COUNT(*) AS sample_count
        FROM tw_stock_prices sp
        LEFT JOIN tw_stock_symbols s ON s.symbol = sp.symbol
        WHERE sp.date BETWEEN $1::date - INTERVAL '119 days' AND $1::date
          AND (
            $2::text = 'all'
            OR s.market = $2::text
          )
        GROUP BY sp.symbol
      ),
      ma240 AS (
        SELECT
          sp.symbol,
          AVG(COALESCE(sp.close_price, 0))::numeric AS ma240_value,
          COUNT(*) AS sample_count
        FROM tw_stock_prices sp
        LEFT JOIN tw_stock_symbols s ON s.symbol = sp.symbol
        WHERE sp.date BETWEEN $1::date - INTERVAL '239 days' AND $1::date
          AND (
            $2::text = 'all'
            OR s.market = $2::text
          )
        GROUP BY sp.symbol
      )
      SELECT
        COUNT(*) AS total_count,
        SUM(CASE WHEN period_return > 0 THEN 1 ELSE 0 END) AS advancers,
        SUM(CASE WHEN period_return < 0 THEN 1 ELSE 0 END) AS decliners,
        SUM(CASE WHEN period_return = 0 THEN 1 ELSE 0 END) AS unchanged,
        SUM(CASE WHEN period_return >= 0.02 THEN 1 ELSE 0 END) AS greater_2pct,
        SUM(CASE WHEN period_return <= -0.02 THEN 1 ELSE 0 END) AS less_neg_2pct,
        -- 上漲幅度分布
        SUM(CASE WHEN period_return > 0.05 THEN 1 ELSE 0 END) AS gain_5_plus_count,
        SUM(CASE WHEN period_return >= 0.02 AND period_return <= 0.05 THEN 1 ELSE 0 END) AS gain_2_to_5_count,
        SUM(CASE WHEN period_return > 0 AND period_return < 0.02 THEN 1 ELSE 0 END) AS gain_0_to_2_count,
        -- 下跌幅度分布
        SUM(CASE WHEN period_return < -0.05 THEN 1 ELSE 0 END) AS loss_5_plus_count,
        SUM(CASE WHEN period_return >= -0.05 AND period_return <= -0.02 THEN 1 ELSE 0 END) AS loss_2_to_5_count,
        SUM(CASE WHEN period_return < 0 AND period_return > -0.02 THEN 1 ELSE 0 END) AS loss_0_to_2_count,
        -- 市場參與度（成交量 > 中位數）
        SUM(CASE WHEN volume > (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY volume) FROM returns) THEN 1 ELSE 0 END) AS active_stocks_count,
        -- 風險指標：跌幅超過 5%
        SUM(CASE WHEN period_return < -0.05 THEN 1 ELSE 0 END) AS heavy_losers_count,
        -- 風險指標：跌幅超過 7%
        SUM(CASE WHEN period_return < -0.07 THEN 1 ELSE 0 END) AS severe_decliners_count,
        -- 風險指標：跌幅超過 10%（重挫）
        SUM(CASE WHEN period_return < -0.10 THEN 1 ELSE 0 END) AS crash_stocks_count,
        SUM(
          CASE
            WHEN pt.current_high IS NOT NULL AND r.prior_close IS NOT NULL AND r.prior_close > 0
                 AND pt.current_high >= r.prior_close * 1.099
            THEN 1 ELSE 0 END
        ) AS limit_up_count,
        SUM(
          CASE
            WHEN pt.current_low IS NOT NULL AND r.prior_close IS NOT NULL AND r.prior_close > 0
                 AND pt.current_low <= r.prior_close * 0.901
            THEN 1 ELSE 0 END
        ) AS limit_down_count,
        AVG(period_return) AS avg_return,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY volume) AS median_volume,
        SUM(CASE WHEN period_return >= 0 THEN volume ELSE 0 END) AS up_volume,
        SUM(CASE WHEN period_return < 0 THEN volume ELSE 0 END) AS down_volume,
        SUM(volume) AS total_volume,
        -- 成交金額（千億元）：從加權指數取得
        (SELECT market_volume FROM twii_volume) / 100000000000.0 AS total_value_real,
        SUM(CASE WHEN ABS(period_return) >= 0.05 THEN 1 ELSE 0 END) AS high_volatility_count,
        SUM(
          CASE
            WHEN pt.current_high IS NOT NULL
              AND h.high_52w IS NOT NULL
              AND pt.current_high >= h.high_52w * 0.999
            THEN 1 ELSE 0 END
        ) AS new_high_52w,
        SUM(
          CASE
            WHEN pt.current_low IS NOT NULL
              AND l.low_52w IS NOT NULL
              AND pt.current_low <= l.low_52w * 1.001
            THEN 1 ELSE 0 END
        ) AS new_low_52w,
        SUM(CASE WHEN ma5.sample_count >= 3 THEN 1 ELSE 0 END) AS ma5_sample_count,
        SUM(
          CASE
            WHEN ma5.sample_count >= 3
              AND ma5.ma5_value IS NOT NULL
              AND pt.current_close IS NOT NULL
              AND pt.current_close >= ma5.ma5_value
            THEN 1 ELSE 0 END
        ) AS ma5_above_count,
        SUM(CASE WHEN ma10.sample_count >= 5 THEN 1 ELSE 0 END) AS ma10_sample_count,
        SUM(
          CASE
            WHEN ma10.sample_count >= 5
              AND ma10.ma10_value IS NOT NULL
              AND pt.current_close IS NOT NULL
              AND pt.current_close >= ma10.ma10_value
            THEN 1 ELSE 0 END
        ) AS ma10_above_count,
        SUM(CASE WHEN ma20.sample_count >= 10 THEN 1 ELSE 0 END) AS ma20_sample_count,
        SUM(
          CASE
            WHEN ma20.sample_count >= 10
              AND ma20.ma20_value IS NOT NULL
              AND pt.current_close IS NOT NULL
              AND pt.current_close >= ma20.ma20_value
            THEN 1 ELSE 0 END
        ) AS ma20_above_count,
        SUM(CASE WHEN ma.sample_count >= 30 THEN 1 ELSE 0 END) AS ma60_sample_count,
        SUM(
          CASE
            WHEN ma.sample_count >= 30
              AND ma.ma60_value IS NOT NULL
              AND pt.current_close IS NOT NULL
              AND pt.current_close >= ma.ma60_value
            THEN 1 ELSE 0 END
        ) AS ma60_above_count,
        -- 風險指標：破底股票數（跌破 MA60）
        SUM(
          CASE
            WHEN ma.sample_count >= 30
              AND ma.ma60_value IS NOT NULL
              AND pt.current_close IS NOT NULL
              AND pt.current_close < ma.ma60_value
            THEN 1 ELSE 0 END
        ) AS breakdown_stocks_count,
        -- 風險指標：成交量萎縮（< 20日均量 50%）
        SUM(
          CASE
            WHEN volume < (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY volume) FROM returns) * 0.5
            THEN 1 ELSE 0 END
        ) AS volume_dry_stocks_count,
        SUM(CASE WHEN ma120.sample_count >= 60 THEN 1 ELSE 0 END) AS ma120_sample_count,
        SUM(
          CASE
            WHEN ma120.sample_count >= 60
              AND ma120.ma120_value IS NOT NULL
              AND pt.current_close IS NOT NULL
              AND pt.current_close >= ma120.ma120_value
            THEN 1 ELSE 0 END
        ) AS ma120_above_count,
        SUM(CASE WHEN ma240.sample_count >= 120 THEN 1 ELSE 0 END) AS ma240_sample_count,
        SUM(
          CASE
            WHEN ma240.sample_count >= 120
              AND ma240.ma240_value IS NOT NULL
              AND pt.current_close IS NOT NULL
              AND pt.current_close >= ma240.ma240_value
            THEN 1 ELSE 0 END
        ) AS ma240_above_count,
        -- 黃金交叉：MA5 > MA20
        SUM(
          CASE
            WHEN ma5.ma5_value IS NOT NULL
              AND ma20.ma20_value IS NOT NULL
              AND ma5.ma5_value > ma20.ma20_value
            THEN 1 ELSE 0 END
        ) AS golden_cross_5_20,
        -- 黃金交叉：MA10 > MA60
        SUM(
          CASE
            WHEN ma10.ma10_value IS NOT NULL
              AND ma.ma60_value IS NOT NULL
              AND ma10.ma10_value > ma.ma60_value
            THEN 1 ELSE 0 END
        ) AS golden_cross_10_60,
        -- 死亡交叉：MA5 < MA20
        SUM(
          CASE
            WHEN ma5.ma5_value IS NOT NULL
              AND ma20.ma20_value IS NOT NULL
              AND ma5.ma5_value < ma20.ma20_value
            THEN 1 ELSE 0 END
        ) AS death_cross_5_20,
        -- 死亡交叉：MA10 < MA60
        SUM(
          CASE
            WHEN ma10.ma10_value IS NOT NULL
              AND ma.ma60_value IS NOT NULL
              AND ma10.ma10_value < ma.ma60_value
            THEN 1 ELSE 0 END
        ) AS death_cross_10_60,
        -- 多頭排列：MA5 > MA10 > MA20 > MA60
        SUM(
          CASE
            WHEN ma5.ma5_value IS NOT NULL
              AND ma10.ma10_value IS NOT NULL
              AND ma20.ma20_value IS NOT NULL
              AND ma.ma60_value IS NOT NULL
              AND ma5.ma5_value > ma10.ma10_value
              AND ma10.ma10_value > ma20.ma20_value
              AND ma20.ma20_value > ma.ma60_value
            THEN 1 ELSE 0 END
        ) AS bullish_alignment_count,
        -- 空頭排列：MA5 < MA10 < MA20 < MA60
        SUM(
          CASE
            WHEN ma5.ma5_value IS NOT NULL
              AND ma10.ma10_value IS NOT NULL
              AND ma20.ma20_value IS NOT NULL
              AND ma.ma60_value IS NOT NULL
              AND ma5.ma5_value < ma10.ma10_value
              AND ma10.ma10_value < ma20.ma20_value
              AND ma20.ma20_value < ma.ma60_value
            THEN 1 ELSE 0 END
        ) AS bearish_alignment_count
      FROM returns r
      LEFT JOIN price_today pt ON pt.symbol = r.symbol
      LEFT JOIN high_52w h ON h.symbol = r.symbol
      LEFT JOIN low_52w l ON l.symbol = r.symbol
      LEFT JOIN ma5 ON ma5.symbol = r.symbol
      LEFT JOIN ma10 ON ma10.symbol = r.symbol
      LEFT JOIN ma20 ON ma20.symbol = r.symbol
      LEFT JOIN ma60 ma ON ma.symbol = r.symbol
      LEFT JOIN ma120 ON ma120.symbol = r.symbol
      LEFT JOIN ma240 ON ma240.symbol = r.symbol
    `;
    const stat = await client.query(metricsSql, [isoDate, (market || 'all'), windowDays] );

    const topWindowDays = periodKey === 'daily' ? 20 : windowDays;

    const topSql = `
      WITH base AS (
        SELECT
          r.symbol,
          r.date,
          COALESCE(r.daily_return, 0)::numeric AS daily_return,
          COALESCE(sp.close_price, 0)::numeric AS close_price,
          COALESCE(sp.volume, 0)::numeric AS volume,
          ROW_NUMBER() OVER (PARTITION BY r.symbol ORDER BY r.date DESC) AS rn
        FROM tw_stock_returns r
        LEFT JOIN tw_stock_prices sp ON sp.symbol = r.symbol AND sp.date = r.date
        LEFT JOIN tw_stock_symbols s ON s.symbol = r.symbol
        WHERE r.date <= $1::date
          AND (
            $2::text = 'all'
            OR s.market = $2::text
          )
      ),
      aggregated AS (
        SELECT
          symbol,
          SUM(
            CASE
              WHEN rn BETWEEN 1 AND $3 AND (1 + daily_return) > 0 THEN LN(1 + daily_return)
              ELSE 0
            END
          ) AS log_return_sum,
          BOOL_AND(
            CASE
              WHEN rn BETWEEN 1 AND $3 THEN (1 + daily_return) > 0
              ELSE TRUE
            END
          ) AS all_positive_returns,
          COUNT(*) FILTER (WHERE rn BETWEEN 1 AND $3) AS window_count,
          MAX(volume) FILTER (WHERE rn = 1)::numeric AS latest_volume,
          MAX(close_price) FILTER (WHERE rn = 1)::numeric AS latest_close,
          MAX(close_price) FILTER (WHERE rn = $3 + 1)::numeric AS prior_close,
          MAX(daily_return) FILTER (WHERE rn = 1)::numeric AS latest_daily_return,
          BOOL_OR(
            CASE
              WHEN rn = $3 + 1 AND close_price IS NOT NULL AND close_price > 0 THEN TRUE
              ELSE FALSE
            END
          ) AS has_prior_close
        FROM base
        WHERE rn <= $3 + 1
        GROUP BY symbol
      ),
      prior_price AS (
        SELECT
          sp.symbol,
          sp.close_price AS price_before_window,
          sp.date AS price_date
        FROM (
          SELECT DISTINCT ON (sp.symbol)
            sp.symbol,
            sp.close_price,
            sp.date
          FROM tw_stock_prices sp
          LEFT JOIN tw_stock_symbols s ON s.symbol = sp.symbol
          WHERE sp.date < $1::date
            AND (
              $2::text = 'all'
              OR s.market = $2::text
            )
          ORDER BY sp.symbol, sp.date DESC
        ) sp
      )
      SELECT
        a.symbol,
        CASE
          WHEN $3 = 1 AND a.latest_daily_return IS NOT NULL THEN a.latest_daily_return
          WHEN a.has_prior_close THEN (a.latest_close / a.prior_close) - 1
          WHEN a.window_count = $3 AND a.all_positive_returns THEN EXP(a.log_return_sum) - 1
          WHEN pp.price_before_window IS NOT NULL AND pp.price_before_window > 0 THEN (a.latest_close / pp.price_before_window) - 1
          ELSE NULL
        END AS period_return,
        a.latest_volume AS volume,
        a.latest_close AS close_price,
        COALESCE(
          CASE
            WHEN a.has_prior_close THEN a.prior_close
            WHEN a.window_count = $3 AND a.all_positive_returns THEN a.latest_close / NULLIF(EXP(a.log_return_sum), 0)
            ELSE pp.price_before_window
          END,
          0
        ) AS prior_close
      FROM aggregated a
      LEFT JOIN prior_price pp ON pp.symbol = a.symbol
      ORDER BY period_return DESC NULLS LAST
      LIMIT 1
    `;
    const top = await client.query(topSql, [isoDate, (market || 'all'), topWindowDays]);

    const aggregate = stat.rows[0] || {};
    const t = top.rows[0] || null;
    
    const totalCount = Number(aggregate.total_count || 0);
    const advancers = Number(aggregate.advancers || 0);
    const decliners = Number(aggregate.decliners || 0);
    const unchanged = Number(aggregate.unchanged || 0);
    const greater2 = Number(aggregate.greater_2pct || 0);
    const lessNeg2 = Number(aggregate.less_neg_2pct || 0);
    const limitUpCount = Number(aggregate.limit_up_count || 0);
    const limitDownCount = Number(aggregate.limit_down_count || 0);
    const avgReturn = Number((aggregate.avg_return || 0) * 100);
    const medianReturn = aggregate.median_return !== null && aggregate.median_return !== undefined ? Number(aggregate.median_return) * 100 : null;
    const medianVolume = aggregate.median_volume !== null && aggregate.median_volume !== undefined ? Number(aggregate.median_volume) : null;
    const upVolume = Number(aggregate.up_volume || 0);
    const downVolume = Number(aggregate.down_volume || 0);
    const totalVolume = Number(aggregate.total_volume || 0);
    const upDownVolumeRatio = downVolume === 0 ? null : upVolume / downVolume;
    // 以實際價格*量計算的成交金額（億元）
    const totalValue = Number(aggregate.total_value_real || 0);
    const valueChange = 0; // 需要從歷史數據計算，暫時設為 0
    const avgValue20 = totalValue; // 需要從歷史數據計算，暫時設為當前值
    const highVolCount = Number(aggregate.high_volatility_count || 0);
    const hiVolatilityRatio = totalCount ? (highVolCount / totalCount) * 100 : 0;
    const adRatio = decliners === 0 ? null : advancers / decliners;
    const trendPercent = totalCount ? ((advancers - decliners) / totalCount) * 100 : 0;
    const ma5SampleCount = Number(aggregate.ma5_sample_count || 0);
    const ma5AboveCount = Number(aggregate.ma5_above_count || 0);
    const ma5Ratio = ma5SampleCount ? (ma5AboveCount / ma5SampleCount) * 100 : 0;
    const ma10SampleCount = Number(aggregate.ma10_sample_count || 0);
    const ma10AboveCount = Number(aggregate.ma10_above_count || 0);
    const ma10Ratio = ma10SampleCount ? (ma10AboveCount / ma10SampleCount) * 100 : 0;
    const ma20SampleCount = Number(aggregate.ma20_sample_count || 0);
    const ma20AboveCount = Number(aggregate.ma20_above_count || 0);
    const ma20Ratio = ma20SampleCount ? (ma20AboveCount / ma20SampleCount) * 100 : 0;
    const newHighStocks = Number(aggregate.new_high_52w || 0);
    const newLowStocks = Number(aggregate.new_low_52w || 0);
    const newHighNet = newHighStocks - newLowStocks;
    const ma60SampleCount = Number(aggregate.ma60_sample_count || 0);
    const ma60AboveCount = Number(aggregate.ma60_above_count || 0);
    const ma60Ratio = ma60SampleCount ? (ma60AboveCount / ma60SampleCount) * 100 : 0;
    const ma120SampleCount = Number(aggregate.ma120_sample_count || 0);
    const ma120AboveCount = Number(aggregate.ma120_above_count || 0);
    const ma120Ratio = ma120SampleCount ? (ma120AboveCount / ma120SampleCount) * 100 : 0;
    const ma240SampleCount = Number(aggregate.ma240_sample_count || 0);
    const ma240AboveCount = Number(aggregate.ma240_above_count || 0);
    const ma240Ratio = ma240SampleCount ? (ma240AboveCount / ma240SampleCount) * 100 : 0;
    const ma60TrendPercent = ma60Ratio - ma20Ratio;
    const ma20TrendPercent = ma20Ratio - ma60Ratio;
    const goldenCross5_20 = Number(aggregate.golden_cross_5_20 || 0);
    const goldenCross10_60 = Number(aggregate.golden_cross_10_60 || 0);
    const goldenCrossCount = goldenCross5_20 + goldenCross10_60;
    const deathCross5_20 = Number(aggregate.death_cross_5_20 || 0);
    const deathCross10_60 = Number(aggregate.death_cross_10_60 || 0);
    const deathCrossCount = deathCross5_20 + deathCross10_60;
    const bullishAlignmentCount = Number(aggregate.bullish_alignment_count || 0);
    const bearishAlignmentCount = Number(aggregate.bearish_alignment_count || 0);
    // 市場廣度指標
    const adlValue = advancers - decliners; // 騰落線當日值
    const adlChange = 0; // 需要歷史數據，暫時為 0
    const gain5PlusCount = Number(aggregate.gain_5_plus_count || 0);
    const gain2To5Count = Number(aggregate.gain_2_to_5_count || 0);
    const gain0To2Count = Number(aggregate.gain_0_to_2_count || 0);
    const loss5PlusCount = Number(aggregate.loss_5_plus_count || 0);
    const loss2To5Count = Number(aggregate.loss_2_to_5_count || 0);
    const loss0To2Count = Number(aggregate.loss_0_to_2_count || 0);
    const activeStocksCount = Number(aggregate.active_stocks_count || 0);
    const inactiveStocksCount = totalCount - activeStocksCount;
    // 風險指標
    const heavyLosersCount = Number(aggregate.heavy_losers_count || 0);
    const severeDeclinersCount = Number(aggregate.severe_decliners_count || 0);
    const crashStocksCount = Number(aggregate.crash_stocks_count || 0);
    const consecutiveDeclinersCount = 0; // 需要歷史數據，暫時為 0
    const breakdownStocksCount = Number(aggregate.breakdown_stocks_count || 0);
    const volumeDryStocksCount = Number(aggregate.volume_dry_stocks_count || 0);
    const topVolume = Number(t?.volume || 0);
    const topPrice = Number(t?.close_price || 0);
    const topPricePrev = Number(t?.prior_close || 0);
    const topReturn = t && t.period_return !== null && t.period_return !== undefined
      ? Number(t.period_return) * 100
      : 0;

    res.json({
      data: {
        advancers,
        decliners,
        unchanged,
        unchangedCount: unchanged,
        avgReturn,
        risingStocks: advancers,
        topStock: t ? t.symbol : 'N/A',
        maxReturn: topReturn,
        newHighStocks,
        newLowStocks,
        newHighNet,
        newHigh52w: newHighStocks,
        greater2Count: greater2,
        lessNeg2Count: lessNeg2,
        limitUpCount,
        limitDownCount,
        adRatio: adRatio,
        trendPercent,
        medianReturn,
        ma5Ratio,
        ma5AboveCount,
        ma5SampleCount,
        ma10Ratio,
        ma10AboveCount,
        ma10SampleCount,
        ma20Ratio,
        ma20TrendPercent,
        ma20AboveCount,
        ma20SampleCount,
        ma60Ratio,
        ma60TrendPercent,
        ma60AboveCount,
        ma60SampleCount,
        ma120Ratio,
        ma120AboveCount,
        ma120SampleCount,
        ma240Ratio,
        ma240AboveCount,
        ma240SampleCount,
        goldenCrossCount,
        goldenCross5_20,
        goldenCross10_60,
        deathCrossCount,
        deathCross5_20,
        deathCross10_60,
        bullishAlignmentCount,
        bearishAlignmentCount,
        adlValue,
        adlChange,
        gain5PlusCount,
        gain2To5Count,
        gain0To2Count,
        loss5PlusCount,
        loss2To5Count,
        loss0To2Count,
        activeStocksCount,
        inactiveStocksCount,
        heavyLosersCount,
        severeDeclinersCount,
        crashStocksCount,
        consecutiveDeclinersCount,
        breakdownStocksCount,
        volumeDryStocksCount,
        topVolume,
        topPrice,
        topPricePrev,
        medianVolume,
        upDownVolumeRatio,
        hiVolatilityRatio,
        advancersCount: advancers,
        declinersCount: decliners,
        totalCount,
        upVolume,
        downVolume,
        totalVolume,
        totalValue,
        valueChange,
        avgValue20,
        highVolatilityCount: highVolCount,
      },
      asOfDate: isoDate,
    });
  } catch (e) {
    console.warn('statistics error:', e.message);
    if (!USE_FALLBACK) return res.status(500).json({ error: e.message });
    res.json({ data: fallbackStats(), asOfDate: date || new Date().toISOString().slice(0,10), fallback: true });
  } finally {
    try { client && client.release(); } catch {}
  }
});

// Rankings endpoint expected by front-end
app.get('/api/returns/rankings', async (req, res) => {
  const { period = 'daily', market = 'all', industry = 'all', returnRange = 'all', volumeThreshold = 0, date, limit = 50, rankingType = 'all' } = req.query;
  const periodKey = String(period || 'daily').toLowerCase();
  const periodWindowDays = {
    daily: 1,
    weekly: 5,
    monthly: 21,
    quarterly: 63,
    yearly: 252,
  };
  const windowDays = periodWindowDays[periodKey] || periodWindowDays.daily;
  const lim = Math.min(parseInt(limit) || 50, 500);
  let client;
  try {
    client = await pool.connect();
    const targetDate = await resolveStockDate(client, date);

    if (!targetDate) {
      if (!USE_FALLBACK) return res.status(404).json({ error: 'No data available' });
      const now = date || new Date().toISOString().slice(0,10);
      return res.json({ data: demoRankings(now, lim), count: lim, asOfDate: now, fallback: true });
    }

    const isoDate = toIsoDate(targetDate) || targetDate;
    
    // 根據 rankingType 決定 WHERE 和 ORDER BY 條件
    let whereClause = 'WHERE latest_return_pct IS NOT NULL';
    let orderClause = 'ORDER BY latest_return_pct DESC NULLS LAST';
    
    if (rankingType === 'gainers') {
      whereClause += ' AND latest_return_pct >= 0';
      orderClause = 'ORDER BY latest_return_pct DESC NULLS LAST';
    } else if (rankingType === 'losers') {
      whereClause += ' AND latest_return_pct < 0';
      orderClause = 'ORDER BY latest_return_pct ASC NULLS LAST';
    }
    
    const sql = `
      WITH base AS (
        SELECT
          r.symbol,
          r.date,
          COALESCE(r.daily_return, 0)::numeric AS daily_return,
          COALESCE(sp.close_price, 0)::numeric AS close_price,
          COALESCE(sp.volume, 0)::numeric AS volume,
          ROW_NUMBER() OVER (PARTITION BY r.symbol ORDER BY r.date DESC) AS rn
        FROM tw_stock_returns r
        LEFT JOIN tw_stock_prices sp ON sp.symbol = r.symbol AND sp.date = r.date
        LEFT JOIN tw_stock_symbols s ON s.symbol = r.symbol
        WHERE r.date <= $1::date
          AND (
            $2::text = 'all'
            OR s.market = $2::text
          )
      ),
      aggregated AS (
        SELECT
          symbol,
          SUM(
            CASE
              WHEN rn BETWEEN 1 AND $3 AND (1 + daily_return) > 0 THEN LN(1 + daily_return)
              ELSE 0
            END
          ) AS log_return_sum,
          BOOL_AND(
            CASE
              WHEN rn BETWEEN 1 AND $3 THEN (1 + daily_return) > 0
              ELSE TRUE
            END
          ) AS all_positive_returns,
          COUNT(*) FILTER (WHERE rn BETWEEN 1 AND $3) AS window_count,
          MAX(volume) FILTER (WHERE rn = 1)::numeric AS latest_volume,
          MAX(close_price) FILTER (WHERE rn = 1)::numeric AS latest_close,
          MAX(close_price) FILTER (WHERE rn = $3 + 1)::numeric AS prior_close,
          MAX(daily_return) FILTER (WHERE rn = 1)::numeric AS latest_daily_return,
          BOOL_OR(
            CASE
              WHEN rn = $3 + 1 AND close_price IS NOT NULL AND close_price > 0 THEN TRUE
              ELSE FALSE
            END
          ) AS has_prior_close
        FROM base
        WHERE rn <= $3 + 1
        GROUP BY symbol
      ),
      prior_price AS (
        SELECT
          sp.symbol,
          sp.close_price AS price_before_window,
          sp.date AS price_date
        FROM (
          SELECT DISTINCT ON (sp.symbol)
            sp.symbol,
            sp.close_price,
            sp.date
          FROM tw_stock_prices sp
          LEFT JOIN tw_stock_symbols s ON s.symbol = sp.symbol
          WHERE sp.date < $1::date
            AND (
              $2::text = 'all'
              OR s.market = $2::text
            )
          ORDER BY sp.symbol, sp.date DESC
        ) sp
      ),
      final_data AS (
        SELECT
          a.symbol,
          $1::date AS latest_date,
          CASE
            WHEN $3 = 1 AND a.latest_daily_return IS NOT NULL THEN a.latest_daily_return
            WHEN a.has_prior_close THEN (a.latest_close / a.prior_close) - 1
            WHEN a.window_count = $3 AND a.all_positive_returns THEN EXP(a.log_return_sum) - 1
            WHEN pp.price_before_window IS NOT NULL AND pp.price_before_window > 0 THEN (a.latest_close / pp.price_before_window) - 1
            ELSE NULL
          END AS latest_return_pct,
          COALESCE(sp.volume, a.latest_volume, 0) AS volume,
          COALESCE(sp.close_price, a.latest_close, 0) AS current_price,
          COALESCE(
            CASE
              WHEN a.has_prior_close THEN a.prior_close
              WHEN a.window_count = $3 AND a.all_positive_returns THEN a.latest_close / NULLIF(EXP(a.log_return_sum), 0)
              ELSE pp.price_before_window
            END,
            prev.close_price,
            0
          ) AS prior_close,
          CASE
            WHEN a.has_prior_close THEN a.latest_close - a.prior_close
            WHEN a.window_count = $3 AND a.all_positive_returns THEN a.latest_close - (a.latest_close / NULLIF(EXP(a.log_return_sum), 0))
            WHEN pp.price_before_window IS NOT NULL AND pp.price_before_window > 0 THEN a.latest_close - pp.price_before_window
            ELSE COALESCE(sp.change, 0)
          END AS price_change,
          CASE
            WHEN a.has_prior_close AND a.prior_close <> 0 THEN (a.latest_close / a.prior_close) - 1
            WHEN a.window_count = $3 AND a.all_positive_returns THEN EXP(a.log_return_sum) - 1
            WHEN pp.price_before_window IS NOT NULL AND pp.price_before_window > 0 THEN (a.latest_close / pp.price_before_window) - 1
            ELSE COALESCE(sp.change_percent, 0) / 100
          END AS change_percent,
          s.name AS full_name,
          s.short_name,
          s.market,
          s.industry
        FROM aggregated a
        LEFT JOIN prior_price pp ON pp.symbol = a.symbol
        LEFT JOIN tw_stock_prices sp ON sp.symbol = a.symbol AND sp.date = $1::date
        LEFT JOIN tw_stock_prices prev ON prev.symbol = a.symbol AND prev.date = $1::date - ($3::int) * INTERVAL '1 day'
        LEFT JOIN tw_stock_symbols s ON s.symbol = a.symbol
      )
      SELECT * FROM final_data
      ${whereClause}
      ${orderClause}
      LIMIT $4
    `;
    const q = await client.query(sql, [isoDate, (market || 'all'), windowDays, lim]);

    const data = q.rows.map((r, i) => ({
      rank: i + 1,
      symbol: r.symbol,
      name: r.full_name || r.symbol,
      short_name: r.short_name || r.full_name || r.symbol,
      return_rate: Number(r.latest_return_pct * 100),
      volume: Number(r.volume || 0),
      cumulative_return: 0,
      market: r.market || 'all',
      industry: r.industry || 'all',
      current_price: Number(r.current_price || 0),
      prior_close: Number(r.prior_close || 0),
      price_change: Number(r.price_change || 0),
      change_percent: Number(r.change_percent || 0),
      latest_date: r.latest_date,
    }));
    res.json({ data, count: data.length, asOfDate: isoDate });
  } catch (e) {
    console.warn('rankings error:', e.message);
    if (!USE_FALLBACK) return res.status(500).json({ error: e.message });
    const now = date || new Date().toISOString().slice(0,10);
    res.json({ data: demoRankings(now, lim), count: lim, asOfDate: now, fallback: true });
  } finally {
    try { client && client.release(); } catch {}
  }
});

app.get('/api/returns/comparison', async (req, res) => {
  const { symbols, period = 'daily', date, market = 'all' } = req.query;
  const symbolList = parseSymbolsParam(symbols);

  if (!symbolList.length) {
    return res.json({ data: [], count: 0, asOfDate: null });
  }

  const periodKey = String(period || 'daily').toLowerCase();
  const periodWindowDays = {
    daily: 1,
    weekly: 5,
    monthly: 21,
    quarterly: 63,
    yearly: 252,
  };
  const windowDays = periodWindowDays[periodKey] || periodWindowDays.daily;

  const buildEmptyRows = () => symbolList.map(symbol => ({
    symbol,
    name: null,
    short_name: null,
    market: null,
    price: null,
    prior_close: null,
    volume: null,
    return: null,
    volatility: null,
    missing: true,
  }));

  let client;
  try {
    client = await pool.connect();
    const targetDate = await resolveStockDate(client, date);

    if (!targetDate) {
      const emptyRows = buildEmptyRows();
      return res.json({ data: emptyRows, count: emptyRows.length, asOfDate: null });
    }

    const isoDate = toIsoDate(targetDate) || targetDate;
    const params = [isoDate, symbolList];
    const sql = `
      WITH input_symbols AS (
        SELECT 
          UNNEST($2::text[]) AS symbol,
          REGEXP_REPLACE(UPPER(UNNEST($2::text[])), '\\.(TW|TWO)$', '', 'i') AS normalized
      ),
      latest_two AS (
        SELECT
          sp.symbol,
          sp.date,
          sp.close_price,
          sp.volume,
          REGEXP_REPLACE(UPPER(sp.symbol), '\\.(TW|TWO)$', '', 'i') AS normalized,
          ROW_NUMBER() OVER (PARTITION BY sp.symbol ORDER BY sp.date DESC) AS rn
        FROM tw_stock_prices sp
        WHERE sp.date <= $1::date
          AND EXISTS (
            SELECT 1 FROM input_symbols i 
            WHERE REGEXP_REPLACE(UPPER(sp.symbol), '\\.(TW|TWO)$', '', 'i') = i.normalized
          )
      ),
      prices_pivot AS (
        SELECT
          symbol,
          normalized,
          MAX(close_price) FILTER (WHERE rn = 1) AS latest_close,
          MAX(volume)      FILTER (WHERE rn = 1) AS latest_volume,
          MAX(close_price) FILTER (WHERE rn = 2) AS prior_close
        FROM latest_two
        GROUP BY symbol, normalized
      ),
      day_return AS (
        SELECT 
          r.symbol, 
          r.daily_return,
          REGEXP_REPLACE(UPPER(r.symbol), '\\.(TW|TWO)$', '', 'i') AS normalized
        FROM tw_stock_returns r
        WHERE r.date = $1::date
          AND EXISTS (
            SELECT 1 FROM input_symbols i 
            WHERE REGEXP_REPLACE(UPPER(r.symbol), '\\.(TW|TWO)$', '', 'i') = i.normalized
          )
      ),
      volatility AS (
        SELECT 
          r.symbol,
          STDDEV_POP(r.daily_return) AS volatility,
          REGEXP_REPLACE(UPPER(r.symbol), '\\.(TW|TWO)$', '', 'i') AS normalized
        FROM tw_stock_returns r
        WHERE r.date BETWEEN ($1::date - INTERVAL '30 days') AND $1::date
          AND EXISTS (
            SELECT 1 FROM input_symbols i 
            WHERE REGEXP_REPLACE(UPPER(r.symbol), '\\.(TW|TWO)$', '', 'i') = i.normalized
          )
        GROUP BY r.symbol
      ),
      meta AS (
        SELECT 
          s.symbol, 
          s.name, 
          s.short_name, 
          s.market,
          REGEXP_REPLACE(UPPER(s.symbol), '\\.(TW|TWO)$', '', 'i') AS normalized
        FROM tw_stock_symbols s
        WHERE EXISTS (
          SELECT 1 FROM input_symbols i 
          WHERE REGEXP_REPLACE(UPPER(s.symbol), '\\.(TW|TWO)$', '', 'i') = i.normalized
        )
      )
      SELECT
        i.symbol AS query_symbol,
        COALESCE(pp.symbol, dr.symbol, meta.symbol, i.symbol) AS db_symbol,
        meta.name,
        meta.short_name,
        meta.market,
        pp.latest_close AS price,
        pp.latest_volume AS volume,
        CASE
          WHEN pp.latest_close IS NOT NULL AND pp.prior_close IS NOT NULL AND pp.prior_close <> 0
            THEN (pp.latest_close / pp.prior_close) - 1
          ELSE dr.daily_return
        END AS return,
        pp.prior_close,
        vol.volatility
      FROM input_symbols i
      LEFT JOIN prices_pivot pp ON pp.normalized = i.normalized
      LEFT JOIN day_return dr ON dr.normalized = i.normalized
      LEFT JOIN volatility vol ON vol.normalized = i.normalized
      LEFT JOIN meta ON meta.normalized = i.normalized
    `;

    const result = await client.query(sql, params);
    const rowMap = new Map();
    result.rows.forEach(row => {
      const rawKey = String(row.db_symbol || row.query_symbol || '').trim().toUpperCase();
      const normalizedKey = normalizeSymbolValue(rawKey);
      if (rawKey && !rowMap.has(rawKey)) {
        rowMap.set(rawKey, row);
      }
      if (normalizedKey && !rowMap.has(normalizedKey)) {
        rowMap.set(normalizedKey, row);
      }
    });

    if (process.env.NODE_ENV !== 'production') {
      console.debug('[comparison] symbolList:', symbolList);
      console.debug('[comparison] rowMap keys:', Array.from(rowMap.keys()));
      console.debug('[comparison] raw rows sample:', result.rows);
    }

    const data = symbolList.map(symbol => {
      const row = rowMap.get(symbol);
      if (!row) {
        return {
          symbol,
          name: null,
          short_name: null,
          market: null,
          price: null,
          prior_close: null,
          volume: null,
          return: null,
          volatility: null,
          missing: true,
        };
      }
      return {
        symbol,
        name: row.name || null,
        short_name: row.short_name || null,
        market: row.market || null,
        price: row.price !== null ? Number(row.price) : null,
        prior_close: row.prior_close !== null ? Number(row.prior_close) : null,
        volume: row.volume !== null ? Number(row.volume) : null,
        return: row.return !== null ? Number(row.return) : null,
        volatility: row.volatility !== null ? Number(row.volatility) : null,
        missing: (row.price === null && row.return === null && row.volume === null),
      };
    });

    res.json({ data, count: data.length, asOfDate: isoDate });
  } catch (e) {
    console.error('comparison error:', e.message);
    if (!USE_FALLBACK) {
      return res.status(500).json({ error: e.message, data: buildEmptyRows(), count: symbolList.length, asOfDate: null });
    }
    const emptyRows = buildEmptyRows();
    res.json({ data: emptyRows, count: emptyRows.length, asOfDate: null, fallback: true });
  } finally {
    try { client && client.release(); } catch {}
  }
});

function fallbackStats() {
  return {
    advancers: 0,
    decliners: 0,
    unchanged: 0,
    unchangedCount: 0,
    avgReturn: 0,
    risingStocks: 0,
    topStock: 'N/A',
    maxReturn: 0,
    newHighStocks: 0,
    newLowStocks: 0,
    newHighNet: 0,
    newHigh52w: 0,
    greater2Count: 0,
    lessNeg2Count: 0,
    limitUpCount: 0,
    limitDownCount: 0,
    adRatio: null,
    trendPercent: 0,
    medianReturn: 0,
    ma20Ratio: 0,
    ma20TrendPercent: 0,
    ma20AboveCount: 0,
    ma20SampleCount: 0,
    ma60Ratio: 0,
    ma60TrendPercent: 0,
    ma60AboveCount: 0,
    ma60SampleCount: 0,
    topVolume: 0,
    medianVolume: 0,
    upDownVolumeRatio: null,
    hiVolatilityRatio: 0,
    advancersCount: 0,
    declinersCount: 0,
    totalCount: 0,
    upVolume: 0,
    downVolume: 0,
    totalVolume: 0,
    totalValue: 0,
    valueChange: 0,
    avgValue20: 0,
    highVolatilityCount: 0,
  };
}

function demoRankings(dateLabel, count) {
  return Array.from({ length: Math.min(count, 50) }).map((_, i) => ({
    rank: i + 1,
    symbol: `DEMO${String(i + 1).padStart(2, '0')}`,
    name: `DEMO${String(i + 1).padStart(2, '0')}`,
    return_rate: Math.round((Math.random() * 10 + 1) * 100) / 100,
    volume: Math.floor(Math.random() * 5_000_000),
    cumulative_return: 0,
    market: 'all',
    industry: 'D',
    current_price: 0,
    price_change: 0,
    latest_date: dateLabel,
  }));
}

app.listen(PORT, () => {
  console.log(`API server running at http://localhost:${PORT}`);
});
