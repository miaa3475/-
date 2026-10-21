---
title: '庫存管理系統 — 可運作網頁版本'
type: 'feature'
created: '2026-10-21'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/prds/prd-庫存管理系統-2026-10-21-r2/prd.md'
  - '{project-root}/_bmad-output/planning-artifacts/prds/prd-庫存管理系統-2026-10-21-r2/addendum.md'
  - '{project-root}/_bmad-output/implementation-artifacts/api-contract.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 專案目前只有 PRD 與技術附錄，沒有任何程式碼。使用者要求「跑成網頁」——把已定案的 23 條功能需求做成一個真的能在瀏覽器開啟、連得上資料庫、跑完完整業務流程的後台系統。

**Approach:** 依 PRD 與 `api-contract.md` 建置兩層：`backend/`（Flask + SQLAlchemy + Flask-Migrate + PostgreSQL 18.6 本機 `Ailearn` 庫）提供 REST API 與種子資料；`frontend/`（React + Vite）提供繁中後台介面。資料模型與服務分層照 `addendum.md` §2／§3，庫存數量只允許經過單一寫入入口。

## Boundaries & Constraints

**Always:**
- 庫存數量只允許由 `StockService` 寫入；任何路由不得直接改 `stock_balances.on_hand`。
- `stock_ledger` 僅追加；作廢以反向明細沖銷，不刪不改既有明細。
- 可用庫存 = 現存數量（v1 無預留機制）。
- 採購單價對 `WAREHOUSE` 角色遮蔽，在後端序列化層完成。
- 送單者與核准者不得為同一人；盤點凍結期間範圍內異動一律阻擋。
- 資料表與欄位名稱照 `addendum.md` §2；不在 PRD 範圍的功能一律不做。

**Never:**
- 不做毛利/定價、跨倉調撥與在途、序號、CSV 匯入匯出、圖表報表、序號帳號權限引擎。
- 不使用 Redis、不引入 ORM 全自動風格、不在交易外寫庫存數字。
- 不動 `Ailearn` 以外的資料庫；不刪除既有 schema（目前為空）。
- 不用 Docker（本機 PostgreSQL 已就緒）。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 登入 | 正確帳密 / 錯誤帳密 | 回 token 與角色 / 訊息一致不透露帳號是否存在 | 401 |
| 進貨 | 採購單已核准、商品啟用批次 | 建進貨單、寫結存明細、更新現存與批次數量 | 採購單未核准 → 400；超收 → 400 需主管放行 |
| 領用 | 可用庫存足夠 / 不足 | 扣減現存、產生帶用途的異動 / 拒絕並顯示可用庫存 | 400 顯示可用庫存 |
| 移位 | 目標庫位凍結 | 拒絕移位 | 400 |
| 盤點 | 範圍內有異動 | 凍結阻擋 / 核准後自動產生庫存調整 | 400 提示盤點單號 |
| 核准 | 送單者本人核准 | 拒絕（需第二人覆核） | 400 |
| 價格遮蔽 | 倉管查商品 / 進貨單 | 回應不含 `purchase_price`、`unit_price` | — |
| 作廢 | 已送出的銷貨單 | 以反向結存明細沖銷，恢復可用庫存，產生新單 | — |

</frozen-after-approval>

## Code Map

專案根目錄 `C:\Users\user\Desktop\庫存管理系統` **目前沒有任何程式碼**，以下皆為新建。

- `_bmad-output/planning-artifacts/prds/prd-庫存管理系統-2026-10-21-r2/prd.md` — 23 條 FR 的驗收基準，唯一需求來源
- `_bmad-output/planning-artifacts/prds/prd-庫存管理系統-2026-10-21-r2/addendum.md` — §2 資料表草案（欄位名照抄）、§3 架構分層、§1.10 環境前置、§5 種子資料
- `_bmad-output/implementation-artifacts/api-contract.md` — **前後端協調基準**，端點、JSON 形狀、狀態機、遮蔽規則
- `資料庫使用手冊.md` — 本機 PG 18.6、DB `Ailearn`（大小寫敏感）、`.env` 連線字串
- `.env` — `DATABASE_URL=postgresql://...` **需改成 `postgresql+psycopg://`**（psycopg3 驅動），或改用 `postgresql://` + 移除 psycopg 改用 psycopg2
- `.venv/` — 已建立（Python 3.12），依賴已安裝（flask 3.1.3、SQLAlchemy 2.1.5、psycopg 3.3.6、flasgger）
- `frontend/node_modules/` — 已安裝 react 18.3.1、react-router-dom 6.28、vite 5.4

## Tasks & Acceptance

