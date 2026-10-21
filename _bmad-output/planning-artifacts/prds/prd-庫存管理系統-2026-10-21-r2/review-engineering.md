# 工程實作可行性審查：庫存管理系統 PRD（r2）

*審查者角色：資深工程師／實作可行性與規格完整性
*審查對象：`prd.md`（37 條 FR）＋ `addendum.md`（資料表草案 §2）
*技術棧（既定，不重新討論）：React + Flask + SQLAlchemy + Flask-Migrate + PostgreSQL 18.6（`Ailearn`）
*交付定位：教學專題、單機、課程時程內可運作之最小實作成品
*審查日期：2026-10-21

---

## 摘要

| 嚴重度 | 數量 | 說明 |
| --- | --- | --- |
| 阻斷（Blocker） | 14 | 不補齊會直接做出「錯誤的東西」，或示範劇本（SM-1）跑不動 |
| 高（High） | 17 | 會造成兩位開發者做出不同行為，或在課程時程內爆掉 |
| 中（Medium） | 14 | 明確但可補，可用一句話規格化 |
| 低（Low） | 5 | 打磨項，影響體驗與可讀性，不影響正確性 |
| **小計（a+b+c+e 的具名發現）** | **50** | A1–A14（14）、B1–B18（18）、C1–C8（8）、E1–E10（10） |
| (d) 可一句話補上的規格 | 59 句 | 涵蓋 FR-1～FR-37 全部 37 條 + 2 條全域條款 |

**三個最致命的一句話結論**：
1. 單據狀態機（FR-27）只有一套「共用列舉」，但六種單據實際上有六套不同的生命週期 → 幾乎所有單據流程都會被做錯。
2. 「結存明細可還原全部庫存數字」（FR-13 / SM-3）與「在途庫存不落在 `stock_ledger`」（addendum §2.2）直接互斥；在途數量沒有任何可加總還原的來源。
3. FR-21 要求「依商品／類別／倉庫」設安全水位，但 schema 沒有任何地方可以存類別層與倉庫層的設定，FR-22 的補貨建議清單在資料模型上根本跑不出來。

---

## (a) 阻斷性規格缺口

> 定義：依現有文件實作，會做出與出題者意圖不同的系統，或示範劇本（SM-1）無法完成。

### A1 [阻斷] FR-27 的「共用 status 列舉」與六種單據的實際生命週期不符
**證據**：PRD FR-27「狀態僅能依序流轉：草稿 → 待核准 → 已核准；任一單據可轉為已作廢」；addendum §2.3 給出 `DRAFT → PENDING_APPROVAL → APPROVED → VOIDED / REJECTED` 為「`status` 欄位共用的列舉」。但：
- FR-11 進貨單「送出後立即產生庫存異動」、送出即不可編輯 → 進貨單**沒有**待核准與核准環節，狀態應為 `DRAFT → POSTED`（或送出即 `APPROVED`），而 FR-27 要求它走 DRAFT→PENDING_APPROVAL→APPROVED。
- FR-16 調撥單有「已出貨／在途／調入確認」三態（addendum §2.2 出現 `status = IN_TRANSIT`），但不在共用列舉內。
- FR-17 盤點單有「進行中／已提交」態（`stocktake_lines` 可續做、`stocktakes.submitted_at`），FR-27 未列。
- FR-28 提到「已送出的單據」→ 隱含存在 `SENT` 狀態，但列舉中沒有。
- `adjustments` 有 `requested_by` / `approved_by` → 需要 DRAFT→PENDING_APPROVAL→APPROVED，但 FR-20 的調整由盤點核准自動產生，等於「核准即成立」，其狀態語意未定義。

**兩位開發者會分歧在哪**：有人會照 FR-27 讓進貨單也走待核准（多一輪不存在的審核，與 FR-11「送出即入庫」直接衝突）；有人會在 `status` 上塞 `IN_TRANSIT`、`SHIPPED`、`POSTED` 等未定義值，導致 FR-33 彙總與 FR-27 驗收對不上。

**修法**：以「逐單據狀態轉移表」取代共用列舉，至少包含：單據類型 × 狀態 × 允許的下一狀態 × 觸發角色 × 是否產生 ledger × 是否解鎖凍結。並明文列舉：
```
purchase_orders : DRAFT → PENDING_APPROVAL → APPROVED | REJECTED → VOIDED
goods_receipts  : DRAFT → POSTED → VOIDED
sales_orders    : DRAFT → POSTED → VOIDED
transfers       : DRAFT → SHIPPED(IN_TRANSIT) → RECEIVED → CLOSED ; DRAFT/SHIPPED → VOIDED
stocktakes      : IN_PROGRESS → SUBMITTED → APPROVED | REJECTED ; IN_PROGRESS → ABORTED
adjustments     : DRAFT → PENDING_APPROVAL → APPROVED | VOIDED
```
並註明 VOIDED 不可回退（addendum §2.3 已有該句，應升格到 PRD）。

---

### A2 [阻斷] FR-28 的「作廢重開」在 schema 中沒有任何欄位可以承載關聯
**證據**：FR-28「作廢已核准或已送出的單據並重開一張新單，保留原單與新單的關聯」、可測試結果「重開的新單引用原單號」。addendum §2.3 的六張單據表**沒有任何一張有 `reopened_from_id` / `parent_doc_id` / `void_of_id`**。
**修法**：六張單據表各加 `reopened_from_id`（self-FK，nullable）、`reopen_reason`（text）、`voided_by` / `voided_at`；並定義「引用原單號」的呈現規則（新單 `xxx` 欄位顯示「重開自 PO-20261021-0003」）。

---

### A3 [阻斷] FR-28 沒有定義「什麼情況下不得作廢」，連鎖回滾會產生負庫存
**證據**：FR-28 只給出兩條回滾規則（銷貨、調撥），完全沒有進貨單、採購單、盤點單、庫存調整的作廢規則。已核准的進貨單若已被領用／銷貨／納入盤點，作廢它的回滾必然使 `stock_balances.on_hand` 變成負數，與 §6「負庫存預設禁止」正面衝突。
**修法**：新增一節「作廢的前置檢查」：
| 作廢對象 | 前置條件 | 不滿足時 |
| --- | --- | --- |
| 進貨單 | 該批尚未被任何出庫／移位／盤點納入 | 拒絕，列出阻擋單號 |
| 採購單 | 已收量 = 0 | 拒絕，先作廢進貨單 |
| 盤點單 | 尚未核准 | 可作廢 |
| 庫存調整 | 回滾後 on_hand ≥ 0 | 拒絕 |
| 銷貨單 | 回滾後 on_hand ≥ 0 | 拒絕 |
| 調撥單 | 尚未調入收貨 | 若已部分收貨需先退貨 |

---

### A4 [阻斷] 進貨單／銷貨單／調撥單「作廢回滾」是刪除還是沖銷？與 §6 結存明細不可變互斥
**證據**：FR-28「作廢銷貨單時回滾其庫存異動」字面可解讀為刪除或改寫該筆 ledger；但 §6 與 addendum §2.2 明令 `stock_ledger` 禁止 UPDATE/DELETE，「更正一律以反向單據處理」。同時 FR-13 要求「序號單調遞增無缺口」——刪除 ledger 會直接製造缺口。
**修法**：明文寫成：「作廢**不修改也不刪除**原 ledger 紀錄，而是**追加一筆反向列**（`qty_delta` 取反、`source_doc_type = 'REVERSAL'`、`source_doc_no` 指向原單號），並以原單與反向列的配對決定實際結存。」並在 FR-13 的「無缺口」定義中說明反向列是合法列。

---

### A5 [阻斷] FR-13「序號單調遞增無缺口」與 PostgreSQL sequence 機制互斥
**證據**：FR-13「序號單調遞增無缺口」；FR-30「記錄具先後序號，可檢查是否有連續性缺口（竄改偵測）」。PostgreSQL 的 `SERIAL/IDENTITY` sequence **不參與交易**，交易 rollback 會留下跳號；因此以 sequence 實作必然出現缺口，而用「計數器表 + `FOR UPDATE`」實作則把所有寫入序列化，兩種做法都與「單調遞增無缺口」的檢查方式不同。
**修法**：把驗收條件由「無缺口」改為「**遞增且不重複**（committed rows 排序後序號唯一且嚴格遞增）」，並指定實作方式：`stock_ledger.seq` 與 `audit_log.seq` 由同一張 `counters(name, value)` 表以 `SELECT ... FOR UPDATE` 遞增（教學上可展示鎖的好處），或明確接受 sequence 跳號並將驗收改寫。若堅持「無缺口」，須明說這是排他鎖而非樂觀鎖，與 addendum §1.8 衝突。

