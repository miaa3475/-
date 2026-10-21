# Addendum：庫存管理系統（教學示範版）

*本文件承載 PRD 刻意不放的內容：技術選型與取捨、資料表草案、架構設計、被排除方案的理由、單據規格與參考文獻。PRD 是「要做什麼」，這裡是「怎麼做、為什麼這樣做」。*

## 1. 技術選型與取捨

### 1.1 技術棧

| 層 | 選型 | 理由 |
| --- | --- | --- |
| 前端 | **React**（使用者指定）＋ 建置工具與型別／UI／狀態管理待確認（見 §1.3） | 課題簡報指定 HTML／CSS／JavaScript；React 是主流且生態與教學資源最齊，元件 + hooks + 狀態容器的組合正好對應 MVVM 的 View / ViewModel 分工，可直接用來講解「UI 複雜度高的模組該把狀態邏輯放哪裡」 |
| 後端 | Python 3.12 + Flask + SQLAlchemy 2.x | 課題簡報列出 Node.js／Flask／Go 三選一；Flask 的 blueprint 結構對應 MVC 的 Controller，ORM 對應 Model，模板或 JSON 對應 View |
| 資料庫 | PostgreSQL 18.6（本機既有 `Ailearn`） | 課題簡報指出 PostgreSQL「所有性能都很強」，且本機已安裝、schema 為空可從零設計；同時支援 JSONB、部分索引與 CHECK 限制，適合演示庫存資料的正確性約束 |
| 遷移 | **Flask-Migrate（內建 Alembic）** | 使用者指定以 migrate 模組管理 PostgreSQL；`flask db migrate -m "..."` 產生版本化遷移、`flask db upgrade` 套用，老師或學生可隨時回到任一版本重現環境 |
| 測試 | pytest + httpx | 對應 PRD「每條需求皆有可測試結果」的驗收方式 |
| 部署 | Docker Compose（前端 + 後端 + PostgreSQL） | 一鍵重置課堂環境，呼應「教學交付與驗收」 |
| API 文件 | Flasgger 或 drf-spectacular（OpenAPI 3） | FR-47 要求自動產生文件 |

### 1.1.1 React 生態選項（待你確認，確認後固定為課堂基準）

| 項目 | 候選 | 建議預設 | 取捨重點 |
| --- | --- | --- | --- |
| 語言 | TypeScript / JavaScript | **TypeScript** | 與後端 Pydantic/型別契約對齊，示範「前後端共用型別定義」；但需多花一堂課講型別 |
| 建置工具 | Vite / Next.js | **Vite** | Vite 單純當 SPA 後端；Next.js 會引入 SSR/路由混淆，對教學聚焦不利 |
| UI 元件庫 | Ant Design / MUI / Tailwind CSS | **Ant Design** | Ant Design 是後台管理系統最常見、表格與表單元件齊全（庫存系統重度依賴表格與表單）；Tailwind 自由度高但需自刻樣式，耗時 |
| 伺服器狀態 | React Query / 純 fetch + useState | **React Query** | 讓「後端資料」與「元件狀態」分離，本身就是一堂好課；代價是額外依賴 |
| 全域狀態 | Zustand / Redux Toolkit / 不引入 | **Zustand**（或先不引入） | 盤點與庫存查詢的篩選/選取狀態需要跨元件共享，Redux Toolkit 對初學者偏重 |
| 路由 | React Router | React Router | 對應「多頁面角色流程」的教學需求 |
| 表單 | React Hook Form | React Hook Form | 單據表單欄位多、驗證規則多，RHF 可示範「表單驗證與後端驗證對應」 |
| 圖表 | Recharts | Recharts（可延後） | 報表視覺化可放進 v2，v1 先做表格 + CSV 匯出 |
| 測試 | Vitest + Testing Library / Jest | **Vitest + Testing Library** | Vitest 與 Vite 共用設定，測試速度與設定成本較低 |
| 前端部署 | Docker（nginx 靜態託管）/ dev server | Docker + nginx | 課堂環境需一鍵起，nginx 託管建置產物最省事 |

### 1.2 Flask 與 Node.js 的取捨

- **Flask**：教學上最容易對照 MVC（Blueprint = Controller、Service = 領域規則、Blueprint/JSON 檢視 = View）；Python 社群對 PostgreSQL 的 psycopg 3 支援成熟；若課程本身以 Python 授課，可減少語言切換成本。缺點是 async 與前端即時性需求較弱。
- **Node.js（Express）**：前後端同語言，團隊協作與 JSON 處理順暢；缺點是本機環境的 Python 工具鏈已就緒，切換需額外安裝與除錯。
- **結論**：採 Flask。教學重點在「分層與職責分離」而非框架本身，兩者都能示範，且 Flask 的程式碼量更小、學生容易讀完。

