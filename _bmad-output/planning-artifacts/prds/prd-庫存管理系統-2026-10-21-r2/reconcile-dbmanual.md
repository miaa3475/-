---
title: 輸入對帳報告 — 資料庫使用手冊 × PRD + Addendum
status: draft
created: 2026-10-21
primary_input: 資料庫使用手冊.md
secondary_inputs:
  - prd.md（PRD 庫存管理系統 r2）
  - addendum.md（Addendum r2）
---

# 輸入對帳報告：`資料庫使用手冊.md` × PRD r2 + Addendum r2

*對帳目的：確認 PRD 與附錄是否正確且完整地反映本機 PostgreSQL 環境事實，並找出依現有文件實作時會踩到的環境坑。*
*對帳來源版本：PRD r2（37 條 FR、§0–§11）、Addendum r2（§1–§8）、`資料庫使用手冊.md`（§1–§9）、`.env` / `.env.example` / `.gitignore`（實際檔案現況）。*

---

## (a) 環境事實對照表

| 手冊事實 | PRD/附錄對應位置 | 一致？ |
|---|---|---|
| §1 PostgreSQL **18.6**（Windows 64-bit） | PRD §0 開頭引言、§5 可維護性 `[ASSUMPTION]`、§11 假設索引第 8 條；Addendum §1.1「資料庫」列、§3 架構圖「PostgreSQL 18」 | ✅ 一致 |
| §1 安裝路徑 `C:\Program Files\PostgreSQL\18`、資料目錄 `...\18\data` | PRD／附錄均未提 | ⚠️ 需在「重置環境不得刪 data 目錄」的禁令中引用（見 G-12） |
| §1 服務名稱 `postgresql-x64-18`（啟動類型：自動） | PRD／附錄均未提 | ❌ 缺（環境前置檢查步驟無處著力，見 G-09） |
| §1 監聽 `localhost:5432`，`listen_addresses = '*'` | PRD／附錄均未寫 port；Addendum §1.1「部署」列反而要另起 PostgreSQL 容器 | ❌ 矛盾（見 C-01、C-13） |
| §1 `psql`／pgAdmin 4／Stack Builder 已裝、PATH 已加 | PRD／附錄均未提 | ✅ 不需反映（手冊 §6 已載排查法） |
| §2 資料庫名稱 **`Ailearn`**（大寫 A，PostgreSQL 名稱**區分大小寫**） | PRD §0（第 18 行）、§5 可維護性 `[ASSUMPTION]`、§11；Addendum §1.1「資料庫」列 | ⚠️ 名稱本身一致，但**大小寫敏感與 SQL 需加雙引號**的約束未進入任何需求文件（見 G-04） |
| §2 Owner = `postgres` | PRD／附錄均未提 | ❌ 缺（與 app_user 分離、遷移角色分工相關，見 G-02） |
| §2 編碼 **UTF8** | PRD／附錄均未提；僅 FR-36（`prd.md` 第 501 行）規定**匯出**檔為 UTF-8 含 BOM | ❌ 缺（匯入編碼未定義，見 G-05） |
| §2 Collate／Ctype = `Chinese (Traditional)_Taiwan.950` | PRD／附錄均未提 | ❌ 缺（中文排序／等值比對規則未定義，見 G-05） |
| §2 空資料庫、**0 個資料表**（schema 未設計） | PRD §0（第 18 行「`Ailearn` 為空 schema」）、§5 可維護性 `[ASSUMPTION]`、§11；Addendum §1.1「schema 為空可從零設計」、§2 開頭註「僅為起點草案」 | ✅ 一致（無「既有資料表」錯誤假設） |
| §3 帳號 `postgres`（**超級使用者**）、密碼 `12345678` | PRD／附錄**均無明文密碼**（正確）；但連線字串組法只存在於手冊 | ⚠️ 半一致（組法未進 PRD／附錄，見 G-01） |
| §3 密碼檔 `C:\Users\user\Desktop\web\sql密碼.txt` | `.gitignore` 含 `sql密碼.txt`（對專案內同名檔有效；實際檔在 `Desktop\web\` 專案外，本就不會被 commit） | ✅ 一致（註記：`.gitignore` 對該檔實際無作用，但無風險） |
| §3 認證 `scram-sha-256`（local／127.0.0.1／::1 皆 scram） | PRD／附錄均未提 | ❌ 缺（影響建立 app_user 與連線錯誤診斷，見 G-14） |
| §3「此密碼僅供本機開發練習；上線請改強密碼」 | PRD §5 資安只涵蓋**應用程式帳號**密碼雜湊，未涵蓋 DB 帳密層面 | ❌ 缺（見 G-13） |
| §4.1 連線字串 `postgresql://postgres:12345678@localhost:5432/Ailearn` | PRD §5 資安「連線字串僅存於環境變數，不寫入程式碼**或文件**」；`.env`（已存在，含 `DATABASE_URL`）與 `.env.example`（無真實密碼）已備妥，但 PRD／附錄**均未引用** | ❌ 缺 + ⚠️ 矛盾（見 G-01、C-02） |
| §4.2 `PGPASSWORD` 環境變數；§4.3 pgAdmin 註冊；§4.4 psycopg 3 範例用 `os.environ["DATABASE_URL"]` | Addendum §1.3 提及 psycopg 3 支援成熟，但未指定 SQLAlchemy 驅動與 URL scheme | ❌ 缺（`postgresql://` vs `postgresql+psycopg://`，見 G-10） |
| §5 `CREATE USER app_user ...` 建議建立**應用程式專屬帳號** | PRD §5 資安「**應用程式帳號使用資料庫最小權限**」（有承諾）；但無 FR／無可測試結果；Addendum 全篇**無 `app_user`**、§6 無建立步驟 | ❌ 缺（承諾未落地，見 G-02） |
| §5 `GRANT ALL PRIVILEGES ON DATABASE "Ailearn" TO app_user` | 無對應（PRD §5 資安要求「最小權限」） | ⚠️ 手冊範例本身既非最小權限、也不足以讓 app_user 讀寫 owner 為 `postgres` 的表（見 C-03） |
| §5 `CREATE DATABASE "新資料庫名"`（大寫需加引號） | 無對應 | ❌ 缺（併入 G-04） |
| §5 備份／還原：`pg_dump -Fc`、`pg_restore --clean --if-exists`、純 SQL 匯出 | PRD §5 可用性僅一句「每日自動備份資料庫」；Addendum §1.1／§5／§6／§8 全無備份機制 | ❌ 缺（見 G-06、G-07） |
| §6 疑難排解（大小寫、服務未啟、密碼錯、服務需重新註冊） | PRD §0 第 16、18 行提及手冊存在，但未說明「何時該翻」；Addendum 無任何指向手冊的指引 | ❌ 缺（見 G-09） |
| §7 雷 #1 勿重複執行 PostgreSQL 安裝程式 | Addendum §1.1「部署」列＋§8 風險緩解「Docker Compose 一鍵啟動」 | ⚠️ 矛盾（見 C-01） |
| §7 雷 #2 Stack Builder 只加外掛 | PRD／附錄無相關需求（不做 PostGIS 等） | ✅ 不需反映 |
| §7 雷 #3 勿刪／清空 `data` 目錄 | Addendum §5 種子資料重置 `flask seed --reset`、§6 未寫環境重置方式 | ❌ 缺（見 G-12） |
| §7 雷 #4 密碼檔純文字、勿提交 Git | `.gitignore` 已排除 `.env`、`sql密碼.txt`、`*.dump` ✅；但**未排除 `資料庫使用手冊.md`**（內含明文密碼與完整連線字串） | ⚠️ 半一致（見 G-11、C-02） |
| §7 雷 #5 本機環境、對外連線前評估防火牆與密碼強度 | PRD §5 資安未提 DB 層暴露面；`listen_addresses='*'` 代表區網可連 | ❌ 缺（見 G-13） |
| §8 專案根目錄 `C:\Users\user\Desktop\庫存管理系統`（尚未建立程式碼） | Addendum §6 第 1 堂起即建檔 | ✅ 一致 |
| §8「schema 從零設計；**設計前請先與使用者確認需求**」 | PRD §2.1–§2.3、§4.2–§4.6 已與使用者確認商品／供應商／進出貨／盤點等範圍 | ✅ 一致（需求確認已完成；Addendum §2 標為「起點草案」但未列待確認欄位，屬低優先） |
| §8「連線設定放 `.env`（已建立），變數名 `DATABASE_URL`，**勿把密碼寫死在程式碼中**」 | PRD §5 資安只有**禁令**；Addendum §1.1／§5／§6 皆無 `.env` 步驟 | ❌ 缺（最高風險，見 G-01） |
| §8「DB 名大小寫敏感，SQL 請寫 `"Ailearn"`」 | 無對應 | ❌ 缺（見 G-04） |
| §8 建議開發流程：schema → 建表 → 種子資料 → API／介面；migration 工具「如 Prisma / Flyway / **Alembic**」 | Addendum §1.1「遷移」列＝**Flask-Migrate（內建 Alembic）**、§2 開頭「以 Alembic 遷移腳本為準」、§6 步驟 1 `flask db init/migrate/upgrade` ＋種子 | ✅ 一致，且與使用者指定（Flask-Migrate／Alembic）相符；Alembic 亦在手冊建議清單內 |
| §8「**修改 schema 前先備份**：`pg_dump … -Fc -f backup.dump`」 | Addendum §6 第 1 堂即進行 schema 變更（`flask db init/migrate/upgrade`），流程無備份步驟 | ❌ 缺 + ⚠️ 矛盾（見 C-04） |
| §9 快速開始（`psql` + `PGPASSWORD`） | PRD／附錄不需要 | ✅ 不需反映 |