---

### A6 [阻斷] 送單者≠核准者 + 「二級主管」在種子資料下無法成立
**證據**：addendum §5「帳號：4 個種子帳號（每角色一個）」；roles 僅 WAREHOUSE / PURCHASE / SALES / ADMIN（addendum §2.1）→ **ADMIN 只有 1 個**。
- FR-24「核准者不可為送單者本人（需第二人覆核）」→ 若主管本人建立採購單，**無任何人可核准**，流程死鎖。
- FR-20「差異率超過門檻（預設 1%）或差異金額超過門檻時，需**二級主管**核准」→ 只有一位 ADMIN，「二級主管」不存在，SM-1 示範劇本（盤點→差異核准）若觸發門檻即卡住。
- §10 開放問題 8 明確表示「主管角色是否需要拆成倉管主管與採購主管」尚未決定 → FR-20 的「二級」在現有角色模型下無對應角色。
**修法**：(1) 種子帳號改為 6 個（倉管 2、採購 2、銷售 1、主管 2），(2) 明訂「二級主管 = 第二位 ADMIN 帳號；門檻由第一位 ADMIN 核准後再送第二位」，(3) 加上逃逸條款：「若系統中僅存在一位可核准帳號，允許其自我核准並於 `audit_log` 標記 `SELF_APPROVED` 且列入 FR-31 查詢結果」，(4) 在 §10 Q8 結案：v1 不拆主管角色，改以「核准層級數」參數（1 或 2）表達。

---

### A7 [阻斷] 盤點凍結與「在途／調撥」的交互只寫了單向，會造成重複入庫
**證據**：UJ-2 邊界情況只說「盤點期間若有其他倉要調貨進來，系統提示調撥單被阻擋」；FR-18 列舉「進貨、領用、移位與調撥被阻擋」但未定義「範圍重疊」如何判定。
具體失敗情景（兩個開發者必然做出不同結果）：
1. A 倉盤點中，調撥單由 A 倉**調出** 100 件 → 雖然 A 倉帳面已扣 100，但 A 倉實體貨品也已離開，盤點實盤會少 100 → 盤虧 100；調出若未被凍結，盤點基準失真。
2. B 倉盤點中，調撥單由 A 倉調入、狀態 IN_TRANSIT 100 件 → **實地已收到貨，帳面 `stock_balances` 尚無此筆**（addendum §2.2 明載在途不落在 `on_hand`）→ 盤點會產出盤盈 100 → 核准後生成調整 +100 → 隨後調入確認又 +100 → **重複入庫**。
3. 盤點中止時，已存在的 IN_TRANSIT 單據如何處理（解冻后直接入庫？盤點基準是否需重取？）
**修法**：在 FR-18 補三條規則：
- 凍結判定式：`凍結生效 iff 異動的任一端（調出倉 or 調入倉）與盤點範圍有交集`（交集判定演算法於 A8 定義）。
- 在途命中盤點範圍時，**盤點認列規則**：在途數量不計入帳面亦不得計入實盤（視為未到貨），且盤點期間**禁止該調入確認**（需先中止盤點或主管放行），以消除情景 2 的重複入庫。
- 盤點中止／提交後，範圍內庫存基準以「盤點建立時快照」為準，凍結期間的放行異動需標記於該盤點單的差異說明欄。

---

### A8 [阻斷] 盤點「範圍」在 schema 與 PRD 中都沒有可計算的定義
**證據**：FR-17 允許依「倉庫、庫位、類別或商品」建立盤點單；addendum `stocktakes(scope_type, scope_id)` 是**單一** scope 欄位 → 無法表達「A 倉的飲料類」這種組合；且 `stocktake_lines` 沒有 `batch_id`，而 `stock_balances` 卻以 `(product_id, batch_id, warehouse_id, location_id)` 為鍵。
未定義的關鍵點（每一點都會讓兩人做出不同結果）：
- 凍結範圍是「倉庫 A 的所有庫位」還是「倉庫 A 本身」？庫位是 parent/child 樹且有 `is_aggregate`（addendum §2.1），範圍必須向下展開到葉層。
- scope = 類別時，是否只針對該類別商品？scope = 商品時，是全系統該商品，還是某倉某庫位？
- 盤點列舉對象是否包含帳面為 0 的商品？（只列有現存的 → 盤盈只能靠手動加；列全部 300 筆 → 成本與差異率分母都爆炸）— PRD FR-17 只說「系統帶出帳面數量」。
- 批次商品的帳面數量是「該商品該庫位所有批次合計」還是「逐批號分別盤」？`stocktake_lines` 無 `batch_id` → 前者；但 `stock_balances` 是批次粒度 → 盤盈/盤虧要寫到哪個批次？`adjustment_lines` 也沒有 `batch_id` → 批次商品的調整**無處落帳**。
**修法**：
- `stocktake_lines` 與 `adjustment_lines` 加 `batch_id`（nullable；非批次商品為 NULL，批次商品必填，盤盈時由使用者指定目標批號或由系統開一個「盤盈批號」）。
- `stocktakes` 改為 `stocktake_scopes(stocktake_id, scope_type, scope_id)` 一對多，或明訂「一次只能選一種 scope_type」。
- 補「範圍解析規格」：倉庫→其下所有葉層庫位；庫位→該庫位（若選父層則展開）；類別→該類別（含子類別？需定義）在範圍內的所有商品；商品→該商品在範圍內的所有 (location) 組合。
- 補「列舉規格」：預設列出範圍內 `on_hand > 0` 的 (商品, 庫位, 批號) 組合 + 允許手動新增品項（以建立盤盈列）。

---

### A9 [阻斷] 補充盤點差異的「金額門檻」在 v1 無法計算
**證據**：FR-20「差異率超過門檻（預設 1%）或差異金額超過門檻時，需二級主管核准」，§11 假設「門檻預設 1% 與 5,000 元」。但 addendum §1.5 明載 v1 **不實作成本計價法**，只記錄批次進貨單價快照；且 `stocktake_lines` / `adjustments` **沒有金額欄位**。
未定義：盤盈（實盤 > 帳面）沒有既有批次單價可用；同一商品有多批不同單價時取哪一批？無進貨紀錄的新商品取 `products.purchase_price`？
**修法**：明訂成本基準與公式，並新增欄位：
> 差異金額 = Σ|盤盈/盤虧數量| × 成本基準；成本基準 = 該商品最近一次進貨單價（`goods_receipt_lines.unit_price` 取最新），若無進貨紀錄則取 `products.purchase_price`，若兩者皆無則該列金額視為 0 且不計入門檻判定。
`stocktake_lines` 加 `diff_amount`（numeric 18,2），`stocktakes` 加 `total_diff_amount`。

---

### A10 [阻斷] 領用與銷貨的「庫位／批號選擇規則」缺失，銷貨單會做出兩種完全不同的行為
**證據**：FR-26 銷貨單「送出時可用庫存不足則拒絕，並顯示各倉可用量」，但**從未說明由誰決定扣哪個庫位、哪個批次**。`sales_order_lines` 有 `location_id`，但 FR-26 沒提使用者要選庫位。同一商品散在 3 個庫位、3 個批次時：
- 開發者 A：要求使用者逐列指定庫位與批號（庫存管理合理做法，但畫面複雜、與 UJ-6「小李輸入商品編號查即時可用庫存 → 加入 2 項商品」的路徑不符）。
- 開發者 B：自動配置（FEFO 依效期 / FIFO 依進貨日 / 混合）→ 與 UJ-6 的簡潔路徑相符，但需要另外定義 FEFO 演算法、批次分攤比例、以及多筆 ledger 的拆分規則。
FR-14 領用也是同樣情況（「領用數量不得超過可用庫存」— 領用要扣哪個庫位？）。
**修法**：在 §3 術語或 FR-14/FR-16/FR-26 各補一句：
> v1 一律要求使用者**逐列指定來源庫位**（調用預設帶入該商品數量最多且足夠的庫位，使用者可改）；批次商品另需指定批號（預設帶入最早到期者）。**不做**跨庫位自動拆分。
若採另一種（自動 FEFO），則須完整定義分配比例與拆分上限，否則一律選前者。

---

