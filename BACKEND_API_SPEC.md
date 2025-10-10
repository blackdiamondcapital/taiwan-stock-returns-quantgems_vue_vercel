# 后端 API 接口规范

## K线历史数据接口

### 接口信息
- **端点**: `GET /api/stocks/{symbol}/price-history`
- **描述**: 获取指定股票的K线历史数据
- **用途**: 技术分析图表展示

### 请求参数

#### 路径参数
| 参数 | 类型 | 必填 | 说明 | 示例 |
|-----|------|-----|------|------|
| symbol | string | 是 | 股票代码 | `2330.TW`, `AAPL` |

#### Query 参数
| 参数 | 类型 | 必填 | 说明 | 可选值 |
|-----|------|-----|------|--------|
| period | string | 否 | 时间周期 | `1D`, `1W`, `1M`, `3M`, `6M`, `1Y` |

**Period 说明**:
- `1D`: 返回最近60天的日K数据
- `1W`: 返回最近90天的日K数据
- `1M`: 返回最近120天的日K数据
- `3M`: 返回最近180天的日K数据
- `6M`: 返回最近365天的日K数据
- `1Y`: 返回最近730天的日K数据

### 响应格式

#### 成功响应 (200 OK)
```json
{
  "code": 0,
  "message": "success",
  "data": [
    {
      "date": "2024-01-01",
      "open": 500.5,
      "high": 510.0,
      "low": 498.0,
      "close": 505.5,
      "volume": 15000000,
      "turnover": 7575000000.0
    },
    {
      "date": "2024-01-02",
      "open": 505.5,
      "high": 512.0,
      "low": 502.0,
      "close": 510.0,
      "volume": 18000000,
      "turnover": 9180000000.0
    }
  ]
}
```

#### 字段说明
| 字段 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| date | string | 是 | 交易日期，格式: YYYY-MM-DD |
| open | number | 是 | 开盘价 |
| high | number | 是 | 最高价 |
| low | number | 是 | 最低价 |
| close | number | 是 | 收盘价 |
| volume | number | 是 | 成交量（股） |
| turnover | number | 否 | 成交额（可选） |

#### 错误响应 (404 Not Found)
```json
{
  "code": 404,
  "message": "Stock not found",
  "data": null
}
```

---

## 数据库表结构建议

### 表名: `stock_daily_price` (股票日K线数据表)

```sql
CREATE TABLE stock_daily_price (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    symbol VARCHAR(20) NOT NULL COMMENT '股票代码',
    date DATE NOT NULL COMMENT '交易日期',
    open DECIMAL(10, 2) NOT NULL COMMENT '开盘价',
    high DECIMAL(10, 2) NOT NULL COMMENT '最高价',
    low DECIMAL(10, 2) NOT NULL COMMENT '最低价',
    close DECIMAL(10, 2) NOT NULL COMMENT '收盘价',
    volume BIGINT NOT NULL COMMENT '成交量',
    turnover DECIMAL(18, 2) COMMENT '成交额',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY idx_symbol_date (symbol, date),
    KEY idx_symbol (symbol),
    KEY idx_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='股票日K线数据';
```

### 索引说明
- `idx_symbol_date`: 复合唯一索引，保证同一股票同一日期只有一条记录
- `idx_symbol`: 单字段索引，优化按股票查询
- `idx_date`: 单字段索引，优化按日期查询

---

## SQL 查询示例

### 1. 查询指定股票最近N天的K线数据

```sql
-- 查询 2330.TW 最近60天的日K数据
SELECT 
    date,
    open,
    high,
    low,
    close,
    volume,
    turnover
FROM stock_daily_price
WHERE symbol = '2330.TW'
    AND date >= DATE_SUB(CURDATE(), INTERVAL 60 DAY)
ORDER BY date ASC;
```

### 2. 根据 period 参数动态查询

```sql
-- Java/Spring Boot 示例
@Query("SELECT s FROM StockDailyPrice s WHERE s.symbol = :symbol " +
       "AND s.date >= :startDate ORDER BY s.date ASC")
List<StockDailyPrice> findBySymbolAndDateAfter(
    @Param("symbol") String symbol, 
    @Param("startDate") LocalDate startDate
);
```

