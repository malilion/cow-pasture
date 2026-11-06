# 🐄 cow-pasture

**我的持股已經綠到上面有牛在吃草了。**

臺灣習慣紅漲綠跌，於是，把綠油油的股市變成真的牧場。上市、上櫃普通股與 ETF 各有一塊田地，跌得越深，草越茂盛，牛越多。繁體中文、純靜態網頁、零 npm 依賴，Node.js 20 以上即可開發。

正式網站：**https://malilion.github.io/cow-pasture/** · [公開原始碼](https://github.com/malilion/cow-pasture)。

## 畫面

實機截圖（`shots/`，隨 repo 提供）。氣氛預覽可用 `?scene=crash`／`?scene=up` 重拍。

| 場景 | 桌面 | 手機 |
| --- | --- | --- |
| 綠油油牧場 | [desktop-green](shots/desktop-green.png) | [mobile-green](shots/mobile-green.png) |
| 紅通通氣氛 | [desktop-red](shots/desktop-red.png) | [mobile-red](shots/mobile-red.png) |
| 個股明細（盤中走勢） | [desktop-detail](shots/desktop-detail.png) | [mobile-detail](shots/mobile-detail.png) |
| 標誌選擇 | [desktop-logos](shots/desktop-logos.png) | [mobile-logos](shots/mobile-logos.png) |
| 兩檔比較 | [desktop-compare](shots/desktop-compare.png) | — |
| 分享今日牧場 | [desktop-share](shots/desktop-share.png) | — |

![綠油油牧場（桌面）](shots/desktop-green.png)

![個股明細與盤中走勢（桌面）](shots/desktop-detail.png)

## 功能一覽

- **大盤與廣度**：加權／櫃買指數、開高低、漲跌家數；指數卡附盤中小走勢圖（快照累積）。
- **3D 牧場**：產業分區 InstancedMesh、草與牛、氣氛預覽 `?scene=`；無 WebGL2 時 2D 備援。
- **熱圖／榜單／ETF／產業表**：熱圖可點開個股；榜單前 20／展開 50；產業等權平均＋小走勢。
- **個股明細**：價量、漲跌停、估價標記、對標大盤；`?q=2330` 深連結；手機全螢幕面板。
- **盤中走勢**：快照歷史約每 1–2 分鐘一點（非逐筆）；不足時顯示價位區間示意。
- **觀察名單**：僅本機 `localStorage`，最多 40 碼，無股數／成本。
- **兩檔比較**：`?cmp=2330,2454`，價量與各自縮放曲線。
- **分享卡**：1200×630 SVG／PNG，明示延遲快照、非投資建議。
- **標誌切換**：可愛／精美／成熟／獅子，同步 favicon。
- **更新**：Actions 盤中約每 90–120 秒部署一輪；前端約 60 秒重抓同源快照。

## 資安與供應鏈

| 項目 | 狀態 |
| --- | --- |
| Content-Security-Policy | `default-src 'self'`；`script-src`／`connect-src` 同源；禁止 `object`／`unsafe-eval`；樣式允許 inline 以相容現有 UI |
| HTML 跳脫 | 股票名稱等動態文字經 `display.js` 跳脫，不以未淨化字串寫入 HTML |
| 行情資料 | `docs/data/` gitignore；快照與歷史**不進 Git**，只當 Pages artifact |
| Secret scanning | 已開；**push protection** 已開 |
| Dependabot | Actions 生態系每週檢查；security updates 已開 |
| Actions 鎖定 | `checkout`／`setup-node`／`configure-pages`／`cache`／`upload-pages-artifact`／`deploy-pages` 皆 pin 至完整 commit SHA |
| 依賴 | **零 npm 依賴**；three.js 以 vendor 隨附 |
| 分支保護 | 未設（避免擋住自動部署推送） |

## 可以看什麼