---

## (b) 缺口清單

> 等級：**高**＝照文件實作即會違規或做錯；**中**＝會造成困惑／返工／教學失敗；**低**＝完整性補齊。

| ID | 等級 | 缺口 | 影響 |
|---|---|---|---|
| **G-01** | 高 | **連線設定的「正面程序」缺失**：PRD 與附錄全文未出現 `.env`、`.env.example`、`DATABASE_URL` 任何一處。PRD §5 資安只有禁令（「連線字串僅存於環境變數，不寫入程式碼」），Addendum §6 第 1 堂卻直接要學生執行 `flask db init` / `flask db migrate`，全程沒有「設定連線」步驟 | 依文件實作，開發者極可能把 `postgresql://postgres:<密碼>@localhost:5432/Ailearn` 直接寫進 `config.py`、`docker-compose.yml`、README 或課堂投影片——正好違反 PRD §5 資安與手冊 §8「勿把密碼寫死在程式碼中」。這是本次對帳中**最可能被實際引入明文密碼**的缺口 |
| **G-02** | 高 | **DB 使用者分離未落地**：PRD §5 資安確實承諾「應用程式帳號使用資料庫最小權限」，但 (1) PRD 沒有對應 FR 或可測試結果（無法驗收）；(2) Addendum 全篇未出現 `app_user`，無建立步驟、無 GRANT 清單；(3) 未區分「遷移／DDL 用 `postgres`」與「應用程式執行用 `app_user`」 | 實作者會直接用超級使用者 `postgres` 跑整個應用，PRD §5 的資安承諾形同虛設；`stock_ledger` 附錄模型（禁止 UPDATE／DELETE）也失去資料庫層保護 |
| **G-03** | 高 | **手冊建議的權限集本身不足**：手冊 §5 只給 `GRANT ALL PRIVILEGES ON DATABASE "Ailearn" TO app_user`。這 (a) 不是最小權限（額外給了 CREATE／TEMPORARY）；(b) 也**不足以**讓 app_user 讀寫由 `postgres` 擁有、位於 `public` schema 的表——資料庫層 GRANT 不含表級 DML 權限，必須另給 `GRANT … ON ALL TABLES IN SCHEMA public` 與 `ALTER DEFAULT PRIVILEGES`（供 Alembic 後續新建的表） | 照抄手冊會得到「權限過大 + 仍然連不上表」的雙重問題，學生會卡在第 1 堂 |
| **G-04** | 中 | **DB 名大小寫敏感 / SQL 需加雙引號的約束未進任何需求文件**：手冊 §2、§6、§8 三處特別強調，PRD §0／§5／§11 與 Addendum §1.1 只寫 `Ailearn` | 若有人寫 `CREATE DATABASE Ailearn`（無引號），PostgreSQL 會建成 `ailearn`，而 `DATABASE_URL` 指向 `Ailearn` 立即報手冊 §6 收錄的 `database "Ailearn" does not exist`；複製一個 DB 做實驗時尤易發生 |
| **G-05** | 中 | **編碼與排序規則未定義**：DB 為 UTF8 + `Chinese (Traditional)_Taiwan.950`，但 PRD FR-35（第 492–498 行）只說「以 CSV 或 Excel 匯入」，未指定匯入檔的編碼與 BOM 處理；FR-36（第 500–506 行）卻固定「UTF-8 含 BOM」 | Windows 上 Python 預設 `cp950`，若匯入端預設編碼、匯出端固定 UTF-8-BOM，「匯出→再匯入」往返會炸掉；中文 `ORDER BY` 排序與 FR-4 名稱重複檢核、FR-32 查詢排序的等值語意也未定義，結果不可預期 |
| **G-06** | 中 | **備份只有一句話**：PRD §5 可用性「每日自動備份資料庫」未指定格式、目的地、保留期、還原驗證；手冊 §5 明明已備妥 `pg_dump -Fc`／`pg_restore` 程序，Addendum §1.1／§5／§6／§8 完全沒有備份機制 | 「每日自動備份」在教學環境不可驗收（誰排程？檔案放哪？還原過嗎？）；`research-landscape.md` 第 414 行的業界基準（保留 30 天、備份須可還原驗證、離機一份）也未對齊 |
| **G-07** | 中 | **還原程序的破壞性未被定義**：手冊 §5 的 `pg_restore --clean --if-exists` 會 DROP 現有物件 | 若學生在有資料的課堂環境執行還原，表會被清掉重建，而 PRD／Addendum 未說明「還原後如何回到可示範狀態」；`.gitignore` 已排除 `*.dump` ✅ 但備份檔放專案內仍會被誤當成果物 |
| **G-08** | 中 | **部署敘述與既有環境衝突**：Addendum §1.1「部署」列為 Docker Compose（前端 + 後端 + **PostgreSQL**），§8 風險緩解亦寫「Docker Compose 一鍵啟動」 | 與 PRD §5／§11「使用本機既有 PostgreSQL 18.6 環境 `Ailearn`」直接衝突；且容器 PG 預設映射 5432，會與手冊 §1 的本機服務搶埠（`port is already allocated`）；容器內的 PG 是另一個實例、另一組帳密、預設 `postgres` 庫，`Ailearn` 需另外用引號建立 |
| **G-09** | 中 | **環境前置檢查與手冊指引的指向缺失**：Addendum §6 沒有「確認 `postgresql-x64-18` 服務啟動 / `pg_isready -h localhost -p 5432`」步驟；PRD §0 只說手冊存在，未說明何時該翻 | 第 1 堂 `flask db init` 失敗時，學生不知道要去看 `資料庫使用手冊.md` §6，會誤判為「環境壞掉」 |
| **G-10** | 中 | **SQLAlchemy 驅動與 URL scheme 未釘死**：手冊 §4.4 的 Python 範例用 psycopg 3；Addendum §1.1 只寫「SQLAlchemy 2.x」 | SQLAlchemy 2.x 的 `postgresql://` 預設走 **psycopg2**，psycopg 3 必須寫 `postgresql+psycopg://`。而 `.env.example` 現值正是 `postgresql://…` → 照抄 `.env.example` + 照手冊裝 psycopg3，第一次連線就會拋 psycopg2 缺件錯誤 |
| **G-11** | 低 | **憑證保護不完整**：`.gitignore` 已排除 `.env`、`.env.*`（保留 `.env.example`）、`sql密碼.txt`、`*.dump`／`*.backup`，但**未排除 `資料庫使用手冊.md`**，而該檔含明文密碼 `12345678` 與完整連線字串 | 專案一旦 `git init`，手冊會把明文憑證帶進版控；與手冊 §7 雷 #4「不要提交到 Git」的意圖相違 |
| **G-12** | 低 | **手冊踩雷未轉成環境操作禁令**：手冊 §7 雷 #1（勿重裝 PostgreSQL）、#3（勿刪 data 目錄）未出現在任何文件 | 學生重建環境時最常做的正是「刪掉重來」；應明講重置路徑＝`flask db downgrade base` + `flask seed --reset` |
| **G-13** | 低 | **DB 層暴露面與弱密碼未反映**：手冊 §3、§7.5 提醒本機練習密碼、外連前須評估防火牆；`listen_addresses='*'` 使 PG 對區網可連 | PRD §5 資安只寫應用程式層，DB 層的風險與「上線前改強密碼」步驟缺席 |
| **G-14** | 低 | **認證方式 `scram-sha-256` 未反映**：影響建立 `app_user` 時的密碼設定方式與「password authentication failed」的診斷說法 | 診斷文件與實際環境不一致 |
| **G-15** | 低 | **應用程式帳號 vs DB 帳號未區分**：Addendum §5 種子資料只說「4 個種子帳號，密碼統一為課堂指定值」，未說明那是**應用程式登入帳號** | 易與 DB 帳密（`postgres`／`app_user`）混淆，種出來的帳號也不會被誤當成 DB 帳號 |
| **G-16** | 低 | **備份要求低於既有研究基準**：`research-landscape.md` 第 414 行列「保留 30 天、備份須可還原驗證、至少一份離機／異地」，PRD §5 只寫「每日自動備份」 | 需求文件中間的期望值不一致 |