### 3. 计算起始日期的映射

| period | 天数 | SQL 计算 |
|--------|------|---------|
| 1D | 60 | `DATE_SUB(CURDATE(), INTERVAL 60 DAY)` |
| 1W | 90 | `DATE_SUB(CURDATE(), INTERVAL 90 DAY)` |
| 1M | 120 | `DATE_SUB(CURDATE(), INTERVAL 120 DAY)` |
| 3M | 180 | `DATE_SUB(CURDATE(), INTERVAL 180 DAY)` |
| 6M | 365 | `DATE_SUB(CURDATE(), INTERVAL 365 DAY)` |
| 1Y | 730 | `DATE_SUB(CURDATE(), INTERVAL 730 DAY)` |

---

## 后端实现示例 (Spring Boot)

### Controller
```java
@RestController
@RequestMapping("/api/stocks")
public class StockController {
    
    @Autowired
    private StockPriceService stockPriceService;
    
    @GetMapping("/{symbol}/price-history")
    public Result<List<StockDailyPrice>> getPriceHistory(
        @PathVariable String symbol,
        @RequestParam(defaultValue = "1M") String period
    ) {
        List<StockDailyPrice> data = stockPriceService.getPriceHistory(symbol, period);
        return Result.success(data);
    }
}
```

### Service
```java
@Service
public class StockPriceService {
    
    @Autowired
    private StockDailyPriceRepository repository;
    
    public List<StockDailyPrice> getPriceHistory(String symbol, String period) {
        int days = getPeriodDays(period);
        LocalDate startDate = LocalDate.now().minusDays(days);
        
        return repository.findBySymbolAndDateAfter(symbol, startDate);
    }
    
    private int getPeriodDays(String period) {
        return switch(period) {
            case "1D" -> 60;
            case "1W" -> 90;
            case "1M" -> 120;
            case "3M" -> 180;
            case "6M" -> 365;
            case "1Y" -> 730;
            default -> 120;
        };
    }
}
```

---

## 数据源建议

### 台湾股市数据来源
1. **台湾证券交易所 (TWSE)**: https://www.twse.com.tw/
2. **证券柜台买卖中心 (TPEx)**: https://www.tpex.org.tw/
3. **Yahoo Finance Taiwan**: https://tw.stock.yahoo.com/
4. **Google Finance**: 免费API（有限制）
5. **第三方数据商**: 如富途、万得、同花顺等

### 数据导入流程
1. 定时任务（每日收盘后）
2. 调用外部API获取最新K线数据
3. 解析并存入数据库
4. 处理历史数据补全

---

## 测试端点

### 本地测试
```bash
# 测试接口是否可用
curl http://localhost:8080/api/stocks/2330.TW/price-history?period=1M

# 预期返回
{
  "code": 0,
  "message": "success",
  "data": [...]
}
```

### 前端测试
刷新页面后，打开浏览器控制台查看：
```
Fetching real price history for 2330.TW 1M
Real data loaded: 120 records
```

---

## 注意事项

1. **数据一致性**: 确保返回的 `close` 价格与当前行情的 `price` 字段一致
2. **日期格式**: 统一使用 `YYYY-MM-DD` 格式
3. **数据完整性**: 确保 OHLC 数据逻辑正确（high >= open/close, low <= open/close）
4. **性能优化**: 
   - 添加适当的数据库索引
   - 考虑使用缓存（Redis）
   - 分页处理大量数据
5. **错误处理**: 
   - 股票不存在返回 404
   - 无数据返回空数组
   - 参数错误返回 400

---

## 前端数据转换

前端已实现自动转换：
```javascript
// 后端字段名灵活支持
{
  time: item.date || item.time,        // 支持 date 或 time
  volume: item.volume || item.vol      // 支持 volume 或 vol
}
```

---

## 降级策略

- ✅ API 调用成功 → 显示真实数据
- ⚠️ API 返回空数组 → 使用模拟数据
- ❌ API 调用失败 → 使用模拟数据

前端已实现完整的降级逻辑，确保用户始终能看到图表。