### 1.3 MVVM 與 MVC 的取捨（對應課題簡報第 2、3 頁）

不選邊，而是**分模組示範兩者**：

- **MVC 適用的模組**（交易流程、單據、庫存異動）：Flask Blueprint 當 Controller 負責路由與參數檢查、Service 層承載交易與狀態機、SQLAlchemy Model 負責資料存取；View 以 JSON 呈現，前端不做狀態推演。
- **MVVM 適用的模組**（庫存查詢、盤點、報表前端）：React 元件只負責呈現，篩選條件、分頁與選取狀態交由 hooks 與全域狀態容器（Zustand 或 Redux Toolkit，待確認）持有，元件透過容器觸發 API 呼叫；複雜的篩選與選取邏輯不寫在元件裡。
- **教學價值**：同一套系統內並存兩種組織方式，可直接在課堂上討論「同一個問題兩種解法的成本差異」——這比課本上比較兩張架構圖更有說服力。

### 1.4 成本計價法：移動平均 vs 先進先出

| 面向 | 移動平均（FIFO 為另一選項） | 先進先出 |
| --- | --- | --- |
| 計算 | 每次進貨後以總金額／總數量重算單位成本 | 每批批次成本固定，發貨逐批沖銷 |
| 優點 | 實作簡單、毛利計算即時、報表容易對齊 | 成本可追溯到具體批次、與實務帳務較接近 |
| 缺點 | 無法逐批追溯，歷史成本會被新進貨稀釋 | 需批次成本引擎，盤點與退貨沖銷複雜度高 |
| 教學取捨 | 課程時間有限，移動平均可在 2 小時內講透 | 批次成本已在 PRD 的批號需求中出現，適合進階議題 |

PRD 目前採**移動平均**，並在 FR-8 與 FR-33 明確「已過帳異動不因成本調整回溯重算」，避免與 FIFO 混淆。若課程安排希望展示批次成本，v2 可加 `cost_layers` 表並以 FIFO 重算——這正是 addendum 存在的理由：**技術決定不應偷渡進 PRD**。

### 1.5 盤點模式：凍結 / 動態 / 快照

- **凍結式（v1 採此）**：盤點期間阻擋範圍內異動。優點是帳面基準固定、比對單純；缺點是盤點期間倉庫吞吐停擺。
- **動態盤點**：期中有異動時提示基準已變更並要求重盤。實務（NetSuite Smart Count 等）常見，但流程複雜度較高。
- **快照**：記錄盤點開始時點的帳面，期後回算。實作成本最高。

### 1.6 負庫存政策

預設**禁止**負庫存：出庫前檢查可用庫存，不足則拒絕。理由是實務上 Oracle 零售套件明文禁止、SAP 與 ERPNext 雖可設定但最佳實務仍為關閉；允許負庫存會讓盤點差異與稽核失去意義。v1 僅提供「具特權者放行並填寫原因」的例外路徑。

### 1.7 併發控制

多倉與多人同時作業時採**樂觀鎖**：庫存彙總表帶 `version` 欄位，寫入時檢查版本，衝突則回應 409 並要求重試。這比悲觀鎖適合課堂示範（不需示範鎖佇列），也符合「庫存數字必須可還原」的目標。

### 1.8 稽核完整性與盲點

稽核紀錄採 append-only 並以 `prev_hash` 串成雜湊鏈，可檢查中間是否遭改動。但**尾端截鎖偵測不到**——攻擊者若從最新一筆往回刪除並重算雜湊，鏈仍自洽。緩解做法是每日把 `head_hash` 寫到外部不可竄改的位置（磁碟唯讀檔或簽章）作為錨點。教學版以「每日匯出 head_hash 到唯讀檔」示範此概念即可。

## 2. 資料表草案

> 僅為起點草案，實作時以 Alembic 遷移腳本為準。名稱對應 PRD 第 3 節術語。

### 2.1 主檔

