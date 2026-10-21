# 庫存管理系統（倉管與採購端）

課程專題的進銷存後台。**React 前端 + Flask 後端 + PostgreSQL 18.6**。

> 需求基準：`_bmad-output/planning-artifacts/prds/prd-庫存管理系統-2026-10-21-r2/prd.md`（23 條功能需求）
> 技術細節：同目錄 `addendum.md`　｜　API 契約：`_bmad-output/implementation-artifacts/api-contract.md`

---

## 一、快速開始

### 首次設定

```powershell
# 1. Python 環境與依賴
uv venv .venv --python 3.12
uv pip install --python .venv\Scripts\python.exe -r backend\requirements.txt

# 2. 前端依賴
cd frontend; npm install; cd ..

# 3. 確認 PostgreSQL 服務在跑
Get-Service postgresql-x64-18
```

資料庫連線寫在根目錄 `.env`（已存在，勿提交版控）：

```
DATABASE_URL=postgresql+psycopg://postgres:12345678@localhost:5432/Ailearn
```

> 注意 scheme 必須是 `postgresql+psycopg://`（psycopg 3 驅動）。資料庫名 `Ailearn` **大小寫敏感**。

### 建立資料表與種子資料

```powershell
cd backend
..\.venv\Scripts\flask --app wsgi:app db upgrade
..\.venv\Scripts\flask --app wsgi:app seed --reset
```

`seed --reset` 會清空並重建種子資料（200 商品、27 庫位、15 供應商、8 張採購單…），執行時間 < 30 秒。

### 啟動

| 模式 | 指令 | 網址 |
|---|---|---|
| 單一 port（建議） | `.\start.ps1` | http://127.0.0.1:5000 |
| 開發模式（熱更新） | `.\start-dev.ps1` | http://127.0.0.1:5173 |

### 登入

| 帳號 | 密碼 | 角色 | 能做什麼 |
|---|---|---|---|
| `warehouse1` / `warehouse2` | `demo1234` | 倉管 | 商品、庫位、進貨、領用、移位、盤點、庫存調整（**看不到採購單價**） |
| `purchase1` / `purchase2` | `demo1234` | 採購 | 商品、供應商、報價、採購單、補貨建議 |
| `admin1` / `admin2` | `demo1234` | 主管 | 全部功能，含盤點差異核准、採購單核准、單據作廢 |

---

## 二、目錄結構

```
庫存管理系統/
├── .env                        # 連線字串（勿提交）
├── start.ps1                   # 單一 port 啟動
├── start-dev.ps1               # 開發模式啟動
├── backend/
│   ├── app/
│   │   ├── __init__.py         # create_app 工廠、CORS、錯誤處理、靜態前端掛載
│   │   ├── config.py           # .env 載入
│   │   ├── extensions.py       # db / migrate 實例
│   │   ├── models.py           # 28 張資料表
│   │   ├── auth.py             # token 認證、角色守衛、價格遮蔽
│   │   ├── serializers.py      # JSON 形狀與數字格式
│   │   ├── seed.py             # 種子資料 + `flask seed` CLI
│   │   ├── services/
│   │   │   ├── stock.py        # StockService：庫存數量唯一寫入入口
│   │   │   ├── audit.py        # AuditService：稽核軌跡寫入
│   │   │   └── documents.py    # 六種單據的狀態機
│   │   └── api/                # REST 端點（auth / master / stock / stocktakes /
│   │                           #   purchasing / sales / audit / reports / users / dev）
│   ├── migrations/             # Flask-Migrate（Alembic）
│   ├── scripts/smoke.py        # 端到端煙霧測試
│   ├── tests/                  # pytest
│   └── wsgi.py                 # 進入點
└── frontend/
    ├── src/api.js              # fetch 封裝（含 Bearer token 與 401 導回登入）
    ├── src/auth.jsx            # AuthContext
    ├── src/components/         # Layout、ui
    ├── src/pages/              # 19 個功能頁面
    └── dist/                   # 建置產物（單一 port 模式由 Flask 提供）
```

---

