# 🐄 cow-pasture

**我的持股已經綠到上面有牛在吃草了。**

臺灣習慣紅漲綠跌，於是，把綠油油的股市變成真的牧場。上市、上櫃普通股與 ETF 各有一塊田地，跌得越深，草越茂盛，牛越多。繁體中文、純靜態網頁、零 npm 依賴，Node.js 20 以上即可開發。

## 畫面預留

目前環境沒有瀏覽器，尚未拍攝截圖；以下為預留路徑，沒有合成或假冒實機截圖。可在本機開啟 `?scene=crash`、`?scene=up`，分別以桌面及 375px 手機尺寸擷取。

| 場景 | 桌面 | 手機 |
| --- | --- | --- |
| 綠油油 | `shots/desktop-green.png` | `shots/mobile-green.png` |
| 紅通通 | `shots/desktop-red.png` | `shots/mobile-red.png` |

## 可以看什麼

- 加權指數、櫃買指數、漲跌點數、百分比與開高低；紅漲、綠跌、灰平。
- 上市／上櫃／ETF／全市場的漲跌、平盤、未成交與漲跌停。ETF 小計已包含於市場總數。
- 3D 產業分區牧場：所有股票共用一個 InstancedMesh；田地高度對應漲跌幅絕對值，上限 10%。草葉以 GPU 擺動；低多邊形乳牛吃草、搖尾巴；大漲時帶行李離開，紅花盛開。
- 拖曳旋轉、滾輪／雙指縮放、點選股票報價；懶載入 three.js、離開畫面或隱藏分頁即暫停，尊重減少動態效果偏好。無 WebGL2 時使用 2D 備援牧場，完整田地圖仍可操作。
- 「實際／小跌／大跌／平盤／大漲」氣氛預覽，支援 `?scene=actual|down|crash|flat|up`。**只改變草、牛群與氣氛；報價、田地顏色與高度、榜單均維持原始資料。**
- 全市場產業田地熱圖、漲幅／跌幅／成交量前 20 名、ETF 焦點、產業等權平均、股票代碼與名稱搜尋。結果預設 30 檔，每次可再顯示 50 檔。手機田地圖預先展開六個產業，可展開全部。
- 個股對標所屬市場的大盤，以百分點顯示「贏大盤／輸大盤」。產業表對標加權指數，混合日期資料不直接與當日大盤比較。

## 資料來源與限制