```
users(id, username, password_hash, display_name, role_id, is_active, must_change_password, created_at)
roles(id, code, name)                       -- WAREHOUSE / PURCHASE / SALES / ACCOUNTING / ADMIN
role_permissions(role_id, permission_code)  -- 功能權限
product_categories(id, code, name, parent_id)
products(id, product_code, name, category_id, unit, pack_size, purchase_cost, selling_price,
         safety_stock, reorder_multiplier, is_serial_tracked, is_batch_tracked, expiry_days,
         status, created_at)                -- status: ACTIVE / DISABLED
unit_conversions(id, product_id, from_unit, to_unit, factor)
product_batches(id, product_id, batch_no, expiry_date, received_at)
product_serials(id, product_id, serial_no, batch_id, status, current_warehouse_id)
suppliers(id, tax_id, company_name, contact_name, phone, address, status)
product_suppliers(id, product_id, supplier_id, unit_price, moq, lead_time_days, valid_until)
warehouses(id, code, name, address)
locations(id, warehouse_id, parent_id, code, name, capacity, is_frozen, is_aggregate)
```

### 2.2 結存與異動（核心）

```
stock_ledger(id, seq, product_id, batch_id, warehouse_id, location_id,
             qty_delta, movement_type, source_doc_type, source_doc_no, purpose,
             operator_id, occurred_at)        -- append-only，禁止 UPDATE / DELETE
stock_balances(id, product_id, batch_id, warehouse_id, location_id,
               on_hand, reserved, version)    -- 彙總表，含樂觀鎖 version
```

`stock_balances.reserved` = 已分配給未出貨銷貨單的數量；`可用庫存 = on_hand − reserved`。

### 2.3 單據

```
purchase_orders(id, po_no, supplier_id, status, expected_date, total_amount,
                sent_by, approved_by, created_at, reason)
purchase_order_lines(id, po_id, product_id, qty_ordered, qty_received, unit_price, batch_no)
goods_receipts(id, gr_no, po_id, status, received_at, operator_id, reason)
goods_receipt_lines(id, gr_id, product_id, qty, batch_no, expiry_date, location_id, unit_price)
sales_orders(id, so_no, customer_text, status, sold_by, sold_at, discount_rate,
             total_amount, gross_profit, tax_type, invoice_no, reason)
sales_order_lines(id, so_id, product_id, qty, unit_price, discount_rate, amount, cost_snapshot)
transfers(id, to_no, from_warehouse_id, to_warehouse_id, status, reason, shipped_at, received_at)
transfer_lines(id, transfer_id, product_id, qty, qty_received)
stocktakes(id, st_no, scope_type, scope_id, status, freeze_mode, total_diff_rate, submitted_at)
stocktake_lines(id, stocktake_id, product_id, location_id, book_qty, actual_qty, diff_qty, reason_code)
adjustments(id, adj_no, status, reason_code, requested_by, approved_by, created_at)
adjustment_lines(id, adjustment_id, product_id, location_id, qty_delta, reason_code)
```

單據狀態機（`status` 欄位共用的列舉）：

```
DRAFT → PENDING_APPROVAL → APPROVED
   ↓            ↓            ↓
VOIDED      REJECTED      (作廢後不可回退；銷貨作廢需回滾 stock_ledger)
```

### 2.4 稽核與設定

```
audit_log(id, seq, actor_id, action, object_type, object_id, field_name,
          old_value, new_value, doc_type, doc_no, occurred_at, prev_hash, entry_hash)
audit_head_anchor(head_hash, anchored_at)    -- 每日匯出到唯讀檔，作為外部錨點
settings(key, value_json)                    -- 單號規則、門檻、補貨倍數、凍結模式
```

### 2.5 資料完整性上的關鍵約束（教學重點）

- `products.product_code` 唯一；`stock_ledger` 以 `seq` 單調遞增。
- `stock_balances.on_hand ≥ 0` 由應用層檢查（避免觸發條件觸發器難以測試）。
- 進貨單已收量 ≤ 訂購量（超收需特權放行並記錄原因）。
- 調出數量 ≤ 調出倉可用庫存。
- 領用數量 ≤ 可用庫存。

## 3. 架構與請求流程