## 三、分層與核心規則

```
瀏覽器 (React SPA)  ──REST/JSON──▶  Blueprint（Controller：路由、參數、權限）
                                            │
                                            ▼
                                    Service（領域規則、狀態機、交易邊界）
                                            │
                                            ▼
                                    Repository（SQLAlchemy）
                                            │
                                            ▼
                            PostgreSQL 18（stock_ledger / stock_balances / 單據 / 稽核）
```

四條不可放寬的規則（來自 PRD §6）：

1. **單一寫入入口** — 任何庫存數量變動只能經過 `StockService.apply()`；路由不得直接改 `stock_balances.on_hand`。
2. **結存明細不可變** — `stock_ledger` 僅追加；作廢以**反向明細沖銷**，不刪不改既有資料。
3. **負庫存預設禁止** — 出庫前檢查可用庫存，不足則拒絕；主管放行需填原因並留稽核紀錄。
4. **成本不外洩** — 採購單價對倉管角色遮蔽，在**序列化層**完成，前端不做判斷。

可用庫存 = 現存數量（v1 沒有訂單預留機制）。

---

## 四、測試

```powershell
# 單元 / API 測試（使用獨立資料庫 ailearn_test）
cd backend
..\.venv\Scripts\python -m pytest tests -q

# 端到端煙霧測試（需先啟動伺服器）
..\.venv\Scripts\python scripts\smoke.py
```

測試涵蓋：登入與 401/403、價格遮蔽、商品建檔與條碼唯一、進貨與結存明細、批次必填、領用超量拒絕、用途不得為銷貨、移位守恆、凍結庫位拒絕、**結存明細加總 = 現存數量**、採購單第二人覆核、補貨建議、盤點凍結阻擋、盤點提交與核准、銷貨扣減、作廢回滾、稽核軌跡。

---

## 五、API 速查

| 用途 | 方法與路徑 |
|---|---|
| 登入 | `POST /api/auth/login` |
| 商品 | `GET/POST /api/products`、`PUT /api/products/{id}` |
| 供應商／報價 | `GET/POST /api/suppliers`、`GET/POST /api/quotes` |
| 庫位 | `GET /api/locations`、`GET /api/locations/tree` |
| 庫存查詢 | `GET /api/stock?q=&barcode=&location_id=` |
| 結存明細 | `GET /api/stock/ledger?product_id=&location_id=&from=&to=` |
| 進貨 | `GET/POST /api/receipts`、`POST /api/receipts/{id}/void` |
| 領用 | `GET/POST /api/issues`、`POST /api/issues/{id}/void` |
| 移位 | `POST /api/stock/moves` |
| 庫存調整 | `GET/POST /api/adjustments`、`POST /api/adjustments/{id}/submit\|approve` |
| 盤點 | `GET/POST /api/stocktakes`、`PUT /api/stocktakes/{id}/lines`、`POST /api/stocktakes/{id}/submit\|approve\|abort` |
| 補貨建議 | `GET /api/purchase/replenishment` |
| 採購單 | `GET/POST /api/purchase/orders`、`POST /api/purchase/orders/{id}/submit\|approve\|reject\|void` |
| 銷貨單 | `GET/POST /api/sales/orders`、`POST /api/sales/orders/{id}/void` |
| 稽核 | `GET /api/audit` |
| 彙總報表 | `GET /api/reports/summary?from=&to=` |
| 重置種子 | `POST /api/dev/seed` |

完整欄位定義見 `_bmad-output/implementation-artifacts/api-contract.md`。

---

## 六、已知限制（v1 不做）

毛利與定價、跨倉調撥與在途、序號商品、CSV 匯入匯出、儀表板、訂單預留、離線盤點。
詳見 PRD 第 7 節非目標。

> **提醒**：課題簡報第 12 頁要求的「毛利、折扣、組合商品、建議售價、跨倉調貨單」**五項都不在 v1**。
> 若課程評分要求涵蓋該頁，見 PRD 第 7 節 `[NOTE FOR PM]` 與第 10 節開放問題第 1 點。