---

## (c) 矛盾清單

| ID | 等級 | 矛盾內容 |
|---|---|---|
| **C-01** | 高 | **資料庫實例打架**：PRD §5 可維護性 `[ASSUMPTION]` 與 §11 假設索引第 8 條明講「資料庫使用**本機既有** PostgreSQL 18.6 環境 `Ailearn`」；Addendum §1.1「部署」列卻是 Docker Compose（前端 + 後端 + **PostgreSQL**），§8 風險緩解再寫「Docker Compose 一鍵啟動」。同一份 Addendum §1.1「資料庫」列也說「本機既有 `Ailearn`」——同一張表內自相矛盾。結果是資料庫有兩個可能來源：`DATABASE_URL` 該指向本機服務（5432 已被 `postgresql-x64-18` 占用，容器 PG 起不來）還是容器（另需引號建立 `"Ailearn"`、另設密碼） |
| **C-02** | 高 | **PRD 的資安禁令與它自己引用的輸入檔直接衝突**：PRD §5 資安寫「連線字串僅存於環境變數，不寫入程式碼**或文件**」；但 PRD §0 第 16／18 行把 `資料庫使用手冊.md` 列為主要輸入，該檔 §3／§4.1 正載著明文密碼 `12345678` 與完整連線字串，且 `.gitignore` 未排除它 |
| **C-03** | 中 | **「最小權限」承諾 vs 手冊的權限建議**：PRD §5 資安承諾「應用程式帳號使用資料庫最小權限」；手冊 §5 的現成範例是 `GRANT ALL PRIVILEGES ON DATABASE "Ailearn" TO app_user`（額外含 CREATE／TEMPORARY，且不含表級權限）。照手冊抄會同時「過權限」且「不足」——兩頭都違反／落空 PRD 的承諾 |
| **C-04** | 中 | **開發順序違反手冊 §8 的備份規則**：手冊 §8 最後一條要求「修改 schema 前先備份」；Addendum §6 第 1 堂的核心動作就是 `flask db init` / `flask db migrate` / `flask db upgrade`（schema 變更），全程無備份步驟。依附錄執行＝違反手冊明文規則 |
| **C-05** | 低 | **手冊的 schema 流程 vs 附錄的課次切分**：手冊 §8 建議「先定義 schema → 建表 → 種子 → API/介面」（核心 schema 一次到位）；Addendum §6 把核心 `stock_ledger`／`stock_balances` 延到第 4 堂才建 | 不致錯，但後續堂次若需改 schema，備份與遷移規則更易被忽略；建議在第 1 堂明講「每堂開工前先備份」 |
| **C-06** | 低 | **編碼契約兩端不一致**：PRD FR-36（第 501 行）規定匯出 UTF-8 含 BOM；FR-35（第 492–498 行）匯入未指定編碼。環境為 Windows + DB UTF8 + `Chinese (Traditional)_Taiwan.950`，匯出→匯入往返不保證成功 |