- 加權指數、櫃買指數、漲跌點數、百分比與開高低；紅漲、綠跌、灰平。
- 上市／上櫃／ETF／全市場的漲跌、平盤、未成交與漲跌停。ETF 小計已包含於市場總數。
- 3D 產業分區牧場：所有股票共用一個 InstancedMesh；田地高度對應漲跌幅絕對值，上限 10%。草葉以 GPU 擺動；低多邊形乳牛吃草、搖尾巴；大漲時帶行李離開，紅花盛開。
- 拖曳旋轉、滾輪／雙指縮放、點選股票報價；懶載入 three.js、離開畫面或隱藏分頁即暫停，尊重減少動態效果偏好。無 WebGL2 時使用 2D 備援牧場，完整田地圖仍可操作。
- 「實際／小跌／大跌／平盤／大漲」氣氛預覽，支援 `?scene=actual|down|crash|flat|up`。**只改變草、牛群與氣氛；報價、田地顏色與高度、榜單均維持原始資料。**
- 全市場產業田地熱圖、漲幅／跌幅／成交量前 20 名，可按「顯示更多」查看前 50 名；ETF 焦點、產業等權平均、股票代碼與名稱搜尋。搜尋結果預設 30 檔，每次可再顯示 50 檔。手機田地圖預先展開六個產業，可展開全部。
- 點選 3D 田地、熱圖、排行榜或搜尋列開啟個股明細，查看價量、開高低、漲跌停、估價標記與大盤比較。支援 `?q=2330` 深連結，選取以防抖方式更新網址，關閉時移除 `q`；可用 Esc、背景或關閉鈕離開，焦點會返回入口，手機為全螢幕面板。
- 個股盤中歷史有至少兩個有效點時，顯示「今日盤中走勢（依快照累積，約每 1–2 分鐘一點，非逐筆分時）」。不足時，開高低及現價齊全才顯示「今日價位區間示意（非分時圖）」，前收若存在則一併呈現；不合成報價。來源缺少個股時刻時明確標示，快照最新報價時間另列。
- 標頭下方的異動焦點跑馬燈顯示最多 8 檔，依漲跌幅絕對值排序；雙向皆有資料時保留一檔反向焦點。滑鼠停留／鍵盤聚焦時停止，也可手動暫停；減少動態效果模式改為靜態清單。
- 非盤中或盤後快照顯示「目前非盤中／收盤資料」與最後報價時間，資料過期時加強提示；初次載入各區有等待文字。
- 點選產業表列會展開並捲動至對應熱圖分區，同時套用股票搜尋的產業篩選；可再疊加名稱、代碼、市場與漲跌條件。
- 個股對標所屬市場的大盤，以百分點顯示「贏大盤／輸大盤」。產業表對標加權指數，混合日期資料不直接與當日大盤比較。

## 盤中歷史、觀察與分享