### A11 [阻斷] 「用途」同時是領用原因與銷貨分類，導致進銷存彙總雙重計算
**證據**：§3 術語表「用途 — 領用原因，分為銷貨、客戶寄貨、內部損耗」；FR-14「[倉管或**銷售人員**] 可以 領用庫存並指定用途（銷貨、客戶寄貨、內部損耗）」。但 FR-26 已有「銷貨單」並「送出時扣減庫存」。於是**銷售人員有兩條扣庫存的路徑**：建立銷貨單、或建立用途=銷貨的領用單。
FR-33 進銷存彙總要同時統計「進貨、領用、銷貨、調整與調撥」→ 一筆用途=銷貨的領用單算進「領用」還是「銷貨」？兩邊都算則重複；只算領用則「銷貨」欄位與銷貨單金額對不上。
此外與出題簡報不一致：任務指示指出簡報的用途僅有「銷貨、客戶寄貨」兩值，PRD §3 自行加了「內部損耗」。
**修法**：
1. 用途欄位**只存在於領用單**，列舉固定為 `SALE / CUSTOMER_CONSIGNMENT / INTERNAL_LOSS`，並在 §3 標註「『內部損耗』為教學擴充項，簡報原定義僅 銷貨、客戶寄貨；若以簡報為準則移除此值」。
2. FR-33 彙總分類規則明訂：`movement_type = ISSUE` 者依 `purpose` 再細分（SALE 併入「銷貨」欄、SALE/CONSIGNMENT/INTERNAL_LOSS 併入「領用」欄）——**擇一**，並在 FR-33 明文寫出對應表，否則 FR-33 的「彙總數量與逐筆異動加總一致」無法驗收。
3. 明確禁止「領用且用途=銷貨」與「銷貨單」並存造成的雙重路徑：建議改為——**銷售人員不能建立領用單**（FR-14 角色改為僅倉管），用途=銷貨僅供倉管補登已送出但未開單的情況，且該筆在 FR-33 單獨歸類。

---

### A12 [阻斷] 「採購日期」（簡報第 11 頁）與「帶入日期」（簡報第 14 頁）在 PRD 與 schema 中都沒有落腳點
**證據**：
- FR-25「[系統] 可以 在核准採購單時自動指派採購批次流水號，並記錄**帶入日期**、總價與單價」；可測試結果「帶入日期為採購單核准日」——但 `purchase_orders(id, po_no, supplier_id, status, expected_date, total_amount, sent_by, approved_by, created_at, reason)` **沒有 `approved_at`**，也沒有任何欄位可承載「帶入日期」。§3 術語表也沒有「帶入日期」這個詞。
- 出題簡報第 11 頁要求商品主檔有「**採購日期**」——`products` 表沒有此欄位。
- PRD 與 addendum 均未說明「採購日期」與「帶入日期」是同一個東西還是兩個。
**修法**：
1. `purchase_orders` 加 `approved_at timestamptz`（帶入日期 = 核准日，時區見 D 節時區條款）。
2. §3 術語表補兩個定義：
   - **帶入日期** — 採購單通過核准之日（`purchase_orders.approved_at`），代表採購正式成立，與實際到貨日（`goods_receipts.received_at`）分開記錄。
   - **採購日期** — 商品最近一次進貨入庫之日，**不另存欄位**，由 `stock_ledger` 中 `movement_type = PURCHASE` 的最大 `occurred_at` 即時計算（避免維護性欄位與 ledger 不同步）。
3. FR-25 可測試結果補一條「商品主檔可查得最近採購日期，且等於該商品最近一次進貨的日期」。

---

### A13 [阻斷] 單號規則存在三套互相衝突的規則（PO 序號、FR-29 設定、FR-4 商品編號）
**證據**：
- §3 術語「**採購批次流水號** — 採購單核准時自動指派的單號格式 `PO-YYYYMMDD-序號`」——在**核准時**指派。
- FR-29「[主管] 可以 設定各單據的單號格式與流水來源」，可測試結果「格式可包含日期與流水，例如 `SO-YYYYMMDD-0001`」、「格式變更僅影響後續**新建**單據」——隱含在**建立時**指派。
- addendum `purchase_orders` 只有一個 `po_no` 欄位，沒有第二個「採購批次流水號」欄位。
- FR-4「商品編號由系統自動產生」「唯一且**自動遞增**」——**格式未指定**（是 `1`？`P-0001`？`A-0001`？是否含類別？是否分日重置？），而 FR-29 的單號設定**不涵蓋商品編號**。
- FR-29 示例為 4 碼零填充（`0001`），FR-25 只寫「序號」無寬度規定 → 兩種實作會產生 `PO-20261021-1` 與 `PO-20261021-0001` 兩種格式。
**修法**：
1. 刪除 §3 的「採購批次流水號」詞（與 po_no 重複，且與「批號 batch_no」混淆）；統一為「**採購單號**」。
2. 明訂 `po_no` 於**建立時**指派（草稿就要能引用、搜尋、稽核），格式 `PO-YYYYMMDD-{seq:04d}`，序號**每日重置**，由 `counters` 表以 `(prefix, date)` 為鍵遞增。FR-25 的「核准時指派」改寫為「核准時補記 `approved_at`」。
3. FR-4 補格式：`商品編號 = P-{seq:05d}`，`seq` 為**全域**序號（不重置），於建立時指派且不可更改；匯入時若來源檔提供商品編號則沿用，否則自動指派（見 A-系列／FR-35）。
4. FR-29 支援的 token 集合明訂：`{PREFIX}-{YYYYMMDD}-{SEQ:n}`，SEQ 寬度可設、是否每日重置可設；並明訂「流水來源僅支援『每日前綴計數』一種」（教學範圍）。

---

### A14 [阻斷] 沒有「建立庫存調整」的功能需求，而 FR-11 卻要求用它來更正
**證據**：FR-11「進貨單送出即寫入庫存異動，且不可編輯（**更正須以庫存調整處理**）」；FR-20「核准盤點差異並**自動轉為庫存調整**」；FR-27 把「庫存調整」列為受管狀態機的單據；§6「第二人覆核 — 送單者不可為核准者本人（採購單、盤點差異、**庫存調整**皆適用）」。
但 37 條 FR 中**沒有任何一條**允許使用者主動建立一張庫存調整單 → `adjustments` 只能由盤點核准產生，然而它的欄位卻有 `requested_by`（誰申請？）、`status = DRAFT→PENDING_APPROVAL`（誰送單？）。FR-20 的「自動轉為調整並更新可用庫存」也意味著調整在建立的瞬間就已核准，與狀態機矛盾。
**修法**：新增 **FR-28a「手動庫存調整」**：使用者可對任一 (商品, 庫位, 批號) 建立 `qty_delta` 調整，須填 reason_code（列舉：`DAMAGE / EXPIRED / COUNT_GAIN / COUNT_LOSS / CORRECTION / OTHER`），走 DRAFT→PENDING_APPROVAL→APPROVED，送單≠核准；FR-20 的盤點調整則標記 `source = STOCKTAKE` 直接以 APPROVED 產生並記錄 `stocktake_id`（`adjustments` 加 `stocktake_id` FK）。同一次修改中把 FR-20 改寫為「核准盤點差異 → 產生 `source=STOCKTAKE` 的庫存調整（視為已核准）」以消除矛盾。

---

## (b) 資料模型對不上的地方

> 對應 addendum §2 的資料表草案與 PRD FR 的逐項比對。

### B1 [高] FR-21 的「類別層 / 倉庫層」安全水位與補貨倍數**沒有任何儲存位置**
- FR-21：「[採購或主管] 可以 依**商品、商品類別或倉庫**設定安全水位與補貨倍數。類別設定作為商品未個別設定時的預設。」
- addendum §2.1：`products.safety_stock, products.reorder_multiplier`（僅商品層）、`product_categories(id, code, name, parent_id)`（**無安全水位欄位**）、**沒有任何 product × warehouse 設定表**。
- addendum §2.4 `settings(key, value_json)` 被註解為承載「補貨倍數」，但 settings 是 key-value，承載不了「依類別／依倉庫」的結構化設定。
- **後果**：FR-22 補貨建議清單（`可用庫存低於安全水位`）在類別層與倉庫層完全無法實作；UJ-3 的示範情境（列出 6 項低於水位商品）只能靠商品層設定。
- **修法**：`product_categories` 加 `safety_stock numeric`、`reorder_multiplier numeric`；新增 `product_warehouse_settings(product_id, warehouse_id, safety_stock, reorder_multiplier, PK(product_id, warehouse_id))`；並在 FR-21 明訂優先序：
  > 優先序：商品×倉庫 > 商品 > 類別×倉庫 > 類別 > 系統預設（0）。