> **附帶觀察（超出本手冊對照範圍，僅供參考）**：PRD FR-16（§4.5）稱「調出後調出倉庫存數量減少，調入倉增加在途庫存」，Addendum §2.2 註記則稱「在途庫存另計於 `transfers`，**不落在** `stock_balances.on_hand`」。兩者可調和（`stock_balances` 不記在途），但「調出倉 on_hand 減少後，該筆數量在 `stock_balances` 之外」的存放位置未寫明，會影響 FR-22 建議採購量計算與 FR-16 可測試結果的驗算基準。建議在 Addendum §2.2 補一句說明。

---

## (d) 建議的最小修補

> 目標：不重寫 PRD／附錄，只補上讓「照文件實作」不會違規、不會踩坑的最小文字。下列編號沿用上表 ID。

### D-1　PRD §5「資安」列改寫（1 行，對應 G-01、G-02、C-02、C-03、G-13）

> 現行（`prd.md` 第 522 行）：
> `- **資安** — 密碼以不可逆雜湊儲存；API 以 token 認證；應用程式帳號使用資料庫最小權限；連線字串僅存於環境變數，不寫入程式碼或文件。`
>
> 建議：
> `- **資安** — 密碼以不可逆雜湊儲存；API 以 token 認證；**應用程式以專屬 DB 帳號 `app_user` 連線（最小權限：CONNECT ＋ `public` schema USAGE ＋ 業務表 DML；DDL／遷移保留給 `postgres`）**；連線字串僅存於環境變數（既有 `.env` 的 `DATABASE_URL`，格式見 `.env.example`），不寫入程式碼或文件——`資料庫使用手冊.md` 為本機開發用途之唯一例外，且不得提交含真實密碼的版本。**[ASSUMPTION: DB 層帳號分離（`app_user` vs `postgres`）為 v1 要求，於 Addendum §2.6 落地]`