**Execution:**
- [ ] `.env` — 把 `DATABASE_URL` scheme 改為 `postgresql+psycopg://` — psycopg3 驅動要求
- [ ] `backend/app/config.py` — 讀 `.env`、設 `SQLALCHEMY_DATABASE_URI` — 連線設定
- [ ] `backend/app/extensions.py` — 建立 `db`、`migrate` 實例 — 避免循環 import
- [ ] `backend/app/models.py` — 照 `addendum.md` §2 實作全部資料表 — 唯一 schema 來源
- [ ] `backend/app/auth.py` — token 認證、角色守衛、價格遮蔽 — FR-1～FR-3
- [ ] `backend/app/services/audit.py` — AuditService 寫稽核軌跡 — FR-22
- [ ] `backend/app/services/stock.py` — StockService 單一寫入入口、負庫存檢查、樂觀鎖 — FR-6 與 §6
- [ ] `backend/app/services/documents.py` — 六種單據狀態機與作廢重開 — FR-20
- [ ] `backend/app/api/*.py` — 依 `api-contract.md` 實作全部端點 — FR-4～FR-23
- [ ] `backend/app/seed.py` — 依 `addendum.md` §5 產生種子資料與 6 個種子帳號 — SM-4
- [ ] `backend/migrations/` — 產生初始遷移 — 版本化 schema
- [ ] `backend/tests/test_api.py` — 核心流程與矩陣邊界案例測試 — 驗收方式
- [ ] `frontend/src/api.js` — 依契約實作 fetch 封裝 — 前後端協調
- [ ] `frontend/src/pages/*.jsx` — 12 個功能頁面 — FR-4～FR-23 的操作介面
- [ ] `frontend/vite.config.js` — dev proxy `/api` → `localhost:5000` — 單一 origin
- [ ] `start-dev.ps1`、`README.md` — 一鍵啟動與操作說明 — 可跑

**Acceptance Criteria:**
- Given 已啟動後端與前端，when 以 `warehouse1`/`demo1234` 登入，then 看到繁中後台選單且商品清單不含採購單價。
- Given 補貨建議清單有低於水位品項，when 帶入採購單並送單、另以主管帳號核准，then 產生 `PO-YYYYMMDD-序號` 單號。
- Given 已核准採購單，when 建進貨單送出，then 庫存現存數量增加、結存明細新增一筆、待收數量同步。
- Given 可用庫存 5 的商品，when 領用 10，then 回應 400 且訊息含目前可用庫存。
- Given 盤點進行中，when 對範圍內商品進貨，then 回應 400 且提示盤點單號。
- Given 採購單送單者本人呼叫核准，then 回應 400。
- Given 任一商品的現存數量，when 查詢結存明細加總，then 等於現存數量。
- Given 已作廢的銷貨單，then 庫存以反向明細沖銷且原明細仍在。

## Implementation Notes

- 決定：前端採 Vite + React 18 + react-router-dom + 原生 CSS，不引入 UI 庫或狀態管理庫（呼應使用者「不用太複雜」）。`addendum.md` §1.2 的待確認項以「最小可用」為準則定案。
- 決定：資料庫新增 `auth_tokens` 表存放登入權杖（附錄 §2 未列，為實作必要；權杖 30 分鐘閒置過期）。
- 決定：提供兩種啟動方式——`npm run dev`（Vite 5173，proxy 到 5000）與 `npm run build` 後由 Flask 直接 serve 靜態檔（單一 5000 port）。
- 決定：種子指令為 `flask seed --reset`（重建資料），對應 SM-4。
- 決定：`stock_ledger.id` 同時作為單調遞增序號（不再另設 seq 欄位），以避免 Alembic 序列物件的額外複雜度；交易回滾可能造成跳號，已於 PRD FR-13 註明可接受。
- 決定：移位寫**兩筆**結存明細（來源庫位減、目標庫位增），使各庫位分別加總皆可還原。PRD FR-12 與 `addendum.md` §2.2 已同步修正。
- 決定：額外補上附錄 §2.3 遺漏的 `issue_orders` / `issue_order_lines`（領用單）。
- 修正：前端回報的契約落差已補齊 — `GET /api/products?barcode=`、`GET /api/stocktakes/{id}`、`GET /api/users/roles`、`GET /api/receipts?from=&to=`。
- 修正：種子資料的「進行中／待核准」盤點原本以**類別**為範圍，會凍結整個類別使其他流程無法示範；改為單一庫位範圍。
- 驗證：`pytest tests -q` → 25 passed；`python scripts/smoke.py` 對實際執行中的伺服器 → 全數通過（含前端首頁載入）。

## Spec Change Log

## Review Triage Log

## Design Notes

分層依 `addendum.md` §3：Blueprint（Controller）→ Service（領域規則、交易邊界）→ Repository（SQLAlchemy）。前端不持有任何庫存數字，數字一律由後端回傳。

## Verification

**Commands:**
- `backend\.venv\Scripts\python -m pytest backend/tests -q` -- expected: 全數通過
- `cd backend && ..\.venv\Scripts\flask --app wsgi:app db upgrade` -- expected: 遷移套用成功
- `cd backend && ..\.venv\Scripts\flask --app wsgi:app seed --reset` -- expected: 種子資料建立成功
- `curl http://localhost:5000/api/auth/login -X POST -H "Content-Type: application/json" -d "{\"username\":\"warehouse1\",\"password\":\"demo1234\"}"` -- expected: 回 token