- `docs/data/history.json` 為緊湊 `v:1` JSON：記錄交易日期、來源 `quoteTime`、擷取 `generatedAt`、個股價格、兩大指數、產業等權平均與市場廣度。每次 `run-cycle.mjs` 擷取成功後原子寫入，兩輪都累積；最多保留 200 點，交易日期變更即重設，末筆報價時間與擷取時間完全相同時去重。缺價為 `null`，不補值。產業與指數卡亦提供小走勢圖；缺少歷史檔仍可正常看報價。
- Actions 在 configure-pages 後以 SHA 固定的 `actions/cache` 還原 `docs/data/history.json`，key 為 `cow-history-${{ github.run_id }}`、前綴為 `cow-history-`；工作成功結束時自動保存，包括第 2 輪更新。cache 可能被清除，因此歷史不保證完整。首輪本機缺檔時另嘗試 `LIVE_HISTORY_URL`（預設 `https://malilion.github.io/cow-pasture/data/history.json`），15 秒逾時，驗證版本與日期後載入；失敗忽略，既有本機檔優先。
- 歷史隨 Pages 公開發布，**`docs/data/` 已 gitignore，快照與歷史都不進 Git、不提交**。瀏覽器與快照同時以同源、`cache: 'no-store'` 讀取歷史，僅使用同交易日期資料。這是定時快照累積，非逐筆行情。
- 「我的觀察名單」只在瀏覽器 `localStorage` 的 `cowPasture.watch.v1` 保存最多 40 個唯一有效代碼；無股數、成本或資產估值，不同步、不上傳。可由明細加入或移出，報價取自目前快照；清除網站儲存空間會移除名單。
- 比較欄可輸入代碼或完整名稱，也可由個股明細「加入比較」。`?cmp=2330,2454` 可分享兩檔比較，與 `?q=` 並存；價格、漲跌幅、對標所屬大盤、成交量及各自縮放的盤中曲線同列，Esc 關閉比較。
- 「分享今日牧場」開啟 1200×630 SVG 預覽，以開啟當下快照的日期、時間、指數、漲跌平家數與牧場指數填入；可下載 SVG、嘗試 canvas 轉 PNG 或系統分享文字與網址。不硬編行情，卡片明示延遲快照、非投資建議；離線 fixture 模式另標示歷史樣本。
- 標頭「標誌」提供四款 256×256 插畫 PNG：`cute` 可愛乳牛、`fine` 精美乳牛插畫徽章、`mature` 成熟幾何牛頭、`lion` 柔和獅子徽章。SVG 保留為向量備份；`cowPasture.logo.v1` 僅保存樣式識別，預設可愛，同步切換品牌圖與 favicon。
- Open Graph／Twitter 社群大圖使用 `https://malilion.github.io/cow-pasture/og.jpg`（1200×630，無即時行情數字）；`docs/og.svg` 保留為額外品牌插畫。
- `/` 可聚焦搜尋（輸入欄與對話框內不攔截）；排行榜支援方向鍵及 Home／End。觀察名單、比較與標誌皆使用原生按鈕。省流量、記憶體 ≤4GB、核心 ≤4 或窄螢幕裝置使用像素比 1、最多 600 草葉、停用閒置自轉並省略花朵，保留 instancing。

可手動累積本機歷史：

```sh
node scripts/append-history.mjs --snapshot docs/data/snapshot.json --history docs/data/history.json
NODE_OPTIONS=--test-isolation=none node scripts/check.mjs
```

## 資料來源與限制