### B2 [高] 批號（batch）在三張表裡各存一份自由文字，卻沒有任何一張引用 `product_batches`
- addendum：`product_batches(id, product_id, batch_no, expiry_date, received_at)`；`purchase_order_lines(..., batch_no)`；`goods_receipt_lines(..., batch_no, expiry_date, ...)`。
- 但 `stock_ledger.batch_id` 與 `stock_balances.batch_id` 指向 `product_batches.id` → **寫入庫存時必須有 batch_id**，而來源單據上只有文字 `batch_no`。
- 未定義：批號在 PO line 先給、還是 GR line 才給？`product_batches` 何時建立（PO 核准時？收貨時？）？同一商品下 `batch_no` 是否唯一？跨商品可否同號？
- **修法**：規範化為：`product_batches` 為唯一來源，`purchase_order_lines.batch_id` / `goods_receipt_lines.batch_id` 改為 FK（nullable，非批次商品為 NULL），`batch_no` 只存在於 `product_batches`；明訂「批次於進貨單送出時自動建立（若該商品 `is_batch_tracked`），同一商品下 `batch_no` 唯一」；PO line 只需文字預填批號建議值（不落庫）。

### B3 [高] 效期（expiry）掛在三張表且語意互斥；非批次商品的效期無處可放
- §3 術語：「效期 — **商品**的最後可使用日期，選填」→ 商品層。
- addendum：`product_batches.expiry_date` → 批次層；`goods_receipt_lines.expiry_date` → 收貨明細層。
- 三處皆可寫 → 同一批號在兩次收貨可填不同效期，資料不一致。批次商品與非批次商品的行為也未分化。
- **修法**：效期唯一歸屬 `product_batches.expiry_date`；`goods_receipt_lines.expiry_date` 移除（由批次帶出）；`products` 增 `expiry_date` 僅供**非批次**商品使用（欄位可為 NULL，批次商品忽略此欄），並在 FR-11 明文「批次商品填效期、其餘商品填商品效期」。

### B4 [高] 調撥單沒有庫位，而 `stock_balances` 必以庫位為粒度
- addendum：`transfers(from_warehouse_id, to_warehouse_id)`、`transfer_lines(transfer_id, product_id, qty, qty_received)` —— **完全沒有 location**。
- 但 `stock_balances` 鍵含 `location_id`；FR-15 移位是「庫位→庫位」，FR-16 調撥 FR-28 要回滾「調出與在途數量」。
- 開發者 A：調撥僅在倉庫層級，扣減時從調出倉任一庫位扣（或直接寫 location=NULL）→ 破壞庫位維度與 FR-10 的容量/凍結檢查。
- 開發者 B：要求調出/調入各選一庫位 → schema 需加欄位。
- **修法**：明訂「v1 調撥僅支援倉庫層級，調出時**自動從調出倉指定庫位扣減**（預設取數量最充足之庫位，使用者可指定），調入時由收貨人指定入庫庫位」→ schema 需 `transfers.from_location_id`（或 `transfer_lines.from_location_id`）與 `transfer_lines.to_location_id`；或在 PRD 直接聲明 v1 調撥不記庫位並把 `stock_balances.location_id` 設為 nullable（不建議，會讓 FR-10 容量檢查失效）。

### B5 [高] `stock_ledger` / `stock_balances` 的 `warehouse_id` 與 `location_id` 冗餘且無一致性約束
- 兩張表同時存 `warehouse_id` 與 `location_id`，但 `locations.warehouse_id` 本身已決定倉庫 → 冗餘，可能寫入不一致（庫位屬 A 倉卻記 warehouse=B）。
- **修法**：刪除 `warehouse_id`（由 `locations` join 取得），或加 `CHECK`/觸發保證一致；並明文「`stock_balances` 唯鍵為 (product_id, batch_id, location_id)」。

### B6 [高] `stock_balances.reserved` 與「可用庫存 = 現存 − 已分配」是**沒有任何 FR 會寫入的孤兒規格**
- §3、§6 與 addendum §2.2 都定義 `可用庫存 = on_hand − reserved`。
- 但 v1 的分配語意：FR-26 銷貨「送出即扣減」、FR-24 採購「核准不占庫」、FR-11 收貨直接入庫 → **沒有任何流程產生 `reserved`** → reserved 恆為 0 → 「可用庫存 ≡ 現存數量」，FR-22 的「可用庫存低於安全水位」等同「現存低於安全水位」。
- 兩個開發者：A 照 §3 定義實作（並自行發明一個「保留」流程以免 reserved 恆 0）；B 認定 v1 無保留流程、直接用 on_hand（FR-22 結果相同但 API 欄位語意不同）。這會影響 FR-32/FR-22 的「可用庫存」欄位定義與 FR-33 彙總。
- **修法**：二擇一並明文：
  (a) 保留 reserved 但明文「v1 無保留流程，`reserved` 恆為 0，可用庫存 = 現存數量；保留欄位為教學預留」；或
  (b) 刪除 reserved 欄位與「已分配」定義，把「可用庫存」直接定義為現存數量。
  建議 (a)，但必須在 FR-32/FR-22 明文恆等關係，否則 API 文件與實作語意不符。

### B7 [高] 在途庫存沒有 ledger 來源，與 FR-13 / SM-3 直接互斥
- addendum §2.2 明確：「在途庫存另計於 `transfers`（`status = IN_TRANSIT`），**不落在 `stock_balances.on_hand`**」→ 在途量不進 `stock_ledger`。
- 但 FR-13「每一筆庫存數量變化都能對應到唯一一筆結存明細」、SM-3「任一庫存數字都能由結存明細逐筆加總還原」、FR-28「作廢調撥單時回滾**調出與在途數量**」。
- 結果：調出時 -100（有一筆 ledger）、調入時 +100（有一筆 ledger），但中間的 100 在途既不在 balances 也不在 ledger，**「回滾在途數量」沒有東西可回滾**。
- **修法**：二選一並明文：
  (a) 在途另立 `transit_balances`（由 `transfers` 彙總）並在 FR-13/SM-3 加註「在途數量不在結存明細還原範圍內，其正確性由 `transfers` 明細保證」；或
  (b) 引入 `movement_type = TRANSIT_OUT / TRANSIT_IN` 兩筆 ledger，把在途視為一個虛擬倉庫，則 SM-3 全域成立（但與 §2.2 與 FR-33「彙總不包含在途」需同步調整）。
  建議 (a)（教學成本低），但必須同時修正 FR-13 與 SM-3 的絕對措辭。

### B8 [高] `stocktake_lines` / `adjustment_lines` 缺 `batch_id`（批次商品的盤盈盤虧無處落帳）
- 見 A8。`stock_balances` 以 batch 為鍵，調整卻只能指到 (product, location)。
- **修法**：`stocktake_lines.batch_id`、`adjustment_lines.batch_id` 加 nullable FK；批次商品必填；盤盈時由使用者指定既有批號或由系統建立「盤盈批次」（`batch_no` 前綴 `ADJ-`）。

### B9 [高] `adjustments` 缺 `stocktake_id`，FR-19/FR-20 的「盤點差異 → 調整」不可追溯
- FR-20「核准盤點差異並自動轉為庫存調整」；FR-19 提交後不可修改須作廢重開。
- `adjustments(id, adj_no, status, reason_code, requested_by, approved_by, created_at)` + `adjustment_lines(adjustment_id, product_id, location_id, qty_delta, reason_code)` — **沒有 stocktake_id、沒有 amount、沒有 source**。
- **修法**：`adjustments` 加 `source`（`STOCKTAKE` / `MANUAL`）與 `stocktake_id`（nullable FK），`adjustment_lines` 加 `diff_amount`。

### B10 [中] `goods_receipts` 無「核准/作廢」相關欄位，而 FR-27 要求所有單據統一管理狀態
- `goods_receipts(id, gr_no, po_id, status, received_at, operator_id, reason)` — 有 `status` 但無 `voided_by/voided_at`（A2 已列）。
- 同理 `sales_orders`、`transfers`、`stocktakes` 都缺作廢軌跡欄位。

