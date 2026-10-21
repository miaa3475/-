# Addendum：庫存管理系統（倉管與採購端 · 教學示範版）

*本文件承載 PRD 刻意不放的內容：技術選型與取捨、資料表草案、架構設計、被排除方案的理由、環境前置步驟、種子資料設計與開發順序。PRD 是「要做什麼」，這裡是「怎麼做、為什麼這樣做」。*

## 1. 技術選型與取捨

### 1.1 技術棧

| 層 | 選型 | 理由 |
| --- | --- | --- |
| 前端 | **React**（使用者指定）＋ 建置工具與型別／UI／狀態管理待確認（見 §1.2） | 簡報第 4、5 頁指定 HTML／CSS／JavaScript；React 的元件 + hooks + 狀態容器組合正好對應 MVVM 的 View / ViewModel 分工，可用來講解「UI 複雜度高的模組該把狀態邏輯放哪裡」 |
| 後端 | Python 3.12 + Flask + SQLAlchemy 2.x | 簡報第 4 頁列出 Node.js／Python Flask／Go 三選一；Flask 的 blueprint 結構對應 MVC 的 Controller，ORM 對應 Model，JSON 檢視對應 View |
| 資料庫 | PostgreSQL 18.6（本機既有 `Ailearn`） | 簡報第 7 頁指出 PostgreSQL「所有性能都很強」，且本機已安裝、schema 為空可從零設計 |
| 資料庫驅動 | psycopg 3 | SQLAlchemy 2.x 官方預設搭配 psycopg 3；連線字串 scheme 必須寫成 `postgresql+psycopg://`（見 §1.10） |
| 遷移 | **Flask-Migrate（內建 Alembic）** | 使用者指定以 migrate 模組管理 PostgreSQL；`flask db migrate -m "..."` 產生版本化遷移、`flask db upgrade` 套用 |
| 測試 | pytest + httpx | 對應 PRD「每條需求皆有可測試結果」的驗收方式 |
| 部署 | 單機：後端服務 + 靜態前端 + **本機既有 PostgreSQL 18.6** | 環境手冊已備妥本機 PostgreSQL（服務 `postgresql-x64-18`、埠 5432），課堂直接沿用最省事；Docker Compose 為**可選**方案，若採用需把容器埠改為 5433 以免與本機服務搶埠 |
| API 文件 | Flasgger 或 drf-spectacular（OpenAPI 3） | FR-23 要求自動產生文件 |

### 1.2 技術棧待確認項（使用者指示：暫不決定，維持待確認）

以下項目尚未收斂，實作前需由課程方選定；本文件不預設任何一組組合，避免把技術選型寫死：

- **前端建置工具**：Vite（單純 SPA）或 Next.js（引入 SSR 與路由混淆）。
- **型別**：TypeScript 或 JavaScript。
- **UI 元件庫**：Ant Design（後台表格與表單元件齊全）、MUI 或 Tailwind CSS。
- **伺服器狀態管理**：React Query 或純 fetch + useState。
- **全域狀態**：Zustand 或 Redux Toolkit，或不引入。
- **測試**：Vitest + Testing Library 或 Jest。

### 1.3 Flask 與 Node.js 的取捨

- **Flask**：教學上最容易對照 MVC（Blueprint = Controller、Service = 領域規則、JSON 檢視 = View）；Python 社群對 psycopg 3 支援成熟。缺點是 async 與前端即時性需求較弱——但本系統為純 Web 後台且不做即時推播，此缺點不成立。
- **Node.js（Express）**：前後端同語言，團隊協作與 JSON 處理順暢。缺點是本機環境的 Python 工具鏈已就緒，切換需額外安裝與除錯。
- **結論**：採 Flask。教學重點在「分層與職責分離」而非框架本身，兩者都能示範，且 Flask 的程式碼量更小、學生容易讀完。

### 1.4 MVVM 與 MVC 的取捨（對應簡報第 2、3 頁）

不選邊，而是**分模組示範兩者**：

- **MVC 適用的模組**（交易流程、單據、庫存異動）：Flask Blueprint 當 Controller 負責路由與參數檢查、Service 層承載交易與狀態機、SQLAlchemy Model 負責資料存取；View 以 JSON 呈現，前端不做狀態推演。
- **MVVM 適用的模組**（庫存查詢、盤點、報表前端）：React 元件只負責呈現，篩選條件、分頁與選取狀態交由 hooks 與全域狀態容器持有，元件透過容器觸發 API 呼叫；複雜的篩選與選取邏輯不寫在元件裡。
- **教學價值**：同一套系統內並存兩種組織方式，可直接在課堂上討論「同一個問題兩種解法的成本差異」。

