# QuantGem 報酬引擎

QuantGem 報酬引擎是一套以 **Vue 3 + Vite** 為前端、**Express** 為後端、**PostgreSQL** 為資料庫的台灣股市報酬分析儀表板。透過多種期間的報酬排行、熱力圖、統計摘要與市場健康指標，協助投資人快速掌握當日或特定期間的市場動態。

## 功能概覽

- **總覽儀表板**
  - 報酬與動能統計卡片：今日上漲家數、近 20 交易日最佳報酬、平均報酬、突破新高家數、MA 比例、量能比、高波動比例等。
  - 市場報酬率熱力圖：支援搜尋、排序、大小調節，並具備貼齊圖塊的 Tooltip。
  - 完整 RWD：針對桌面、平板、手機自動調整排版與間距。

- **排行榜**
  - 依 `daily`、`weekly`、`monthly`、`quarterly`、`yearly` 等期間回傳前 200 名報酬。
  - 顯示最新價、漲跌幅、成交量、市場別、產業別等欄位。

- **後端 API**
  - `GET /api/returns/statistics`：回傳統計摘要、最佳報酬股票等資訊。當期間為 `daily` 時，最佳報酬會自動以近 20 個交易日回推計算。
  - `GET /api/returns/rankings`：回傳排行榜清單，可透過 query string 指定期間、日期、市場等條件。

## 系統需求

- Node.js ≥ 18
- npm ≥ 9
- PostgreSQL ≥ 14（開發環境使用 17）

## 快速開始

```bash
# 安裝依賴
npm install

# 建立環境設定（請依需求修改）
cp .env.example .env

# 同時啟動前端 (Vite) 與後端 (Express)
npm run dev:full

# 僅啟動前端開發伺服器
npm run dev

# 僅啟動後端 API 伺服器
npm run server
```

啟動後：

- 前端：<http://localhost:5173/>
- API：<http://localhost:3001/>

## 環境變數

`server/server.js` 會讀取 `.env` 中的 PostgreSQL 連線設定：

```dotenv
PGHOST=localhost
PGPORT=5432
PGDATABASE=postgres
PGUSER=postgres
PGPASSWORD=your_password
```

請依實際部署環境調整。

## 資料模型

- `stock_returns`：逐日回報率以及週、月、季、年等累積報酬。
- `stock_prices`：每日收盤價、成交量、漲跌幅等資訊。
- `stock_symbols`：股票代碼、名稱、市場與產業分類。

後端 SQL 會依期間自動回溯所需天數（例如 `daily` 期間的最佳報酬使用近 20 交易日、`monthly` 使用 21 交易日）。

## 專案結構重點

- `src/App.vue`：主頁面邏輯，負責資料載入、期間與篩選切換、狀態管理。
- `src/components/StatsGrid.vue`：統計卡片與 UI 更新。
- `src/components/Heatmap.vue`：市場熱力圖與滑桿控制。
- `src/components/RankingTable.vue`：排行榜表格與排序。
- `server/server.js`：Express API 與 PostgreSQL 查詢。
- `src/style.css`、`src/legacy.css`：主題、配色與 RWD 設定。

## 開發建議

- 伺服器啟動時如遇資料庫連線錯誤，請檢查 `.env` 是否與實際環境相符。
- 若要新增統計卡片或排行榜欄位，請同步調整後端 SQL 以及對應的 Vue 元件。
- 熱力圖滑桿會同步更新 CSS 變數 `--cell-size` 與 `--cell-gap`，可視需求調整整體間距。

## 部署注意事項

- 生產環境請執行 `npm run build` 並將 `dist/` 內容部署為靜態資源。
- 後端 Express 可部署於同一主機或獨立服務，請記得設定 CORS 與適當的 Proxy。
- 請勿將 `.env` 納入版本控制，可保留 `.env.example` 作為模板。

## 貢獻

本專案目前為內部使用示例。若需開放授權或接受外部貢獻，請先聯絡維護者。歡迎透過 Issue 或 PR 一同改善 QuantGem 報酬引擎。