| 來源 | 用途 |
| --- | --- |
| [TWSE STOCK_DAY_ALL](https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL) | 上市代碼、名稱、盤後價量 |
| [TPEx daily_close_quotes](https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes) | 上櫃代碼、名稱、盤後價量 |
| [TWSE t187ap03_L](https://openapi.twse.com.tw/v1/opendata/t187ap03_L) | 上市產業別 |
| [TPEx mopsfin_t187ap03_O](https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O) | 上櫃產業別 |
| [TWSE MIS](https://mis.twse.com.tw/stock/api/getStockInfo.jsp) | 個股快照、漲跌停價與兩大指數 |

2026-11-06 實測：MIS、TWSE/TPEx OpenAPI 回應未提供 `Access-Control-Allow-Origin`，無法從 GitHub Pages 直接跨站抓取。瀏覽器僅向同源 `data/snapshot.json` 取資料；無代理服務、API 金鑰或第三方行情套件。

普通股與 ETF 依 `^(\d{4}|00\d{2,4}[A-Z]?)$` 過濾，排除權證、債券與 `01001T` 等不符格式商品；`00` 開頭標記 ETF。實際檔數以每次 OpenAPI 結果為準，不硬編預期市場總數。

四個股票清單／產業來源以 `Promise.allSettled` 並行擷取。MIS 每批 120 檔、循序請求、批次間隔 350ms、15 秒逾時、失敗重試兩次；連續三批失敗或達 5.5 分鐘擷取預算時，剩餘股票採盤後回補，為 8 分鐘部署時限保留餘裕。`z` 缺值時先使用最近成交 `trade.z`，兩者均為成交價、不標估價；再依序使用有效買賣價中點、單邊買價／賣價，僅委買賣推估標示「估」；皆無則保留未成交。盤後股數轉為張；特殊漲跌字串不推算前收，不會捏造漲跌幅。盤後 API 未提供指數與報價時刻，因此顯示缺資料，而非填入自造數字或時間。

部分 MIS 失敗使用各檔盤後資料，介面標示回補日期；缺少日期一致的大盤時，不計算個股對標。MIS 全失敗則標示「盤後資料（前一交易日收盤）」。實際日期永遠顯示，連假時可能為更早的交易日。產業來源失敗歸入「其他」，市場來源缺少則顯示範圍不完整。若本機已有前次快照，可沿用代碼清單向 MIS 查詢，絕不把舊價格當成當日報價。完全沒有可用行情時擷取腳本失敗，Pages 保留最後一次成功部署。

## 架構

```text
TWSE / TPEx OpenAPI ── 股票清單、盤後價量、產業 ─┐
                                               ├─ GitHub Actions (Node 22)
TWSE MIS ─────────────── 每批 120 檔、指數 ───────┘
                       ↓ 正規化、缺值回補、日期標記
                 docs/data/snapshot.json
                       ↓ quick checks
             upload-pages-artifact (docs/)
                       ↓ deploy-pages
                 GitHub Pages 靜態網站
                       ↓ 同源 fetch
           儀表板 + 動態載入本地 three.js
```

快照為緊湊的 `fields` + `rows` 格式，`v:1`。`meta` 提供數量、成功批次、回補代碼／日期、失敗來源與資料範圍。`generatedAt` 是擷取時間，`marketDate` / `quoteTime` 是來源報價日期／時間，兩者不可混淆。快照只上傳為 Pages artifact，**不會 commit 資料**；`docs/data/` 已忽略。

## 更新頻率與 GitHub Pages

在 GitHub 倉庫 Settings → Pages → Source 選 **GitHub Actions**，預設分支使用 `main`。推送 `docs/**`、`scripts/**`、`.github/**`，或手動執行 workflow 均可部署。測試 fixtures 保留於 repo，不會作為正式行情部署。

`.github/workflows/pages.yml` 的 UTC cron：

```yaml
- cron: '*/10 1-5 * * 1-5'  # 臺北週一至週五 09:00–13:50
- cron: '20 6 * * 1-5'     # 臺北週一至週五 14:20 最後一次
```

GitHub cron 約每 10 分鐘，可能排隊、延遲或漏跑；假日仍會執行，行情日期由交易所決定。MIS 也可能延遲，**非即時逐筆行情**。瀏覽器於臺北平日 09:00–14:30 每 60 秒讀取快照，其餘每 10 分鐘，分頁隱藏時暫停；讀取頻率不代表來源刷新頻率。週末與假日也可能標示較久前更新，請看資料日期。

排程實際每日 31 次，估算可抓每交易日約 30 次 × 每次約 1 分鐘 ≈ **650 Actions 分鐘／月**（以約 22 個交易日估計）；週末不跑，但平日休市照跑，實際每月約 660–710 分鐘以上，依重試、排隊與執行時間改變。私有 repo 請留意方案額度；公開 repo 的計費規則以 GitHub 為準。修改上述兩行 cron 即可調整頻率，建議保留 14:20 的最後一次。

## 本機開發

```sh
# Node >= 20；不需要 npm install
npm test

# 有網路時抓取正式快照
npm run snapshot

# 離線時使用 repo 隨附的真實歷史樣本（僅少數股票，畫面明確標示）
npm run snapshot:fixtures

npm start  # http://localhost:5173；PORT 可覆寫
```

`npm run build` 與 `npm test` 都執行 `node scripts/check.mjs`：逐一 `node --check` 第一方 JS/MJS，再執行 `node --test test/`。無打包器或編譯步驟；本地 three.js 已隨 repo 提供。請使用 HTTP 伺服器開啟，ES modules 不支援直接雙擊 `file://`。

```text
scripts/lib/normalize.mjs    純解析、正規化與快照封裝
scripts/fetch-snapshot.mjs   唯一外部網路抓取模組
scripts/fixture-snapshot.mjs 離線真實樣本產生器
scripts/serve.mjs            靜態 HTTP 伺服器
scripts/check.mjs            語法與 node:test

docs/js/logic.js             可在 Node 載入的純行情／時間邏輯
docs/js/display.js           格式化與 HTML 跳脫
docs/js/app.js               介面、輪詢、事件委派
docs/js/pasture.js           three.js 牧場、互動與資源回收
```

測試以隨附 fixtures 為行情依據；網路錯誤測試只使用本機 stub，不會對外連線。此環境無瀏覽器或外網，未宣稱通過實機 WebGL、視覺截圖或線上交易所連線測試。

## 聲明與授權

本網站僅供娛樂與資訊參考，非投資建議。報價來源：臺灣證券交易所 MIS 基本市況報導、TWSE/TPEx OpenAPI，經 GitHub Actions 每約 10 分鐘抓取一次，資料可能延遲或有誤，請以券商/交易所為準。

程式碼使用 [MIT](LICENSE)，Copyright (c) 2026 Malilion。three.js r187 依 [原 MIT 授權](docs/vendor/THREE_LICENSE.txt) 隨附，網站另有[開源致謝頁](docs/credits.html)。市場資料權利與使用條件歸原提供者。