### 1.5 成本計價法：v1 不計算

PRD 已把毛利分析與定價建議移出 v1（見 PRD 第 7 節），因此 **v1 不實作移動平均或 FIFO 成本引擎**，只記錄「批次進貨單價」作為該批次的成本快照，供日後加做毛利時使用。

- 優點：省下成本層沖銷引擎這塊最容易出錯、也最耗時的模組。
- 代價：批次單價不會被自動攤平到各批剩餘數量上。
- 連帶效果：盤點差異沒有金額基準，因此 PRD FR-15 只設差異率門檻、不設金額門檻。

### 1.6 盤點模式：凍結 / 動態 / 快照

- **凍結式（v1 採此）**：盤點期間阻擋範圍內異動。優點是帳面基準固定、比對單純；缺點是盤點期間倉庫吞吐停擺。
- **動態盤點**：期中有異動時提示基準已變更並要求重盤。實務常見，但流程複雜度較高。
- **快照**：記錄盤點開始時點的帳面，期後回算。實作成本最高。

### 1.7 負庫存政策

預設**禁止**負庫存：出庫前檢查可用庫存，不足則拒絕。允許負庫存會讓盤點差異與稽核失去意義。v1 僅提供「主管放行並填寫原因」的例外路徑；放行者與原因寫入出庫單據與結存明細（`stock_ledger.override_by` / `override_reason`）。

### 1.8 併發控制

多人同時作業時採**樂觀鎖**：`stock_balances` 帶 `version` 欄位，寫入時檢查版本，衝突則回應 409 並要求重試。這比悲觀鎖適合課堂示範（不需示範鎖佇列），也符合「庫存數字必須可還原」的目標。PRD §6 已將此列為硬性約束。

### 1.9 稽核完整性與盲點

稽核紀錄採 append-only 並以 `prev_hash` 串成雜湊鏈，可檢查中間是否遭改動。但**尾端截鎖偵測不到**——攻擊者若從最新一筆往回刪除並重算雜湊，鏈仍自洽。緩解做法是每日把 `head_hash` 寫到外部不可竄改的位置（磁碟唯讀檔）作為錨點。教學版以「每日匯出 head_hash 到唯讀檔」示範此概念即可；FR-22 的最低要求是序號連續性檢查，雜湊鏈為選做。

### 1.10 環境前置（實作前必做，與環境手冊一致）

來源：`資料庫使用手冊.md`（本機 PostgreSQL 18.6、資料庫 `Ailearn`、`.env` 既有設定）。

1. **服務確認** — `Get-Service postgresql-x64-18` 確認為 Running；`pg_isready -h localhost -p 5432` 應回 `accepting connections`。
2. **連線字串 scheme** — SQLAlchemy 2.x + psycopg 3 必須使用 `postgresql+psycopg://`。現有 `.env.example` 的 `DATABASE_URL=postgresql://postgres:...` 需改為 `postgresql+psycopg://postgres:...`，否則連線會失敗。
3. **密碼不入版控** — `.env` 已被 `.gitignore` 排除；但 `資料庫使用手冊.md` 含明文密碼，**必須一併加入 `.gitignore`**，或把手冊中的連線字串改為佔位符。
4. **專用應用程式帳號與最小權限** — 不要讓應用程式以 `postgres` 超级使用者連線。環境手冊 §5 的 `GRANT ALL PRIVILEGES ON DATABASE` 範例過寬且不足以讓表可存取，正確做法：

   ```sql
   CREATE USER app_user WITH PASSWORD '...';
   GRANT CONNECT ON DATABASE "Ailearn" TO app_user;
   GRANT USAGE, CREATE ON SCHEMA public TO app_user;   -- 教學期需要建立 schema 物件
   ```

   遷移用的 `.env` 與執行期連線可分開設定（`DATABASE_URL` 供 app 使用、`MIGRATION_DATABASE_URL` 供 Alembic 使用）。
5. **資料庫名大小寫敏感** — 在 SQL 與連線字串中都必須寫 `"Ailearn"`（首字母大寫），不可寫 `ailearn`。
6. **編碼與排序規則** — 資料庫為 UTF8、Collate/Ctype 為 `Chinese (Traditional)_Taiwan.950`；應用程式連線需設定 `client_encoding=UTF8`，避免中文排序與比對異常。
7. **備份** — 修改 schema 前先 `pg_dump -U postgres -h localhost -d Ailearn -Fc -f backup.dump`；每日備份須定期做還原演練，否則無法宣稱「可還原」（PRD §5）。
8. **密碼雜湊演算法** — 使用 Werkzeug 預設的 PBKDF2-HMAC-SHA256（或 argon2），雜湊結果存於 `users.password_hash`，明文不落盤、不進 API 回應。