### D-2　PRD §5「可用性」列補一句（對應 G-06、G-07）

> 現行（第 521 行）：`…；每日自動備份資料庫。[ASSUMPTION: …]`
>
> 建議追加：
> `；每日自動備份資料庫（`pg_dump -U postgres -h localhost -d Ailearn -Fc -f Ailearn_backup.dump`，檔案不得進版控、不得放在 `C:\Program Files\PostgreSQL\18\data` 內，保留 7 天，且須實際還原驗證一次）；**修改 schema 前先備份**（程序見 `資料庫使用手冊.md` §5、§8）。`

### D-3　PRD §5「可維護性」`[ASSUMPTION]` 與 §11 假設索引第 8 條同步（對應 G-04、G-05、C-01）

> 建議文字（兩處同文）：
> `資料庫使用本機既有 PostgreSQL 18.6 服務 `postgresql-x64-18`（localhost:5432）上的資料庫 `Ailearn`——**名稱大小寫敏感、SQL 中須以雙引號引用 `"Ailearn"`**、編碼 UTF8、排序規則 `Chinese (Traditional)_Taiwan.950`；schema 由 v1 從零設計，遷移以 Alembic（Flask-Migrate）版本化；**不另建 Docker PostgreSQL 實例**，避免與本機 5432 搶埠。`