### B11 [中] 沒有 sessions / tokens 表，但 FR-1 與 FR-37 要求 token 認證 + 30 分鐘閒置自動登出
- schema 缺 `sessions(id, user_id, token_hash, issued_at, last_seen_at, expires_at)`。
- 「閒置逾時」需要 server-side 的 `last_seen_at`；純 JWT 無法實作 idle timeout（只有絕對 exp）。而 FR-2「新指派角色後**重新登入**即生效」與「閒置 30 分鐘」共存 → 需要可失效的 session。
- **修法**：新增 `sessions` 表並在 FR-1 明訂「token 為不透明隨機字串（存 hash），每請求更新 `last_seen_at`；逾 30 分鐘未更新即失效，需重新登入」；同時說明角色變更採「下次登入取得新 snapshot」。

### B12 [中] `roles`/`role_permissions` 存在，但權限代碼清單從未定義
- FR-2 需要「調整角色的功能權限」，但沒有任何地方列出權限代碼（`PO_APPROVE`? `STOCKTAKE_APPROVE`? `PRICE_VIEW`? `STOCK_ADJUST`?）。開發者會各自發明，導致 FR-2 與 FR-3 的驗收不可重現。
- **修法**：在 addendum 附一份權限矩陣（角色 × 權限代碼），至少 20 個代碼，並標示哪些預設開啟（供學生調整）。

### B13 [中] `users.must_change_password` 與「首次登入強制修改」在 PRD 沒有對應 FR
- addendum §5「帳號：4 個種子帳號…首次登入強制修改」；`users.must_change_password` 欄位存在。
- PRD FR-1 只有「登入/登出」三條可測試結果，無強制改密流程 → 教學示範時改密頁會做出來卻無驗收標準。
- **修法**：在 FR-1 補一條可測試結果，或從 addendum 種子設計移除該要求（建議保留並補一條 FR）。

### B14 [中] `settings(key, value_json)` 承擔關鍵設定但無 key 契約
- 承載：單號規則（FR-29）、盤點門檻（FR-20）、補貨倍數（FR-21 — 見 B1 應改為結構化表）、凍結模式、呆滯天數（FR-34）。但 key 名稱、值的 JSON 結構、變更稽核方式皆未定義。
- **修法**：在 addendum §2.4 列出 settings 的 key 契約表（key / 型別 / 預設值 / 影響的 FR），例如 `doc_number_format`（JSON schema）、`stocktake_diff_rate_threshold`（number 0.01）、`stocktake_diff_amount_threshold`（number 5000）、`slow_moving_days`（int 90）。

### B15 [低] `product_categories.parent_id` 有階層，但類別設定與盤點範圍的「父類別是否含子類別」未定義；層級深度與環狀也未約束（FR-6 僅對 `unit_conversions` 定義了環狀檢查）。
- **修法**：補「類別最多 2 層；查詢類別時預設含所有子類別；`parent_id` 不得成環」。

### B16 [低] `locations` 缺 code 唯一性與層級約束；`capacity` 欄位語意不明
- `locations(id, warehouse_id, parent_id, code, name, capacity, is_frozen, is_aggregate)` — 沒有「同倉庫 code 唯一」；`capacity` 是一個數字，但一個庫位可放多種商品 → 「容量」是件數？體積？重量？
- FR-10「庫位容量上限可設定，入貨或移位超出時被阻擋並顯示目前容量」——「目前容量」要怎麼算？
- **修法**：明訂 `capacity` = 「庫位最大總件數（所有商品基本單位數量加總）」，`CHECK (capacity IS NULL OR capacity > 0)`；`UNIQUE (warehouse_id, code)`；層級最多 3 層；`parent_id` 不得成環；`is_aggregate = true` 的庫位不得入貨/出貨/移位。

### B17 [低] `product_suppliers` 缺報價單位，FR-22 的「最低報價」無法正確比較
- `product_suppliers(id, product_id, supplier_id, unit_price, moq, lead_time_days, valid_until)` — **沒有 unit 欄位**，而商品有單位換算（1 箱 = 12 罐）。
- 報價 3 元/箱 與 0.5 元/罐 不可直接比較 → FR-22「最低供應商報價」會選錯供應商。
- **修法**：`product_suppliers` 加 `unit` 欄位，並明訂「最低報價一律先換算至商品基本單位後比較」。

### B18 [低] `users.role_id` 單一角色 vs FR-2「調整角色的功能權限」沒問題，但「一個帳號多角色」是否允許未說明；`product_batches.received_at` 與 `goods_receipts.received_at` 重複，來源不明。
- **修法**：明訂「一個帳號一個角色」；`product_batches.received_at` 移除或註明為「該批首次入庫日」。

---

## (c) 交易與併發風險

### C1 [高] 結存明細與彙總表的寫入順序、交易邊界與鎖策略**都沒有寫在 spec 裡**
- addendum §3 只畫了「Service → Repository → PostgreSQL」的分層圖，沒有規定：
  1. `stock_ledger` 與 `stock_balances` 必須在**同一個 DB transaction** 內提交；
  2. 兩者的先後順序（先 ledger 後 balances，或反之）；
  3. `stock_balances` 的更新方式（UPSERT vs 先 SELECT 後 UPDATE）；
  4. 失敗時的回滾語意。
- **兩個開發者會分歧在哪**：A 寫 ledger 後立刻 commit，再更新 balances（中間崩潰 → 明細與彙總永久不一致，且無任何機制可對帳）；B 在同一 transaction 內完成（正確）。而 FR-13 的「唯一一筆結存明細」與 SM-3 的可還原性只在 B 的做法下成立。
- **修法**：在 addendum §3 增列「StockService 寫入契約（強制規格）」：
  > 任何庫存異動必須在**單一 transaction** 內依序完成：(1) 取得目標 `stock_balances` 列的鎖（`SELECT … FOR UPDATE`）或以條件式 UPDATE 檢查可用量；(2) 檢查容量、凍結、負庫存規則；(3) 寫入 `stock_ledger`（append-only）；(4) UPSERT 更新 `stock_balances`（`on_hand += delta`、`version += 1`）；(5) 寫入 `audit_log`。任一步失敗 → 整筆交易 rollback，不留半套資料。

### C2 [高] 「先檢查可用庫存再扣減」是 read-modify-write，並發出庫會產生負庫存
- FR-14/FR-26/FR-16 都寫「數量不得超過可用庫存，不足則拒絕」；§6「負庫存預設禁止」。
- 但如果實作是 `SELECT on_hand` → 判斷 → `UPDATE on_hand = on_hand - qty`，兩個並發出庫都會通過檢查 → 負庫存。
- **修法**：明訂「出庫的可用量檢查與扣減必須是**單一原子操作**」並給出範例：
  > `UPDATE stock_balances SET on_hand = on_hand - :q, version = version + 1 WHERE product_id=… AND batch_id IS NOT DISTINCT FROM … AND location_id=… AND on_hand - reserved >= :q`；影響列數為 0 → 拒絕該筆（回報目前可用量與所在庫位）。
  這同時解決 A-系列中「條件式更新 vs 行鎖」的歧義。

### C3 [高] addendum §1.8 的樂觀鎖是**孤兒建議**：沒有任何 FR/NFR 宣告何時必須使用它
- §1.8：「庫存彙總表帶 `version` 欄位，寫入時檢查版本，衝突則回應 409 並要求重試。」
- 但 PRD 37 條 FR **沒有任何一條**提到 409、版本衝突、重試；`stock_balances.version` 也沒有被任何可測試結果覆蓋。
- 兩個開發者：A 照 §1.8 實作 compare-and-swap，衝突回 409，但**前端與測試都不預期 409**（所有 FR 的錯誤情境都寫「拒絕並顯示…」）；B 用 `SELECT FOR UPDATE` 序列化，根本不會有 409 → 兩種行為都「符合文件」。
- **修法**：二擇一並寫進 FR：
  (a) 明訂樂觀鎖並在受影響 FR 補可測試結果：「同一 (商品, 庫位) 的並發出庫，第二筆回應 409 `VERSION_CONFLICT`，前端提示重試」；或
  (b) 放棄樂觀鎖，改為悲觀鎖 `FOR UPDATE`（教學上更簡單、行為更可預測），並刪除 §1.8 的 409 敘述。
  建議 (b) 於教學情境成本最低，但若保留樂觀鎖就必須補上 409 的前端處理與測試。

### C4 [高] `purchase_order_lines.qty_received` 的累計是典型的 read-modify-write
- FR-11「同一採購單可分批收貨，已收量累計不得超過訂購量」；兩個倉管同時收同一張 PO 的不同品項或同一品項，會超收。
- **修法**：`qty_received` 以條件式 UPDATE 遞增（`WHERE qty_received + :q <= qty_ordered`），影響列數為 0 → 拒絕；超收放行走 A-系列的白名單路徑並填原因。