| 來源 | 用途 |
| --- | --- |
| [TWSE STOCK_DAY_ALL](https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL) | 上市代碼、名稱、盤後價量 |
| [TPEx daily_close_quotes](https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes) | 上櫃代碼、名稱、盤後價量 |
| [TWSE t187ap03_L](https://openapi.twse.com.tw/v1/opendata/t187ap03_L) | 上市產業別 |
| [TPEx mopsfin_t187ap03_O](https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O) | 上櫃產業別 |
| [TWSE MIS](https://mis.twse.com.tw/stock/api/getStockInfo.jsp) | 個股快照、漲跌停價與兩大指數 |

2026-11-06 實測：MIS、TWSE/TPEx OpenAPI 回應未提供 `Access-Control-Allow-Origin`，無法從 GitHub Pages 直接跨站抓取。瀏覽器僅向同源 `data/snapshot.json` 取資料；無代理服務、API 金鑰或第三方行情套件。

首頁透過 CSP meta 限制腳本與資料連線為同源，禁止外掛物件；樣式保留 inline 支援以相容現有介面，不允許 `unsafe-eval`。更完整的資安對照見上方「資安與供應鏈」。

普通股與 ETF 依 `^(\d{4}|00\d{2,4}[A-Z]?)$` 過濾，排除權證、債券與 `01001T` 等不符格式商品；`00` 開頭標記 ETF。實際檔數以每次 OpenAPI 結果為準，不硬編預期市場總數。

每個 job 首輪（含單次模式）都嘗試從 `LIVE_SNAPSHOT_URL`（預設 `https://malilion.github.io/cow-pasture/data/snapshot.json`）載入快照，成功後使用 `--quotes-only`；載入失敗則以 `Promise.allSettled` 並行擷取四個股票清單／產業來源，再查 MIS，不因 seed 失敗中止。後續輪次使用 `--quotes-only`，從前次快照重建股票與產業清單，只查 MIS，缺檔時自動回到完整擷取。快照另保留首輪真正的 EOD 欄位供後續缺漏回補，不把上輪盤中價當成盤後價。

MIS 每批 120 檔、循序請求，批次間隔預設 350ms；quotes-only 或擷取預算不超過 120 秒時改為 100ms。每次請求最長 15 秒、失敗重試兩次；連續三批失敗便停止。獨立完整擷取預算為約 5.5 分鐘，循環中的完整與 quotes-only 擷取預算最長約 110 秒，單次 workflow 完整擷取最長 210 秒，為 Pages 部署保留時間；不足時用盤後回補。`z` 缺值時先使用最近成交 `trade.z`，兩者均為成交價、不標估價；再依序使用有效買賣價中點、單邊買價／賣價，僅委買賣推估標示「估」；皆無則保留未成交。盤後股數轉為張；特殊漲跌字串不推算前收，不會捏造漲跌幅。盤後 API 未提供指數與報價時刻，因此顯示缺資料，而非填入自造數字或時間。

部分 MIS 失敗使用各檔盤後資料，介面標示回補日期；缺少日期一致的大盤時，不計算個股對標。MIS 全失敗則標示「盤後資料（前一交易日收盤）」。實際日期永遠顯示，連假時可能為更早的交易日。產業來源失敗歸入「其他」，市場來源缺少則顯示範圍不完整。若本機已有前次快照，可沿用代碼清單向 MIS 查詢，絕不把舊價格當成當日報價。完全沒有可用行情時擷取腳本失敗，Pages 保留最後一次成功部署。

## 架構

```text
TWSE / TPEx OpenAPI ── 股票清單、盤後價量、產業 ─┐
                                               ├─ GitHub Actions (Node 22)
TWSE MIS ─────────────── 每批 120 檔、指數 ───────┘
                       ↓ 正規化、缺值回補、日期標記
                 docs/data/snapshot.json
                       ↓ 首輪執行 check.mjs
                   run-cycle.mjs
                       ↓ actions/upload-pages-artifact@v3
                   actions/deploy-pages@v4
                       ↓
                 GitHub Pages 靜態網站
                       ↓ 同源 fetch
           儀表板 + 動態載入本地 three.js
```

快照為緊湊的 `fields` + `rows` 格式，`v:1`。`meta` 提供數量、成功批次、回補代碼／日期、失敗來源、資料範圍與原始 EOD 回補列。`generatedAt` 是擷取時間，`marketDate` / `quoteTime` 是來源報價日期／時間，兩者不可混淆。快照只上傳為 Pages artifact，**不會 commit 資料**；`docs/data/` 已忽略。

## 更新頻率與 GitHub Pages

在 GitHub 倉庫 Settings → Pages → Source 選 **GitHub Actions**，預設分支使用 `main`。推送 `docs/**`、`scripts/**`、`test/**`、`.github/**`，或手動執行 workflow 均可部署。測試 fixtures 保留於 repo，不會作為正式行情部署。

`.github/workflows/pages.yml` 的 UTC cron：

```yaml
- cron: '*/5 1-5 * * 1-5'  # 臺北週一至週五 09:00–13:55，每 5 分鐘
- cron: '20 6 * * 1-5'     # 臺北週一至週五 14:20 收盤單次快照
```

臺北週一至週五 09:00–13:35，Actions 每 5 分鐘啟動 job，啟動時由 `scripts/lib/loop-policy.mjs` 依臺北時間與事件輸出 `loop=true|false` 至 `$GITHUB_OUTPUT`。每個 5 分鐘 job 在循環模式依序執行最多 **2 次官方 Pages 部署**：`scripts/run-cycle.mjs --cycle 1` 嘗試 seed、擷取並執行一次 `check.mjs`，第 2 輪只更新 MIS、略過檢查。每輪擷取後，分別上傳 `github-pages-1`、`github-pages-2`，再由官方 deploy action 部署對應 artifact。擷取通常約 80–100 秒，加上部署與輪間 `sleep 15`，部署間隔約 **90–120 秒以上**，MIS 較慢時實測約 2 分鐘，實際間隔依網路與部署耗時變動。run-cycle 記錄擷取與總耗時、`quoteTime`、`generatedAt`；部署狀態由官方 action 記錄。整個 job 上限 8 分鐘；已移除第 3 輪，以符合 job 時間預算。

cron 本身涵蓋至 13:55，因此 13:35–13:55 啟動的 job 採**單次**快照；14:20 收盤排程也只執行一次。盤中 push／手動執行採循環模式，其餘時段與週末採單次。模式在 job 開始時決定一次，第 2 輪沿用同一輸出，可能跨過 13:35。平日休市仍會執行，真正行情日期由來源決定，這裡未另接交易日曆。

`concurrency.group: pages`、`cancel-in-progress: false` 讓前一個 job 完成再交接，避免工作同時部署。GitHub 預設只保留一個 pending run，新的排隊執行可能取代舊的 pending run；[官方 concurrency 說明](https://docs.github.com/en/actions/concepts/workflows-and-actions/concurrency)。第 1 輪擷取、檢查、上傳或部署失敗會停止後續步驟並讓 job 失敗；第 2 輪擷取、上傳與部署皆設 `continue-on-error: true`，晚發失敗仍保留第 1 輪 Pages，讓 job 正常結束。第 2 輪依前一步的 `outcome` 決定是否繼續，擷取失敗不會上傳或部署 seed／舊快照，上傳失敗不會嘗試部署。environment `github-pages` 的 URL 使用第一輪 `deployment.outputs.page_url`。

workflow 以**完整 commit SHA** 鎖定 `actions/checkout`、`actions/setup-node`（Node 22）、`actions/configure-pages`、`actions/cache`，再於每輪執行 SHA 鎖定的 `actions/upload-pages-artifact`（`path: docs`、保留 1 天）與 `actions/deploy-pages`（`artifact_name` 對應該輪名稱）；YAML 註解標示對應 major／版本號以便升級。權限維持 `contents: read`、`pages: write`、`id-token: write`。先前自訂 `POST /repos/.../pages/deployments` 在此 repo 使用 `GITHUB_TOKEN`、raw OIDC 與數字 artifact id 仍回 HTTP 404，因此改回曾成功的官方 actions，讓官方工具處理打包、OIDC 與部署輪詢。workflow 不再暫裝 `@actions/*` 套件，也不使用本機 `.github/actions/market-loop` 或自訂 Pages REST 部署；舊腳本僅保留供測試與參考，`package.json` 維持零依賴。

前端在臺北平日 09:00–14:30 約每 **60 秒**讀取同源快照，使用 `Date.now()` 查詢參數及 `cache: 'no-store'` 避免舊快取；其他時段每 10 分鐘，分頁隱藏時暫停。GitHub cron 可能排隊、延遲或漏跑，Pages 部署也需要時間；90–120 秒以上是部署間隔的概估，無法保證每次達成。MIS 本身也可能延遲，**非即時逐筆行情**，請同時看報價日期、時間與擷取時間。

指定 cron 每個平日共 **61 次**（60 次盤中時段排程＋1 次收盤），22 個平日約 **1,342 次／月**；push／手動執行另計。以每 5 分鐘最多 2 次、約 60 個時槽粗估，約 **120 次部署／日**；實際依 13:35 後單次模式、排程延遲與成功輪數而減少。這是本公開 repo 接受的更新頻率，使用標準 `ubuntu-latest` runner，適用 [GitHub 公開倉庫 Actions 免費使用規則](https://docs.github.com/en/actions/concepts/billing-and-usage)。[Pages 官方限制](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) 說明自訂 Actions workflow 不受每小時 10 次 build 軟限制，但高頻 Pages 部署仍可能觸發服務速率限制（HTTP 429）；需持續留意部署紀錄、artifact 儲存與服務限制，必要時降低輪數或頻率，並非保證無限額度。

## 本機開發

```sh
# Node >= 20；不需要 npm install
npm test

# 有網路時抓取正式快照
npm run snapshot

# 已有快照時僅更新 MIS；無快照會自動完整擷取
node scripts/fetch-snapshot.mjs --out docs/data --quotes-only

# 離線時使用 repo 隨附的真實歷史樣本（僅少數股票，畫面明確標示）
npm run snapshot:fixtures

npm start  # http://localhost:5173；PORT 可覆寫
```

`npm run build` 與 `npm test` 都執行 `node scripts/check.mjs`：逐一 `node --check` 第一方 JS/MJS，再執行 `node --test test/index.js`。無打包器或編譯步驟；本地 three.js 已隨 repo 提供。請使用 HTTP 伺服器開啟，ES modules 不支援直接雙擊 `file://`。

```text
scripts/lib/normalize.mjs    純解析、正規化與快照封裝
scripts/lib/history.mjs      盤中歷史純函式、原子寫入與線上 seed
scripts/append-history.mjs   追加歷史 CLI
scripts/fetch-snapshot.mjs   OpenAPI／MIS 擷取與 quotes-only
scripts/run-cycle.mjs        單輪 seed／擷取、首輪檢查與時間記錄
scripts/lib/cycle-support.mjs 共用線上快照 seed 與 check runner
scripts/lib/loop-policy.mjs  臺北交易時段、週期間隔與 mode 輸出 CLI
scripts/market-loop.mjs      舊自訂循環（保留測試，workflow 未使用）
scripts/deploy-pages-once.mjs 舊自訂 Pages 部署（保留測試，workflow 未使用）
scripts/fixture-snapshot.mjs 離線真實樣本產生器
scripts/serve.mjs            靜態 HTTP 伺服器
scripts/check.mjs            語法與 node:test

docs/js/logic.js             可在 Node 載入的純行情／時間邏輯
docs/js/display.js           格式化與 HTML 跳脫
docs/js/personal.js          觀察名單、兩股比較、標誌與小走勢圖
docs/js/share.js             快照分享卡、SVG／PNG 下載
docs/js/detail.js            個股明細、深連結、防抖與焦點管理
docs/js/app.js               介面、輪詢、事件委派
docs/js/pasture.js           three.js 牧場、互動與資源回收
```

測試以隨附 fixtures 為行情依據；網路錯誤測試只使用本機 stub，不會對外連線。測試涵蓋 run-cycle 首輪 seed 成敗、quotes-only 與檢查次數、錯誤傳遞、mode 的臺北時段與事件判斷、`$GITHUB_OUTPUT` 寫入、MIS-only 不查 OpenAPI 與原始 EOD 回補。舊自訂部署的 artifact 打包、Pages 狀態與逾時取消測試仍保留。正式官方 actions 部署仍需 GitHub Actions runner 才能驗證。

## 聲明與授權

本網站僅供娛樂與資訊參考，非投資建議。報價來源：臺灣證券交易所 MIS 基本市況報導、TWSE/TPEx OpenAPI，經 GitHub Actions 於盤中約每 1–2 分鐘更新，資料可能延遲或有誤，請以券商/交易所為準。

程式碼使用 [MIT](LICENSE)，Copyright (c) 2026 Malilion。three.js r187 依 [原 MIT 授權](docs/vendor/THREE_LICENSE.txt) 隨附，網站另有[開源致謝頁](docs/credits.html)。市場資料權利與使用條件歸原提供者。