## 2. 資料表草案

> 僅為起點草案，實作時以 Alembic 遷移腳本為準。名稱對應 PRD 第 3 節術語。

### 2.1 主檔

```
users(id, username, password_hash, display_name, role_id, is_active,
      must_change_password, created_at)
roles(id, code, name)                       -- WAREHOUSE / PURCHASE / ADMIN
role_permissions(role_id, permission_code)  -- 功能權限
product_categories(id, code, name, parent_id, safety_stock, reorder_multiplier)
products(id, product_code, name, barcode, category_id, unit, pack_size, conversion_factor,
         purchase_price, is_batch_tracked, status, created_at)  -- status: ACTIVE / DISABLED
product_batches(id, product_id, batch_no, qty, expiry_date, received_at)
suppliers(id, tax_id, company_name, contact_name, phone, status)
product_suppliers(id, product_id, supplier_id, unit_price, moq, lead_time_days, valid_until)
warehouses(id, code, name)                  -- v1 只有一筆
locations(id, warehouse_id, parent_id, code, name, is_frozen, is_aggregate, status)
             -- status: ACTIVE / DISABLED（停用取代刪除）
```

- 安全水位與補貨倍數存於 `products` 與 `product_categories` 兩處：商品有值優先於類別預設（PRD FR-16）。
- `products.barcode` 唯一且可為 NULL（多個 NULL 不衝突）。
- `product_batches.batch_no` 在同一商品下唯一；`qty` 為該批次的累計入庫數量。
- `locations` 不設容量上限（v1 簡化），只保留凍結狀態。

### 2.2 結存與異動（核心）

```
stock_ledger(id, seq, product_id, batch_id, location_id, from_location_id, to_location_id,
             qty_delta, movement_type, source_doc_type, source_doc_no, purpose,
             operator_id, override_by, override_reason, occurred_at)
             -- append-only，禁止 UPDATE / DELETE；seq 由應用層指派、單調遞增
stock_balances(id, product_id, batch_id, location_id, on_hand, version)
             -- 彙總表；version 供樂觀鎖
```

- v1 **沒有預留／保留機制**（無「先扣後核」的單據），因此沒有 `reserved` 欄位：可用庫存 = `on_hand`。未來若加入訂單預留，再新增 `reserved` 與對應流程。
- 批次以 `product_batches` 唯一識別，彙總表與結存明細皆以 `batch_id` 歸屬；未啟用批次的商品其 `batch_id` 為 NULL。
- **移位**以兩筆結存明細記錄（來源庫位一筆負數、目標庫位一筆正數，皆為 `movement_type = MOVE` 並帶 `from_location_id` / `to_location_id`），因此各庫位分別加總皆可還原，`stock_balances` 於移位後分別增減但總量守恆。
- **負庫存放行**的權威記錄在 `stock_ledger.override_by` / `override_reason`；單據層的對應欄位為鏡像，以結存明細為準。
- **期初餘額**以「期初建帳」為 `source_doc_type` 寫入結存明細，不直接塞進彙總表，否則 SM-3 的逐筆還原會失效。

### 2.3 單據

```
purchase_orders(id, po_no, supplier_id, status, expected_date, total_amount,
                sent_by, sent_at, approved_by, approved_at, created_at, reason,
                reopened_from_id)
purchase_order_lines(id, po_id, product_id, qty_ordered, qty_received, unit_price, batch_no)
goods_receipts(id, gr_no, po_id, status, received_at, operator_id, reason, reopened_from_id)
goods_receipt_lines(id, gr_id, product_id, qty, batch_no, expiry_date, location_id, unit_price)
sales_orders(id, so_no, customer_text, status, sold_by, sold_at, total_amount, reason,
             reopened_from_id)
sales_order_lines(id, so_id, product_id, batch_id, qty, unit_price, amount, location_id)
stocktakes(id, st_no, scope_type, scope_id, status, freeze_mode, total_diff_rate,
           submitted_by, submitted_at, reopened_from_id)
stocktake_lines(id, stocktake_id, product_id, batch_id, location_id, book_qty, actual_qty, diff_qty, reason_code)
adjustments(id, adj_no, status, reason_code, requested_by, approved_by, created_at,
            reopened_from_id)
adjustment_lines(id, adjustment_id, product_id, batch_id, location_id, qty_delta, reason_code)
```