### C5 [中] 稽核的 hash chain 與 seq 會把敏感寫入序列化
- addendum §1.9 / §2.4：`audit_log(seq, prev_hash, entry_hash)` — 每筆敏感寫入都要讀前一筆的 `entry_hash` 才能算自己的 → 天然是單鏈序列化。
- 這是合理的（稽核本來就該序列化），但與 §1.8 的樂觀鎖、與 C2 的原子更新在同一交易內會拉長臨界區。
- **修法**：在 spec 說明「稽核寫入在同一 transaction 內以 `SELECT … FROM audit_log ORDER BY seq DESC LIMIT 1 FOR UPDATE` 取前一筆」或接受序號跳號（與 A5 連動）。

### C6 [中] 盤點凍結的檢查點必須是**單一收斂點**，否則必然漏
- FR-18 要求凍結期間阻擋「進貨、領用、移位與調撥」；但這些對應 FR-11/FR-12/FR-14/FR-15/FR-16 五個入口，加上 FR-35 的期初庫存匯入、FR-37 的 API 寫入路徑 → 七個入口。
- §6「單一寫入入口」已�含正解，但沒有強制機制。開發者容易在四個 Service 方法裡各寫一次判斷，漏掉匯入與 API。
- **修法**：在 addendum §3 明訂「**所有**影響 `stock_balances` 的寫入（含匯入、API、種子資料）必須經過 `StockService.apply_movement()` 這一個函式；凍結檢查、容量檢查、負庫存檢查全部寫在該函式內」。並把 FR-35 匯入的期初庫存納入凍結規則。

### C7 [中] 作廢回滾的連鎖鎖定順序與併發
- 作廢銷貨單回滾 +100、另一筆出庫 -N 同時發生 → 需要與 C1/C2 相同的鎖順序（固定：先 product 再 location），否則死鎖。
- **修法**：在 spec 補「所有庫存寫入的加鎖順序固定為 product_id → location_id → batch_id，避免死鎖」。

### C8 [中] 匯入（FR-35）的交易邊界未定義
- 「錯誤列不影響其他列寫入」與「匯入以交易方式執行，失敗時整批回滾」**互相矛盾**（見 D-FR-35）。另外「可選擇跳過或覆寫」是全批選項還是逐列選項也未定義。
- **修法**：見 D-FR-35 的建議改寫。

---

## (d) 規格不足但可用一句話補上者

> 每則以「FR-xx：建議補一句 ——」格式，方便逐條併入 PRD。

### FR-1（帳號登入與登出）
- FR-1：建議補一句 —— 「閒置逾時的判定為『距上次有效 API 請求超過 30 分鐘』；token 為存於 `sessions` 表的不透明字串，逾期即失效。」
- FR-1：建議補一句 —— 「登入時若 `must_change_password` 為真，強制導向改密頁，未改密前不得存取其他功能。」

### FR-2（角色指派與功能權限）
- FR-2：建議補一句 —— 「權限於登入時快照進 token/session；權限或角色變更後，該帳號需重新登入才生效。」
- FR-2：建議補一句 —— 「系統內僅存在一位可核准帳號時，允許自我核准並標記 `SELF_APPROVED`（見 A6）。」

### FR-3（成本單價欄位遮蔽）
- FR-3：建議補一句 —— 「遮蔽欄位清單：商品採購單價、供應商報價、採購單明細單價與總價、進貨明細單價、盤點差異金額；採購與主管角色可見其餘全部。」
- FR-3：建議補一句 —— 「遮蔽亦適用於 CSV 匯出（FR-36）與彙總報表（FR-33），不得從合計欄位反推。」

### FR-4（商品建檔）
- FR-4：建議補一句 —— 「商品編號格式 `P-{seq:05d}`，取自全域序號，建立時指派且不可修改；重複的名稱僅提示不阻擋。」
- FR-4：建議補一句 —— 「商品條碼可為 NULL（無條碼商品），但一旦填寫即不得與其他商品重複。」

### FR-5（條碼與批次設定）
- FR-5：建議補一句 —— 「同一商品下 `batch_no` 唯一；不同商品可使用相同批號文字。」
- FR-5：建議補一句 —— 「條碼查詢採完全比對（trim + 轉大寫），不做模糊比對。」

### FR-6（單位與單位換算）
- FR-6：建議補一句 —— 「換算係數最多 6 位小數且須 > 0；換算結果四捨五入至小數 3 位（ROUND_HALF_UP）。」
- FR-6：建議補一句 —— 「v1 不支援連鎖換算（僅支援基本單位 ↔ 單一包裝單位），避免路徑歧義。」

### FR-7（商品停用）
- FR-7：建議補一句 —— 「停用時若仍有 `on_hand > 0`，**阻擋**停用並列出剩餘庫存位置（而非僅提示）。」

### FR-8（供應商主檔）
- FR-8：建議補一句 —— 「統編驗證為 8 位數字（允許前導 0 與國際格式 `TAXID-` 前綴不支援）；電話允許 2–20 字的數字、+、-、#、空白。」

### FR-9（商品與供應商關聯及報價）
- FR-9：建議補一句 —— 「報價含單位欄位（必須是該商品已登錄的單位），最低報價比較前一律換算為基本單位。」
- FR-9：建議補一句 —— 「報價無生效起始日，僅 `valid_until`；`valid_until` 為 NULL 代表長期有效；過期判定為 `valid_until < 今日（Asia/Taipei）`；MOQ 僅記錄不強制。」

### FR-10（倉庫與庫位主檔）
- FR-10：建議補一句 —— 「同倉庫內 `code` 唯一；層級最多 3 層，`parent_id` 不得成環；`is_aggregate` 為 true 的庫位不可存放商品。」
- FR-10：建議補一句 —— 「`capacity` 定義為庫位最大總件數（所有商品基本單位數量加總），NULL 表示不限；阻擋時回報目前占用件數。」

### FR-11（進貨單）
- FR-11：建議補一句 —— 「超收放行者為 ADMIN 角色，且需填寫原因；超收無量上限（僅受庫位容量限制）。」
- FR-11：建議補一句 —— 「進貨單送出後 `goods_receipt_lines` 的批號自動建立 `product_batches` 紀錄，效期取自該批次。」

### FR-12（無單據入庫）
- FR-12：建議補一句 —— 「無單據入庫的原因代碼固定為 `NO_PO`（搭配自由說明文字），於採購金額統計中以獨立欄位篩選。」

### FR-13（庫存異動明細與查詢）
- FR-13：建議補一句 —— 「`movement_type` 固定列舉：`PURCHASE / ISSUE / SALE / MOVE / TRANSFER_OUT / TRANSFER_IN / ADJUSTMENT / OPENING / REVERSAL`；移位產生兩筆（一負一正）。」
- FR-13：建議補一句 —— 「序號驗收改為『遞增且不重複』；若要求無缺口則採計數器表加鎖（見 A5）。」

### FR-14（領用出庫）
- FR-14：建議補一句 —— 「領用須指定來源庫位（批次商品另需批號），不做跨庫位自動拆分；每筆領用必須有用途與操作人。」
- FR-14：建議補一句 —— 「用途列舉 `SALE / CUSTOMER_CONSIGNMENT / INTERNAL_LOSS`；簡報原定義僅 `SALE` 與 `CUSTOMER_CONSIGNMENT`。」

### FR-15（庫存移位）
- FR-15：建議補一句 —— 「移位寫成兩筆 ledger（來源庫位負、目標庫位正），同一庫位不得移至自身。」

### FR-16（跨倉調撥與在途）
- FR-16：建議補一句 —— 「調出需指定來源庫位、調入需指定目標庫位；在途以 `transfers.status = IN_TRANSIT` 與 `transfer_lines.qty - qty_received` 計算，不進入 `stock_balances`（與 FR-13/SM-3 的關係見 B7）。」
- FR-16：建議補一句 —— 「分批到貨時，`qty_received` 遞增，累計不得超過 `qty`；超出視為超收走 FR-11 的特權放行路徑。」

### FR-17（建立盤點單）
- FR-17：建議補一句 —— 「盤點列舉對象為範圍內 `on_hand > 0` 的 (商品, 庫位, 批號) 組合，另允許手動新增品項以建立盤盈列；盤點單可中斷續做，草稿存在後端（`stocktake_lines`）而非前端暫存。」