### D-4　Addendum §1.1 技術棧表增列與改列（對應 G-01、G-02、G-10、C-01）

| 層 | 選型 | 理由 |
| --- | --- | --- |
| 前端 | （不動） | |
| 後端 | （不動） | |
| 資料庫 | PostgreSQL 18.6（本機既有 `Ailearn`） | （不動） |
| **連線設定** | **既有 `.env` 的 `DATABASE_URL`（範例見 `.env.example`，`.env` 已被 `.gitignore` 排除）** | 手冊 §8 已建立 `.env`；PRD §5 資安要求連線字串不得寫入程式碼 |
| **DB 帳號** | **應用程式：`app_user`（最小權限）；遷移／DDL：`postgres`** | 手冊 §5 建議建立 `app_user`；PRD §5 資安要求最小權限 |
| **遷移** | **Flask-Migrate（內建 Alembic）** | （不動；已與手冊 §8 建議清單及使用者指示一致） |
| **驅動** | **psycopg 3（URL 須寫 `postgresql+psycopg://`）** | 手冊 §4.4 Python 範例用 psycopg 3；SQLAlchemy 2.x 的 `postgresql://` 預設走 psycopg2 |
| **部署** | **Docker Compose（前端 + 後端）；資料庫沿用本機 PostgreSQL 18.6 服務與 `Ailearn` 實例，不另起 PG 容器** | 避免與本機 5432 搶埠；維持 PRD §5／§11「使用本機既有環境」 |