- 五張單據表皆帶 `reopened_from_id`（指向被作廢的原單），支撐 FR-20 的「重開新單引用原單號」。
- 各單據的合法狀態流轉見 PRD FR-20 的表格，**不再共用同一組列舉**。
- `stocktakes.scope_type` ∈ LOCATION / CATEGORY / PRODUCT。
- 所有出貨／盤點／調整明細皆帶 `batch_id`（啟用批次的商品必填），以維持批次可追溯。

### 2.4 稽核與設定

```
audit_log(id, seq, actor_id, action, object_type, object_id, field_name,
          old_value, new_value, doc_type, doc_no, occurred_at, prev_hash, entry_hash)
audit_head_anchor(head_hash, anchored_at)    -- 每日匯出到唯讀檔，作為外部錨點
settings(key, value_json)                    -- 差異率門檻、補貨倍數預設、凍結模式
```

### 2.5 資料完整性上的關鍵約束（教學重點）

- `products.product_code` 唯一；`products.barcode` 唯一且可為 NULL。
- `stock_ledger.seq` 由應用層指派且連續遞增；`stock_ledger` 無 UPDATE / DELETE 權限。
- `stock_balances.on_hand ≥ 0` 由應用層檢查（避免觸發條件觸發器難以測試）。
- 進貨單已收量 ≤ 訂購量（超收需主管放行並記錄放行者與原因）。
- 領用數量 ≤ 可用庫存。
- 同一商品下 `product_batches.batch_no` 唯一。

## 3. 架構與請求流程

```
瀏覽器 (React SPA)
   │  REST / JSON（Bearer token）
   ▼
Flask Blueprint（Controller：路由、參數驗證、權限檢查）
   ▼
Service 層（領域規則、狀態機、交易邊界、庫存異動寫入）
   ▼
Repository 層（SQLAlchemy；讀寫、彙總更新）
   ▼
PostgreSQL 18（stock_ledger / stock_balances / 單據 / 稽核）
```

橫切關注點（cross-cutting）：

- **AuditService**：所有敏感寫入在交易內同步寫入 `audit_log` 並更新雜湊鏈。
- **StockService**：庫存數量唯一寫入入口，負責產生 `stock_ledger` 並更新 `stock_balances`，禁止其他模組直接改數字。
- **AuthService**：token 管理、角色權限檢查。
- **PriceScope**：欄位遮蔽在 **API 序列化層**執行（與 PRD FR-3 一致），確保不同角色收到的 API 回應欄位不同；不做 ORM 層過濾器，避免與前端顯示不一致。

## 4. 已評估但排除的方案

| 方案 | 為何排除 |
| --- | --- |
| 微服務架構 | 教學環境資源有限，部署與除錯成本高；模組化單體已能示範分層與領域邊界 |
| NoSQL（MongoDB）作為主庫 | 庫存資料關聯性強（商品→批次→庫位→異動），且需要交易與唯一性約束，PostgreSQL 更適合；MongoDB 可在課程中作為對照討論（簡報第 7 頁亦列為選項） |
| ORM 全自動（Active Record 風格） | 容易讓交易邊界與領域規則跑到 controllers，削弱「分層」教學目的 |
| Redis 快取層 | 目前資料量不需；留待示範快取失效策略時再引入 |
| 前端呼叫多個後端 API 自行組裝庫存數字 | 破壞「庫存數量唯一寫入入口」的原則，容易出現不一致 |
| 多倉調撥與在途庫存 | 需新增調撥單、在途狀態機與盤點凍結的交互規則，是 v2 的第一優先項 |
| 毛利與定價分析模組 | 依使用者決定的範圍（聚焦倉管＋採購端），移至 v2 |
| 成本計價引擎（移動平均／FIFO） | 沒有毛利需求就不需要，連帶省下盤點金額門檻 |
| 序號（單件）商品管理 | 簡報未提及，徒增資料模型複雜度而無驗收價值 |
| 訂單預留（reserved）機制 | v1 無「先扣後核」的單據，會讓可用庫存定義與資料模型都變複雜而無使用情境 |
| Docker Compose 作為預設部署 | 本機 PostgreSQL 環境已備妥，預設走單機部署較省事；容器方案保留為可選 |

## 5. 種子資料設計（教學用）