### FR-18（盤點期間凍結）
- FR-18：建議補一句 —— 「凍結判定：異動的任一端（調出倉或調入倉）落在盤點範圍即阻擋；在途命中範圍時禁止調入確認，需先中止盤點或由主管放行（見 A7）。」
- FR-18：建議補一句 —— 「主管放行是**單張單據一次性**放行，並在該單據與稽核軌跡留下放行者與盤點單號。」

### FR-19（提交盤點結果與盤盈盤虧）
- FR-19：建議補一句 —— 「差異率 = Σ|實盤 − 帳面| ÷ Σ帳面；Σ帳面 = 0 時顯示 `N/A` 而非 0.00%。」
- FR-19：建議補一句 —— 「Σ帳面 的分母只計入盤點範圍內的帳面數量；盤盈列的帳面為 0 不影響分母。」

### FR-20（盤點差異審核）
- FR-20：建議補一句 —— 「成本基準與差異金額計算式見 A9；二級主管 = 第二位 ADMIN 帳號；差異率 1% 與金額 5,000 為可由主管調整的 `settings` 參數。」
- FR-20：建議補一句 —— 「核准者與盤點者不得為同一人（以 `users.id` 比對，非角色比對）。」

### FR-21（安全水位與補貨倍數設定）
- FR-21：建議補一句 —— 「優先序：商品×倉庫 > 商品 > 類別×倉庫 > 類別 > 系統預設 0；門檻值可為 0（0 表示不納入補貨建議）。」
- FR-21：建議補一句 —— 「調整補貨倍數時，係數須 ≥ 1，否則建議量將無法收斂。」

### FR-22（補貨建議清單）
- FR-22：建議補一句 —— 「比較基準為『可用庫存 + 在途庫存』對安全水位；在途不計入可用庫存但計入補貨判定，避免重複下單。」
- FR-22：建議補一句 —— 「建議採購量四捨五入至小數 3 位後再取 `max(1, …)`，並以商品基本單位表示；MOQ 不強制（見 §10 Q5）。」

### FR-23（建立採購單）
- FR-23：建議補一句 —— 「數量 `numeric(18,3)`、單價 `numeric(18,2)`、總價 `numeric(18,2)`；總價 = Σ(數量 × 單價) 後以 ROUND_HALF_UP 取小數 2 位儲存與顯示，計算用未捨入值。」

### FR-24（採購單送單與核准）
- FR-24：建議補一句 —— 「送單時鎖定明細（`status` 轉為 `PENDING_APPROVAL` 後所有欄位唯讀）；駁回後回到可編輯或直接作廢，須二擇一明訂（建議回到 DRAFT 並保留原送單紀錄於稽核）。」

### FR-25（採購批次流水號與金額）
- FR-25：建議補一句 —— 「統一為『採購單號』，於建立時指派，格式 `PO-YYYYMMDD-{seq:04d}`，序號每日重置（見 A13）；`approved_at` 記錄帶入日期。」

### FR-26（銷貨單與庫存扣減）
- FR-26：建議補一句 —— 「銷貨單每列對應單一庫位（批次商品另需批號），不跨庫位自動拆分；銷貨人預設帶入登入者，修改需填原因並留稽核。」
- FR-26：建議補一句 —— 「『今天』= 使用者時區（Asia/Taipei）之當日；`sold_at` 預設為伺服器當下時間。」

### FR-27（單據狀態機）
- FR-27：建議補一句 —— 「以逐單據轉移表取代共用列舉（見 A1）；每種單據的狀態集合、允許轉移、觸發角色一覽表化。」

### FR-28（作廢重開）
- FR-28：建議補一句 —— 「作廢以追加反向 ledger 實現，不修改原紀錄（見 A4）；各單據的作廢前置條件見 A3 的表格。」

### FR-29（單號規則）
- FR-29：建議補一句 —— 「支援格式：`{PREFIX}`、`{YYYY}`、`{YYYYMMDD}`、`{SEQ:n}`（n = 1–8，零填充）；流水來源僅支援『每日前綴計數』一種。」

### FR-30（不可竄改的稽核紀錄）
- FR-30：建議補一句 —— 「敏感操作清單補入『登入成功/失敗』與『初始資料匯入』；一筆稽核紀錄對應一個物件的一個欄位變更，批次送單以每個明細欄位各記一列。」

### FR-31（稽核查詢與匯出）
- FR-31：建議補一句 —— 「『保留 5 年』與 FR-30『不可刪除』的例外條款：手動清理僅允許刪除最舊的整段紀錄並重算 hash chain，清理動作本身需以獨立稽核檔案留存（見下）。」
- FR-31：建議補一句 —— 「『可手動清理』與 FR-30『不可刪除』互相矛盾，二者擇一；若允許清理，必須在 FR-30 加上例外條款並說明 hash chain 的重算與 anchor 失效。」

### FR-32（庫存查詢）
- FR-32：建議補一句 —— 「查詢回應一律分頁（預設 50 筆，上限 200），名稱搜尋使用 ILIKE 前綴匹配；結果依商品編號 + 庫位代碼排序。」