### D-5　Addendum 新增 §2.6「資料庫連線與權限設定（一次性）」（對應 G-01、G-02、G-03、G-10）

```powershell
# 0. 環境前置（手冊 §1、§6）
Get-Service postgresql-x64-18
pg_isready -h localhost -p 5432          # 期望：localhost:5432 - accepting connections

# 1. 連線設定（複製範例檔，勿把真實密碼寫進任何被版控的檔案）
copy .env.example .env                    # DATABASE_URL=postgresql+psycopg://<user>:<pwd>@localhost:5432/Ailearn
```
```sql
-- 2. 建立最小權限應用程式帳號（密碼另行指定，勿沿用手冊 §3 的練習密碼）
CREATE USER app_user WITH PASSWORD '由使用者指定';
GRANT CONNECT ON DATABASE "Ailearn" TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
```
> 應用程式連線：`postgresql+psycopg://app_user:<pwd>@localhost:5432/Ailearn`
> 遷移（Flask-Migrate / `flask db upgrade`）連線：`postgresql+psycopg://postgres:<pwd>@localhost:5432/Ailearn`
> 所有 SQL 中的 `Ailearn` 必須加雙引號；新建資料庫亦同（`CREATE DATABASE "Ailearn"`）。

### D-6　Addendum §6 開發順序改為 8 步（對應 G-04、G-06、G-09、G-12、C-04、C-05）

> **第 0 堂（新增，環境前置）**：確認 `postgresql-x64-18` 服務啟動 → `pg_isready` → `copy .env.example .env` → 確認 `DATABASE_URL` 的庫名為 `Ailearn`（大寫 A）與 URL scheme；建立 `app_user`（D-5）。連線失敗一律先查 `資料庫使用手冊.md` §6 疑難排解。
> **每堂開工前（新增）**：`pg_dump -U postgres -h localhost -d Ailearn -Fc -f backup.dump`（備份檔不得進版控）。
> **第 1 堂（原第 1 堂）**：schema（users、roles、products、warehouses、locations）＋ Flask-Migrate 遷移（`flask db init` / `migrate` / `upgrade`，以 `postgres` 連線）＋ 種子資料。
> **第 2～7 堂**：不變（登入與角色 → 商品與供應商 → 庫存異動引擎 → 採購與安全水位 → 盤點與稽核 → 銷貨與報表）。
> **新增附注**：環境重置請用 `flask db downgrade base` + `flask seed --reset`（目標 ≤ 30 秒，SM-4）；**勿重複安裝 PostgreSQL、勿刪除或清空 `C:\Program Files\PostgreSQL\18\data`**（手冊 §7 踩過的雷 #1／#3）；還原請注意手冊 §5 的 `pg_restore --clean --if-exists` 會 DROP 現有物件。

### D-7　PRD FR-35 匯入編碼補一句（對應 G-05、C-06）

