import express from 'express';

function normalizeSymbolValue(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\.(TW|TWO)$/i, '');
}

function buildSymbolVariants(rawSymbol) {
  const upper = String(rawSymbol || '').trim().toUpperCase();
  if (!upper) return [];
  const normalized = normalizeSymbolValue(upper);
  const variants = new Set();
  variants.add(upper);
  if (normalized) {
    variants.add(normalized);
    if (!normalized.includes('.')) {
      variants.add(`${normalized}.TW`);
      variants.add(`${normalized}.TWO`);
    }
  }
  return Array.from(variants);
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function toIsoDate(value) {
  if (!value) return null;

  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
    }
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

const PERIOD_CONFIG = {
  '1D': { lookbackDays: 180, bucket: 'day' },
  '1W': { lookbackDays: 365, bucket: 'week' },
  '1M': { lookbackDays: 365 * 3, bucket: 'month' },
  '3M': { lookbackDays: 365 * 2, bucket: 'week' },
  '6M': { lookbackDays: 365 * 4, bucket: 'month' },
  '1Y': { lookbackDays: 365 * 6, bucket: 'month' },
  '2Y': { lookbackDays: 365 * 8, bucket: 'month' }
};

function resolvePeriodConfig(period = '1M') {
  const key = String(period || '').toUpperCase();
  if (PERIOD_CONFIG[key]) return PERIOD_CONFIG[key];

  const match = key.match(/^(\d+)([DWMY])$/);
  if (match) {
    const amount = Number(match[1]);
    const unit = match[2];
    switch (unit) {
      case 'D':
        return { lookbackDays: Math.max(30, amount), bucket: 'day' };
      case 'W':
        return { lookbackDays: Math.max(90, amount * 7), bucket: 'week' };
      case 'M':
        return { lookbackDays: Math.max(180, amount * 31), bucket: 'month' };
      case 'Y':
        return { lookbackDays: Math.max(365, amount * 365), bucket: 'month' };
      default:
        break;
    }
  }

  return { lookbackDays: 240, bucket: 'day' };
}

function getWeekBucketKey(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayOfWeek = date.getUTCDay(); // Sunday=0 ... Saturday=6
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday as start of week
  date.setUTCDate(date.getUTCDate() - diff);
  return date.toISOString().slice(0, 10);
}

function getMonthBucketKey(dateStr) {
  return dateStr.slice(0, 7); // YYYY-MM
}

function toNumber(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  const num = Number(value);
  if (Number.isNaN(num)) return fallback;
  return num;
}

function aggregatePriceData(rows, bucket) {
  const aggregations = new Map();

  rows.forEach(row => {
    const rawDate = row.date;
    const dateStr = toIsoDate(rawDate);
    if (!dateStr) return;

    let aggregationKey;
    if (bucket === 'week') {
      aggregationKey = getWeekBucketKey(dateStr);
    } else if (bucket === 'month') {
      aggregationKey = getMonthBucketKey(dateStr);
    } else {
      aggregationKey = dateStr;
    }

    const open = toNumber(row.open_price, toNumber(row.close_price));
    const close = toNumber(row.close_price, open);
    const high = toNumber(row.high_price, Math.max(open ?? 0, close ?? 0));
    const low = toNumber(row.low_price, Math.min(open ?? 0, close ?? 0));
    const volume = toNumber(row.volume, 0);

    if (!aggregations.has(aggregationKey)) {
      aggregations.set(aggregationKey, {
        open,
        high,
        low,
        close,
        volume,
        startDate: dateStr,
        endDate: dateStr
      });
    } else {
      const bucketData = aggregations.get(aggregationKey);
      if (bucketData.open === null) bucketData.open = open;
      if (high !== null && (bucketData.high === null || high > bucketData.high)) {
        bucketData.high = high;
      }
      if (low !== null && (bucketData.low === null || low < bucketData.low)) {
        bucketData.low = low;
      }
      bucketData.close = close;
      bucketData.volume += volume || 0;
      bucketData.endDate = dateStr;
    }
  });

  const sortedKeys = Array.from(aggregations.keys()).sort((a, b) => a.localeCompare(b));

  return sortedKeys.map(key => {
    const bucketData = aggregations.get(key);
    const dateLabel = bucketData.endDate || bucketData.startDate || key;
    return {
      date: dateLabel,
      time: dateLabel,
      bucketKey: key,
      open: bucketData.open,
      high: bucketData.high,
      low: bucketData.low,
      close: bucketData.close,
      volume: bucketData.volume
    };
  });
}

export default function createStockRoutes(pool) {
  const router = express.Router();

  router.get('/:symbol/price-history', async (req, res) => {
    const rawSymbol = req.params.symbol || '';
    const period = req.query.period || '1M';
    const symbolVariants = buildSymbolVariants(rawSymbol);

    if (!symbolVariants.length) {
      return res.status(400).json({
        error: '缺少股票代碼',
        data: []
      });
    }

    const { lookbackDays, bucket } = resolvePeriodConfig(period);
    let client;

    try {
      client = await pool.connect();

      const existingSymbolResult = await client.query(
        `SELECT symbol
         FROM tw_stock_prices
         WHERE symbol = ANY($1::text[])
         GROUP BY symbol
         ORDER BY MAX(date) DESC, symbol
         LIMIT 1`,
        [symbolVariants]
      );

      const existingRow = existingSymbolResult.rows[0];
      if (!existingRow) {
        return res.json({
          data: [],
          symbol: normalizeSymbolValue(rawSymbol),
          asOfDate: null
        });
      }

      const actualSymbol = existingRow.symbol;

      const latestResult = await client.query(
        `SELECT MAX(date) AS latest_date
         FROM tw_stock_prices
         WHERE symbol = $1`,
        [actualSymbol]
      );

      const latestRow = latestResult.rows[0];
      if (!latestRow || !latestRow.latest_date) {
        return res.json({
          data: [],
          symbol: actualSymbol,
          asOfDate: null
        });
      }

      const latestDateStr = toIsoDate(latestRow.latest_date);
      if (!latestDateStr) {
        return res.status(500).json({ error: '資料日期格式錯誤', data: [] });
      }

      const [endY, endM, endD] = latestDateStr.split('-').map(Number);
      const endDate = new Date(Date.UTC(endY, endM - 1, endD));
      const startDate = new Date(endDate);
      startDate.setUTCDate(startDate.getUTCDate() - lookbackDays);

      const startIso = toIsoDate(startDate);
      const endIso = toIsoDate(endDate);

      const historyResult = await client.query(
        `SELECT date, open_price, high_price, low_price, close_price, volume
         FROM tw_stock_prices
         WHERE symbol = $1
           AND date BETWEEN $2::date AND $3::date
         ORDER BY date ASC`,
        [actualSymbol, startIso, endIso]
      );

      const aggregated = aggregatePriceData(historyResult.rows, bucket);
      
      // Debug: Log first aggregated item
      if (aggregated.length > 0) {
        console.log('=== Backend Debug ===');
        console.log('First aggregated item:', aggregated[0]);
        console.log('First DB row:', historyResult.rows[0]);
      }

      return res.json({
        data: aggregated.map(item => ({
          symbol: actualSymbol,
          date: item.date,
          time: item.time,
          open: item.open,
          high: item.high,
          low: item.low,
          close: item.close,
          volume: item.volume
        })),
        symbol: actualSymbol,
        asOfDate: aggregated.length ? aggregated[aggregated.length - 1].date : endIso,
        period,
        fromDate: aggregated.length ? aggregated[0].date : startIso,
        bucket
      });
    } catch (error) {
      console.error('stocks:price-history error', error);
      return res.status(500).json({ error: '取得歷史價格失敗', data: [] });
    } finally {
      try {
        client && client.release();
      } catch {}
    }
  });

  return router;
}