- 商品 200 筆：飲料 80、原料 60、備品 40、包材 20；其中 20 筆啟用批次管理、80 筆有條碼。
- 倉庫 1 個、庫位 30 個（三層結構「區-排-層」）。
- 供應商 15 筆（含 3 筆同類供應商以示範比價）。
- 庫存：期初餘額 100 筆（以「期初建帳」單據寫入結存明細，非直接塞入彙總表）；單據再產生約 50 筆異動（進貨 6 張 × 3 品項 ≈ 18、銷貨 8 張 × 2 ≈ 16、領用 10、移位 6），合計約 150 筆結存明細（對應 PRD §5 的資料量級）。
- 其中涵蓋低於安全水位 10 筆（供 FR-16 示範）。
- 單據狀態覆蓋：採購單 8 張（各狀態）、進貨單 6 張、銷貨單 8 張、盤點單 3 張（1 張未完成、1 張有盤虧待核准）。
- 帳號 6 個：倉管 ×2、採購 ×2（示範送單≠核准）、主管 ×2（示範第二人覆核）。密碼統一為課堂指定值，首次登入強制修改。
- 安全水位：商品層 15 筆、類別層 4 筆（示範覆蓋優先順序）。
- 重置指令：`flask seed --reset`，目標執行時間 ≤ 30 秒（SM-4）。

## 6. 開發順序建議（對應課堂進度，6 堂課）

1. **第 1 堂**：schema（users、roles、products、warehouses、locations）＋ Flask-Migrate 遷移（`flask db init` / `migrate` / `upgrade`）＋ 種子資料。
2. **第 2 堂**：登入與角色、欄位遮蔽、前後端骨架與分層（MVC 分層示範：React 頁面 → Flask Blueprint → Service → Repository）。對應 FR-1～FR-3、FR-23。
3. **第 3 堂**：商品與供應商主檔 CRUD（呼應簡報第 6 頁的 CRUD 主題）、條碼掃描輸入。對應 FR-4～FR-8。
4. **第 4 堂**：庫存異動引擎（`stock_ledger` 與 `stock_balances`）、進貨、領用、移位、單據狀態機。對應 FR-9～FR-13、FR-20。
5. **第 5 堂**：採購與安全水位、補貨建議、盤點與差異核准。對應 FR-14～FR-18。
6. **第 6 堂**：銷貨單、稽核軌跡、庫存查詢與彙總、端到端劇本彩排與評量。對應 FR-19、FR-21～FR-23。

## 7. 參考文獻

*來自 `research-landscape.md` 的領域參考（完整 60 個來源見該檔）。*

1. 台灣 B 庫存資料管理使用手冊（tmserp.com.tw）— 台灣最完整的庫存作業手冊，術語與表單命名依據。
2. ERPNext Stock Entry（docs.frappe.io/erpnext/stock-entry）— 單一異動引擎＋purpose 欄位的抽象藍圖。
3. ERPNext FIFO 與移動平均（docs.frappe.io/erpnext/fifo-and-moving-average）— 成本計價法權威說明（v2 參考）。
4. Odoo Inventory 文件（odoo.com/documentation/19.0/applications/inventory_and_mrp）— 模組組織藍圖。
5. SAP ERP 庫存管理（help.sap.com）— 負庫存與在途（TR/TO）機制。
6. Oracle Retail OMS（docs.oracle.com）— 負庫存禁止與凍結旗標。
7. NetSuite Warehouse Fulfillment（netsuite.com）— 動態盤點（Smart Count）。
8. 台灣進銷存管理（itecerp.com、erpking.com.tw）— 權責劃分、帳料合一與報表命名慣例。

## 8. 已知風險

| 風險 | 影響 | 緩解 |
| --- | --- | --- |
| 簡報第 12 頁的毛利、折扣、組合商品、建議售價與調貨單被排除，可能影響評分 | 高 | PRD 第 7 節已標示落差與回填代價，列為開放問題第 1 點，需由授課教師確認 |
| 範圍仍可能外溢（想加毛利、電商、POS） | 高 | PRD 第 7、8 節已明列非目標；新增需求以「是否支撐 SM-1 示範劇本」判斷 |
| 學生卡在複雜度（批次、盤點凍結、稽核雜湊鏈）而無法完成示範劇本 | 中 | 稽核雜湊鏈為選做；批次與盤點凍結示範重點已標註 |
| 環境重建困難（PostgreSQL 或 Python 版本差異、連線 scheme 寫錯） | 中 | §1.10 環境前置清單；`postgresql+psycopg://` scheme 校正；alembic + seed 指令可重現 |
| 本機服務與 Docker 容器搶 5432 埠 | 中 | §1.1 已指定預設走單機部署；採用容器時把容器埠改為 5433 |
| 環境手冊含明文密碼且未排除於版控 | 中 | §1.10 第 3 點已要求把手冊排除於版本控制或改為佔位符 |
| 前端生態選項尚未定案，實作時可能反覆 | 低 | §1.2 已列為待確認，選定後再凍結 §1.1 技術棧表 |