> 在 FR-35 可測試結果補一條：`匯入檔編碼支援 UTF-8（含 BOM）與 Windows Excel 預設之 cp950/Big5；匯出（FR-36）與匯入的編碼皆為 UTF-8 含 BOM，往返匯出→匯入資料不得失真。`
> 另在 PRD §6「資料完整性與業務規則約束」增一條：`中文排序與等值比對以資料庫排序規則 `Chinese (Traditional)_Taiwan.950` 為準；FR-4 名稱重複檢核與 FR-32 查詢排序依此規則判定。`

### D-8　`.gitignore` 補一行（對應 G-11、C-02）

```
# 含明文密碼與完整連線字串的本機環境手冊
資料庫使用手冊.md
```
> 或改以遮蔽版入库（把 `12345678` 換成 `<你的密碼>`），其餘內容維持不變。

### D-9　Addendum §8 已知風險增列（對應 C-01、G-08）

| 風險 | 影響 | 緩解 |
| --- | --- | --- |
| 本機 5432 已被 `postgresql-x64-18` 占用，Docker PostgreSQL 容器無法啟動 | 高 | 資料庫沿用本機服務、不在 compose 中起 PG；若堅持容器化則映射 5433 並重建 `"Ailearn"`（需引號） |

### D-10　PRD §0 補一句「手冊的使用時機」（對應 G-09）

> 在 `prd.md` 第 16 行後補：`實作期間遇到連線、權限、備份、服務啟停問題時，一律回到 `資料庫使用手冊.md`（§5 常用操作與備份／還原、§6 疑難排解、§8 給 AI 協作的備註）查證，不要自行更動本機 PostgreSQL 安裝。`

---

## 對帳結論

| 面向 | 結論 |
|---|---|
| **名稱／版本／空 schema** | ✅ PRD §0／§5／§11 與 Addendum §1.1 對 `PostgreSQL 18.6`、資料庫 `Ailearn`、空 schema 的描述**正確**，無錯字、無「假設既有資料表」的錯誤 |
| **遷移工具** | ✅ Addendum §1.1／§2／§6 一致採 Flask-Migrate（內建 Alembic），與使用者指示一致，也落在手冊 §8 的建議清單（Alembic）內，**無矛盾** |
| **開發順序** | ✅ Addendum §6 的 schema → 表 → 種子 → API/介面**符合**手冊 §8 的建議流程；僅缺備份與環境前置兩步（D-6） |
| **資安／憑證** | ⚠️ PRD §5 資安的**方向正確**（雜湊、token、最小權限、連線字串不寫死），但**全部停留在禁令層、沒有正面程序**，導致最可能被實作引入明文密碼（G-01）；且與手冊 §3／§4.1 的文件內明文密碼互相牴觸（C-02） |
| **使用者分離** | ⚠️ PRD §5 資安**確實有承諾**「應用程式帳號使用資料庫最小權限」，但無 FR、無可測試結果、Addendum 無 `app_user`、手冊的權限範例本身既過寬又不足（G-02、G-03、C-03） |
| **備份／還原** | ⚠️ PRD §5 有「每日自動備份」但無機制、無格式、無保留期、無還原驗證，且未引用手冊 §5 的既有程序；手冊 §8 的「改 schema 前先備份」在 Addendum §6 完全沒有對應步驟（G-06、G-07、C-04） |
| **大小寫／編碼／排序規則** | ❌ 手冊三處強調的大小寫與引號規則、UTF8 與繁中排序規則**全部未進入 PRD／附錄**（G-04、G-05） |
| **踩過的雷** | ❌ 雷 #1／#3（勿重裝、勿刪 data 目錄）未轉成環境操作禁令；雷 #4 對應的 `.gitignore` 只做到一半（`.env` ✅、手冊本身 ❌，G-11、G-12） |
| **整體** | **可實作，但有 3 個高風險缺口（G-01／G-02／G-03）與 2 個高風險矛盾（C-01／C-02）必須在進入實作前修補**；其餘 12 項缺口屬文件完整性，可在實作前一次補齊（D-1～D-10） |