```
瀏覽器 (React SPA)
   │  REST / JSON（Bearer 工作階段憑證）
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
- **AuthService**：工作階段管理、角色權限、欄位遮蔽（遮蔽在 API 序列化層執行，確保不回傳成本欄位）。
- **NotificationService**：v1 僅記錄待辦與提醒（低於安全水位、待審核單據），實際寄送（email／Line Notify）留待 v2。

## 4. 已評估但排除的方案

| 方案 | 為何排除 |
| --- | --- |
| 微服務架構 | 教學環境資源有限，部署與除錯成本高；模組化單體已能示範分層與領域邊界 |
| NoSQL（MongoDB）作為主庫 | 庫存資料關聯性強（商品→批次→庫位→異動），且需要交易與唯一性約束，PostgreSQL 更適合；MongoDB 可在課程中作為對照討論 |
| ORM 全自動（Active Record 風格） | 容易讓交易邊界與領域規則跑到 controllers，削弱「分層」教學目的 |
| Redis 快取層 | 目前資料量不需；留待示範快取失效策略時再引入 |
| 前端呼叫多個後端 API 自行組裝庫存數字 | 破壞「庫存數量唯一寫入入口」的原則，容易出現不一致 |

## 5. 種子資料設計（教學用）

- 商品 500 筆：飲料 200、原料 150、備品 100、包材 50；其中 30 筆含批號、5 筆為序號商品。
- 倉庫 3 個（台北倉、台中倉、高雄倉），庫位約 200 個（每倉「區-排-層」三層結構）。
- 供應商 20 筆（含 3 筆同類供應商以示範比價）。
- 庫存：期初餘額 400 筆，涵蓋低於安全水位 12 筆（供 FR-13 示範）。
- 單據：採購單 15 張（各狀態 5 張）、進貨單 12 張、銷貨單 20 張、調撥單 5 張（1 張在途）、盤點單 4 張（1 張未完成、1 張有盤虧待核准）。
- 帳號：5 個種子帳號（每角色一個），密碼統一為課堂指定值，首次登入強制修改。
- 重置指令：`flask seed --reset`，目標執行時間 ≤ 30 秒（SM-3）。

## 6. 開發順序建議（對應課堂進度）

1. **第 1 堂**：schema（users、roles、products、warehouses、locations）＋ Flask-Migrate 遷移（`flask db init` / `migrate` / `upgrade`）＋ 種子資料。
2. **第 2 堂**：登入與角色、權限遮蔽、前後端骨架與分層（MVC 分層示範：React 頁面 → Flask Blueprint → Service → Repository）。
3. **第 3 堂**：商品與供應商主檔 CRUD（呼應課題簡報第 6 頁的 CRUD 主題）。
4. **第 4 堂**：庫存異動引擎（`stock_ledger` 與 `stock_balances`）、進貨、領用、移位。
5. **第 5 堂**：採購與安全水位、調撥與在途。
6. **第 6 堂**：銷貨、毛利、組合商品（MVVM 前端示範：庫存查詢與盤點畫面）。
7. **第 7 堂**：盤點與差異審核、稽核軌跡與雜湊鏈。
8. **第 8 堂**：報表、CSV 匯入匯出、OpenAPI 文件、端到端劇本彩排與評量。

## 7. 參考文獻

*來自 `research-landscape.md` 的領域參考（完整 60 個來源見該檔）。*

1. 台灣 B 庫存資料管理使用手冊（tmserp.com.tw）— 台灣最完整的庫存作業手冊，術語與表單命名依據。
2. ERPNext Stock Entry（docs.frappe.io/erpnext/stock-entry）— 單一異動引擎＋purpose 欄位的抽象藍圖。
3. ERPNext FIFO 與移動平均（docs.frappe.io/erpnext/fifo-and-moving-average）— 成本計價法權威說明。
4. Odoo Inventory 文件（odoo.com/documentation/19.0/applications/inventory_and_mrp）— 模組組織藍圖。
5. SAP ERP 庫存管理（help.sap.com）— 負庫存與在途（TR/TO）機制。
6. Oracle Retail OMS（docs.oracle.com）— 負庫存禁止與凍結旗標。
7. NetSuite Warehouse Fulfillment（netsuite.com）— 動態盤點（Smart Count）。
8. 台灣進銷存管理（itecerp.com、erpking.com.tw）— 權責劃分、帳料合一與報表命名慣例。
9. 食品來源文件保存 5 年法規（fda.gov.tw）— 追溯與保存期限概念（本專題不實作，僅課堂延伸討論）。

## 8. 已知風險（教學版）

| 風險 | 影響 | 緩解 |
| --- | --- | --- |
| 學生卡在複雜度（批次、序號、稽核雜湊鏈）而無法完成示範劇本 | 高 | 示範重點鎖定在第 6 節劇本；批次／序號／雜湊鏈列為選作加分項 |
| 期末或課堂時間不足 | 中 | 第 6 節已標示不列入評分的項目；開發順序可壓縮到第 1～5 堂 |
| 環境重建困難（PostgreSQL 或 Python 版本差異） | 中 | Docker Compose 一鍵啟動；alembic + seed 指令可重現 |
| 需求蔓延（想加 BOM、電商、POS） | 中 | PRD 第 7、8 節已明列非目標；新增需求以「是否支撐示範劇本」判斷 |
| 教授要求與 PRD 假設不一致（例如要求離線或多幣別） | 中 | 第 10 節開放問題已標出相關假設，可據此調整範圍與時程 |