### FR-33（進銷存彙總）
- FR-33：建議補一句 —— 「彙總分類對照表：`PURCHASE→進貨`、`ISSUE→領用`、`SALE→銷貨`、`ADJUSTMENT→調整`、`TRANSFER_OUT/IN→調撥（分調出/調入兩欄）、`MOVE` 不計入、`OPENING` 不計入、`REVERSAL` 抵銷原類別。日期區間採半開區間 [起日 00:00, 終日+1 00:00)。」

### FR-34（呆滯品清單）
- FR-34：建議補一句 —— 「『最近一次異動』取該 (商品, 庫位) 組合在 `stock_ledger` 的最大 `occurred_at`；天數為日期差（Asia/Taipei）且 ≥ 門檻天數即列入；`on_hand = 0` 的品項不列入。」

### FR-35（初始資料匯入）
- FR-35：建議補一句 —— 「『錯誤列不影響其他列寫入』與『失敗時整批回滾』二擇一；建議改為『有任一錯誤列 → 整批不寫入，僅回傳預覽與錯誤清單，使用者修正後重跑』，並在規格中刪除原句。」
- FR-35：建議補一句 —— 「重複資料以商品編號判斷：跳過或覆寫為**全批**選項（二選一），不支援逐列指定；期初庫存匯入每筆產生一筆 `movement_type = OPENING` 的 ledger，`occurred_at` 取匯入日期（可由檔案指定，預設匯入當日）。」

### FR-36（CSV 匯出）
- FR-36：建議補一句 —— 「匯出欄位順序固定為畫面顯示順序；日期格式 `YYYY/MM/DD`、數字不加千分位、數量小數 3 位、金額小數 2 位；單次匯出上限 10,000 列並提示。」

### FR-37（REST API 與 OpenAPI）
- FR-37：建議補一句 —— 「所有端點前綴 `/api/v1`；錯誤回應統一格式 `{"error": {"code": "…", "message": "…", "details": {…}}}`；列表端點皆採 `?page=&page_size=` 分頁。」

### 跨 FR（全域）
- 全域：建議補一句 —— 「所有業務日期與時間以 **Asia/Taipei（UTC+8）** 計算與顯示；資料庫時間戳使用 `timestamptz` 儲存 UTC；所有單號的 `YYYYMMDD` 取 Asia/Taipei 當日；『今天』一律指 Asia/Taipei 的當日。」（目前 PRD 全篇未指定時區，FR-1/FR-26/FR-33/FR-34/FR-25 都依賴它。）
- 全域：建議補一句 —— 「所有數量欄位為 `numeric(18,3)`、所有金額欄位為 `numeric(18,2)`，四捨五入一律 ROUND_HALF_UP；`NULL` 語意逐欄位定義（尤其 `products.purchase_price` 為 NULL 時，FR-20 差異金額視為 0）。」

---

## (e) 過度設計與低估成本的 FR

### E1 [高] FR-30 + addendum §1.9 的 hash chain 與每日 anchor 對教學專題屬過度設計
- 成本：每筆敏感寫入需讀前一筆 `entry_hash`（C5 的臨界區）、每日排程把 `head_hash` 寫到「唯讀檔」（Windows 上「唯讀檔」僅是屬性，容易誤以為有防護力）、以及「尾端截鎖偵測不到」的說明反而會引發額外討論。
- 替代：FR-30 的驗收條件降為「append-only + `seq` 嚴格遞增 + 應用層無 UPDATE/DELETE 路徑」，hash chain 列為**選做加分**（addendum §8 風險表已列為選作，但 PRD FR-30 的驗收敘述仍是必做，兩者不一致）。**建議同步把 FR-30 的「不可竄改」驗收改寫**。

### E2 [高] FR-20 的「二級主管」+ FR-24 的「送單≠核准」+ §6「第二人覆核」構成三層審批，與教學規模不成比例
- 成本：審批矩陣、第二種管理角色、種子帳號倍增、死鎖逃逸（見 A6），且與 §10 Q8 未決互相糾纏。
- **建議**：v1 簡化為「單一核准者 ≠ 送單者」；「二級主管」降為 v2，FR-20 的門檻改為「超過門檻時需**兩位**主管各核准一次」可留待擴充，PRD 只需把 `settings` 預設門檻設為不觸發。

### E3 [中] FR-29「可設定單號格式與流水來源」是設定型功能，成本中等而教學價值低
- 需要：格式樣板引擎、格式驗證、變更不影響既有單據的版本處理、每日序號重置的計數器。
- **建議**：降為選做；v1 直接固定各單據格式（`PO-YYYYMMDD-0001`、`GR-…`、`SO-…`、`TR-…`、`ST-…`、`ADJ-…`），`settings` 仍保留 key 契約供課堂擴充。

### E4 [高] FR-35「初始資料匯入」同時扛兩個責任：種子重置與一般性資料匯入
- addendum §5 已提供 `flask seed --reset`（≤30 秒，SM-4），那才是課程真正需要的；PRD FR-35 的 CSV/Excel 匯入、預覽、錯誤列、跳過/覆寫、交易回滾則需要 openpyxl/pandas、欄位對應、錯誤隔離，估 1.5–2.5 人日。
- **建議**：FR-35 改寫為「種子資料重置與匯入器」——只支援**本系統定義的固定欄位格式 CSV**（不含 Excel、不做欄位對應 UI），錯誤列以「整批不寫入 + 錯誤清單」處理（見 D-FR-35）；一般性 Excel 匯入移 v2。

### E5 [中] FR-37「API 與網頁介面共用同一套領域規則，不存在僅在 API 可達的庫存寫入路徑」隱含「前端必須走 REST」
- 這條使前端工作量顯著上升（型別、錯誤處理、token 續期、401/403 導覽、欄位遮蔽的前後端雙重處理），且與 addendum §1.2「前端選型未定」直接衝突——技術選型沒凍結就要求前端全走 API，等於把課程第 2 堂綁死在選型上。
- **建議**：明文「v1 前端一律透過 `/api/v1` 呼叫（REST 作為唯一對外介面）」，並把前端選型凍結為預設（React + Vite + TypeScript + Ant Design + React Query），同時在 PRD §1.1 加上「待確認選項之預設值」。

### E6 [中] FR-6 單位換算會外溢到所有數量輸入、顯示、匯入與報表
- 「1 箱 = 12 罐」看似小事，但每一個數量欄位都要決定「用哪個單位輸入、如何換算、何時捨入」；FR-6 的「四捨五入至小數 3 位」若沒有「何時換算」規則，庫存數量會出現 11.9999999 這類累積誤差，直接影響 SM-3 的可還原性。
- **建議**：v1 僅支援「1 組換算（基本單位 ↔ 1 個包裝單位）」，且**只在輸入與顯示層換算，換算後數量直接存入基本單位**（§6 已如此規定，應在 FR-6 明寫「換算後立即以基本單位儲存，儲存值不為換算結果之四捨五入近似」）。

### E7 [中] FR-10 的「彙總層」與「容量上限」是兩個成本不明卻容易爆炸的機制
- 「彙總層（不直接存放）」需要一個樹狀展開器 + 寫入時驗證；「容量上限」需要一個「目前占用量」的即時計算（跨所有商品、跨批次），在 `stock_balances` 上聚合，成本高於想像。
- **建議**：v1 庫位固定兩層（倉庫 → 庫位），不實作 `is_aggregate` 的遞迴展開；`capacity` 以 `stock_balances` 之 SUM 即時計算（資料量 300 商品 × 60 庫位，可接受），但必須明文「超出時阻擋並回報占用量」。

### E8 [高] 排程不可行：addendum §6 的「第 6 堂」同時要完成 FR-17～FR-20 盤點四條 + FR-30/31 稽核兩條 + hash chain
- 依本次審查，盤點四條（範圍解析、凍結攔截、差異率、審批 + 自動調整）保守估 3–4.5 人日；稽核兩條 + hash chain + 每日 anchor 估 1.5–2 人日；兩者不可能放在同一堂。
- 加上 FR-16 調撥 + 在途（估 2–3 人日，狀態與回滾最複雜）落在第 5 堂「採購與安全水位、補貨建議、調撥與在途」同堂，第 5 堂也超載。
- **建議重排課表（8 堂）**：
  1. Schema + 遷移 + 種子 + 骨架
  2. 登入/角色/遮蔽 + 分層示範（保留）
  3. 商品與供應商主檔（保留）
  4. 庫存異動引擎（ledger + balances + 原子扣減）＋ 進貨/領用/移位
  5. 採購、安全水位、補貨建議
  6. 調撥與在途（單獨一堂）
  7. 盤點四條（範圍/凍結/差異/審核）
  8. 銷貨、彙總、匯出、OpenAPI、彩排
  稽核軌跡與 hash chain 降為**跨堂選做**（任一堂插入 1 小時）。
  另：SM-1 的 15 分鐘彩排需另外保留 1 堂複演與修正時間。

### E9 [中] SM-4「重置 ≤ 30 秒」與 FR-35 的匯入能力重疊
- `flask seed --reset` 若以 200 筆 ledger + 300 商品 + 60 庫位寫入，在 PostgreSQL 本機通常 1–3 秒，≤30 秒綽綽有餘；風險不在效能，而在「重置後的 seq/序號是否歸零」——`stock_ledger.seq`、`audit_log.seq`、`counters` 若不歸零，SM-3「無缺口」與 FR-29「流水不得重複」在重置後仍成立，但示範時單號會從 0001 變成 0800，學生容易困惑。
- **建議**：明訂重置時一併清空 `counters` 與各單據序號（回到 0001 開始），並在 FR-29 補一句「重置後序號歸零」。

### E10 [低] 「可及性：主要操作流程可完全以鍵盤完成；表格與表單具備可讀標籤」是無 FR 支撐的 NFR
- 沒有對應 FR、無驗收方式，會在評審時被問到而無從作答。
- **建議**：刪除或改寫為「表單具備 `<label>` 關聯與合理 Tab 順序（tabindex 自然序即可）」，可納入 FR-11/FR-14/FR-26 的可測試結果。

---

## 裁決請求（需課程方回覆，否則實作會卡住）

| # | 議題 | 建議預設 | 影響 FR |
| --- | --- | --- | --- |
| 1 | 單據狀態機採逐單據表 | 採納 A1 的轉移表 | FR-11/16/17/19/20/26/27/28 |
| 2 | 樂觀鎖（409）vs 悲觀鎖（FOR UPDATE） | v1 採悲觀鎖 | FR-13/14/16/26、addendum §1.8 |
| 3 | 在途是否進 ledger | 不進，並修正 FR-13/SM-3 措辭 | FR-13/16/28/33、SM-3 |
| 4 | 盤點時在途的認列 | 禁止調入確認，需先中止盤點 | FR-16/18/19 |
| 5 | 用途列舉（是否含內部損耗） | 保留三值但標註為教學擴充 | FR-14/33、§3 |
| 6 | 出庫是否要求指定庫位/批號 | 要求指定，不做自動拆分 | FR-14/26 |
| 7 | 主管角色是否拆分 / 二級主管定義 | 不拆，門檻觸發時由第二位 ADMIN 核准 | FR-20/24、§10 Q8 |
| 8 | 核取 FR 範圍（毛利/折扣）是否回填 | 依課程評分決定；回填會新增 2–3 天 | §7/§10 Q1、FR-26 |
| 9 | 部署環境：Docker Compose vs 本機既有 `Ailearn` | **擇一**（addendum §1.1 與 §5 同時存在，會讓學生把資料灌到錯的資料庫） | §5 NFR、addendum §5 |
| 10 | 課堂時程是否由 7 堂調整為 8 堂 | 採納 E8 的重排 | 全部 |

---

*審查完成。逐條 FR 的可測試結果覆蓋率初估：可直接由評審者操作驗證者約 26/37；需先補上 A1–A14 與 D 系列的一句話後方能自動化的約 9/37（FR-13/16/19/20/22/25/28/30/31）；無法在現行文件下自動化者 2/37（FR-20 二級主管、FR-29 單號設定）。*
