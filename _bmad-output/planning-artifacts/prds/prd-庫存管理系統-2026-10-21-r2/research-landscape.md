# 進銷存／倉儲庫存管理系統 — 領域研究報告（Research Landscape）

> PRD：`prd-庫存管理系統-2026-10-21`
> 研究日期：2026-10-21
> 研究方法：網路搜尋佐證（商用台灣 ERP 產品文件、國際 WMS/ERP 官方文件、开源專案文件、台灣法規資料庫）
> 用途：為 PRD 提供使用者角色、模組範圍、領域術語、邊界條件、MVP 建議與競品藍圖依據。

---

## 0. 摘要速讀

本研究的核心結論：

1. **「進銷存」在台灣實務上＝三本帳的聯動**：進（採購/進貨）、銷（訂單/銷貨/銷退）、存（庫存異動/盤點/調撥），三者必須與「會計帳」一致，即所謂**帳料合一**。台灣 ERP 廠商普遍把「庫存帳、會計帳、碳帳」並列為三大重點，而「存庫帳一旦關帳就應鎖控不得修改」是明確的實務原則（來源：[i-TEC ERP 進銷存管理](https://www.itecerp.com/%E9%8A%B7-%E9%8A%B7%E5%94%AE%E7%AE%A1%E7%90%86/%E9%80%B2%E9%8A%B7%E5%AD%98%E7%AE%A1%E7%90%86.html)）。
2. **本系統的關鍵差異點不是「CRUD」，而是「單據流 + 結存（stock ledger）+ 稽核軌跡」**。ERPNext 與 Odoo 的共同架構是：主檔（Item/Product、Warehouse/Location）＋ 交易單據（Stock Entry / Transfer）＋ 不可變的 Stock Ledger 結存明細 ＋ 會計分錄（GL Entry）。學生專案若只做「庫存數量欄位 += 」，將無法支撐盤點、調撥、追溯與毛利分析。
3. **最容易漏掉、但會被驗收會問倒的細節**集中在四類：（a）負庫存政策；（b）盤點期間能否出入庫；（c）採購單與進貨單的關聯與數量分批收貨；（d）多倉調撥的「在途（transit）」狀態與稽核不可竄改。
4. **務實的 MVP** 建議聚焦：商品主檔（含單位換算）＋ 供應商＋ 倉庫/儲位＋ 單一「庫存異動」單據引擎 ＋ 盤點 ＋ 安全水位 ＋ 基本報表 ＋ RBAC ＋ 稽核紀錄。多倉/批次效期/序號/多幣別列為第二階段。

---

## 1. 典型使用者角色、核心任務與最在意的指標

### 1.1 角色總覽

台灣 ERP 供應商的文件普遍以「管理作業」分層，可直接推導出角色邊界。例如 TMS ERP 的比較表將「客戶管理／產品管理／生產管理／採購管理／訂單管理／出貨管理／倉儲管理／物流串接」並列，且指出倉庫端的核心是「智能儲位管理，電腦快速盤點自動盤盈虧」（來源：[TMS ERP 進銷存系統](https://www.tmserp.com.tw/introduction_02.aspx?Mtype=0)）。i-TEC ERP 更直接點出「**權責劃分：對於倉庫人員管量不管價**」的核心原則（來源：[i-TEC ERP](https://www.itecerp.com/%E9%8A%B7-%E9%8A%B7%E5%94%AE%E7%AE%A1%E7%90%86/%E9%80%B2%E9%8A%B7%E5%AD%98%E7%AE%A1%E7%90%86.html)）。

| 角色 | 每日／每週核心任務 | 最在意的指標（KPI） | 權限邊界（台灣慣例） |
|---|---|---|---|
| **倉管人員**（倉工、倉管主管） | 收貨驗收、揀貨、補貨上架、庫位盤點、庫存異動登錄、庫存異常回報 | 庫存準確率（stock accuracy）、揀貨正確率、盤點差異率、每人每小時揀貨量、收貨到上架時間 | **管量不管價**；看不到成本與毛利；不可調主檔；盤點差異需送審 |
| **採購人員** | 請購、詢價比價、下採購單、跟催到貨、處理退貨、維護供應商與報價 | 準時交貨率（OTIF）、供應商不良率、採購價差率、缺貨率（backorder rate）、安全水位觸發準確率 | 看得到進貨成本、看不到毛利；有採購額度上限 |
| **銷售人員** | 接單、查即時可用庫存、報價、銷貨、銷退、催貨、追蹤應收 | 訂單準確率 / 準時出貨率、Fill rate、應收帳款回收天數、每筆訂單毛利（但通常看不到成本） | 看不到成本與採購價；價格需審核（限價折扣） |
| **會計人員** | 核對進銷項、登錄發票、沖帳、生成成本結轉、盤盈盤虧認列、年度盤點結轉 | 帳料合一差異數、稅額正確率、帳務關帳天數 | 可唯讀庫存金額與成本；可調成本但需審核；不可刪除已過帳單據 |
| **管理者／老闆** | 看儀表板、決策補貨與促銷、核准調撥與調整、看呆滯與毛利 | 庫存周轉率（inventory turnover）、DSI／DOOH、毛利率、GMROI、資金占用（庫存總金額）、呆滯金額占比 | 全域唯讀 + 核准權；看不到明細操作按鈕 |
| **系統管理員** | 主檔維護、權限設定、介面參數、關帳、資料備份、匯入匯出 | 資料一致性、使用者稽核完整性、備份可還原率 | 唯一可改系統參數與權限者 |

### 1.2 KPI 公式與來源

國際供應鏈文獻普遍以七項核心 KPI 描述庫存管理成效（來源：[Advotics — Supply Chain KPIs](https://advotics.com/en/blog/kpi-to-evaluate-your-supply-chain-performance)）：

| KPI | 公式 | 說明 |
|---|---|---|
| Stock accuracy（庫存準確率） | 實盤相符品項數 ÷ 實盤品項數 | 最基礎，**低庫存準確率會讓其他 KPI 全部失真** |
| Inventory turnover（庫存周轉率） | COGS ÷ 平均庫存金額 | 資金效率 |
| DSI / DOH（存貨天數） | (平均庫存 ÷ COGS) × 365，或 365 ÷ 周轉率 | 越大代表資金壓在倉庫越久（來源：[Cleverence DSI](https://www.cleverence.com/articles/for-business/average-days-to-sell-the-inventory-4827)） |
| Fill rate（供貨率） | 供貨數量 ÷ 訂單數量 | 與 backorder rate 互補 |
| Backorder rate（缺貨率） | 無法立即履行的訂單數 ÷ 總訂單數 | 庫存過低警訊 |
| Perfect order rate（完全訂單率） | (準時交付率 × 完整率 × 無破損率 × 文件正確率) × 100% | 端到端嚴格指標（來源：[NetSuite Inventory KPIs](https://www.netsuite.com/portal/resource/articles/inventory-management/inventory-management-kpis-metrics.shtml)） |
| Order cycle time（訂單 cycle time） | 客戶下單到收到貨的平均天數 | 管理者最關心的「速度」感受指標 |

**PRD 撰寫建議**：把上述 KPI 轉成系統內的具體畫面，例如「庫存準確率儀表板（依倉別／ABC 分級盤點準確率）」、「低於安全水位清單（依預估日銷量與補貨天數計算預計耗盡日）」、「呆滯分析（依分級滯銷天數：90/180/365 天）」。ERPKing（鈞陽）的報表清單即包含「庫存呆滯明細表」「庫存盤點虧表」「商品補貨建議明細表」「業務利潤明細表」「銷貨利潤分析表」等，可作為報表模組命名參考（來源：[鈞陽 DataKing 進銷存](https://www.erpking.com.tw/dataking-purchase-sales-stock)）。

**台灣特有的安全水位慣例**：安全庫存（Safety Stock）與再訂購點（Reorder Point）的台灣常見算法為：

- 安全庫存 = (尖峰日均銷量 − 平均日均銷量) × 補貨天數
- 再訂購點 = 安全庫存 + (平均日均銷量 × 補貨天數)

緩衝百分比建議從 20% 起跳（供應不穩或易爆單可拉高至 30–50%；產品穩定可降到 10–15%）。**再訂購點是「觸發下單的水位」，不是訂購量**，建議搭配經濟訂購量（EOQ）或供應商最低起訂量（MOQ）決定單次採購量（來源：[安全庫存與再訂購點計算機](https://www.ecbase.tw/t/safety-stock)）。台灣 ERP 實作上也直接支援此概念，如 TMS ERP 的「**自動安全庫存量**」「**供應商安全存量表**」「**商品補貨建議明細表**」（來源：[TMS ERP 進銷存](https://www.tmserp.com.tw/introduction_02.aspx?Mtype=0)）。

---

## 2. 核心功能模組清單

以下模組清單綜合台灣商用 ERP（TMS ERP、鈞陽 DataKing、凌越、i-TEC）與國際 WMS/ERP（ERPNext、Odoo Inventory、SAP WM、Oracle WMS、NetSuite WMS）的功能分層，作為 PRD 的模組藍圖。

### M1. 主檔與基礎資料

| 子模組 | 內容 | 參考 |
|---|---|---|
| M1.1 商品主檔（品號、品名、規格、分類、条码） | 商品基本資料、雙品名、類別樹、同系列商品批次建立（依顏色/尺寸批次建檔） | TMS ERP「同系列商品批次建立」「批次-類別」「批次-儲位」 |
| M1.2 商品分組與類別 | 大類/中類/小類；分類可用於補貨建議與分析 | TMS ERP「B-B 產品類別設定作業」 |
| M1.3 多單位與包裝換算 | 基本單位、採購單位、銷售單位、輔助單位、重量/材積；換算值維護 | 凌越「多單位換算管理」（公克/公斤、個/打/箱/盒，支援非 10 進位如斤/兩）；Odoo UoM Category + Ratio + Rounding |
| M1.4 商品屬性旗標 | 暫停出貨、暫停進貨、淘汰品、暫停傳輸（不傳盤點機）、是否啟用批號/序號管理 | TMS ERP「B 批次」 |
| M1.5 供應商主檔 | 廠商基本資料、聯絡人、付款條件、稅務編號、幣別、往來歷史 | TMS ERP「客戶廠商作業」；凌越「供應商 SRM」 |
| M1.6 客戶主檔（若納入銷售模組） | 客戶等級、信用額度、專屬售價 | TMS ERP「客戶等級型態設定」「信用查核」 |

### M2. 庫存結構（Warehouse / Location / Bin）

- **倉庫（Warehouse）**：多倉、分倉、倉別類型（實體倉／虛擬倉／在途 Transit／客貨主寄倉）。ERPNext 支援 **Warehouse 階層樹**與 **Warehouse Type = Transit（在途倉）**（來源：[ERPNext Warehouse](https://docs.frappe.io/erpnext/warehouse)）。
- **庫位 / 儲位（Location / Bin）**：倉庫下的細部存放位置，可分層（貨架 → 格 → 層）。台灣 ERP 常見「分倉代號 + 儲位代號（≤6 碼）+ 儲位名稱」的三段式（來源：[TMS ERP 庫存資料管理手冊](https://www.tmserp.com.tw/file/download/B%E5%BA%AB%E5%AD%98%E8%B3%87%E6%96%99%E7%AE%A1%E7%90%86%E4%BD%BF%E7%94%A8%E6%89%8B%E5%86%8A.pdf)）。Odoo 對應概念為 **Warehouse（倉）與 Location（庫位）分工**，並支援 `stock.location` 階層（來源：[Odoo Inventory management](https://www.odoo.com/documentation/master/applications/inventory_and_mrp/inventory/warehouses_storage/inventory_management.html)）。
- **庫位容量（Min/Max）**：Oracle 支援 item-location 的 Min qty / Max qty 與 "Reservation freeze" 凍結旗標（來源：[Oracle Creating and Maintaining Item Warehouses](https://docs.oracle.com/cd/E69185_01/cwdirect/pdf/18013/cwdirect_user_reference/WH07_08.htm)）。

### M3. 庫存異動（Stock Movement）— 系統核心

**這是整個系統的心臟，必須設計成「單據驅動 + 不可變結存明細」**，而不是直接改數量欄位。

| 異動類型 | 台灣名稱 | 說明 |
|---|---|---|
| 入庫 | 進貨單 / 收料單 / 收料檢驗單 | 可區分「無採購單進貨」與「採購單轉進貨」 |
| 退貨入庫 | 進貨退回單 / 進退料 | 退還供應商 |
| 領用 | 領料單 / 發料單 | 內部耗用（低值易耗品） |
| 銷貨 | 銷貨單 | 可由訂單拋轉，可分批出貨 |
| 銷退 | 銷貨退回單 | 客戶退貨，需決定是否回到原批號 |
| 盤盈 / 盤虧 | 盤點盈虧、庫存調整 | 經盤點或審核產生 |
| 調撥 | 調撥單（可由調撥申請核准轉單） | 內部分倉間調度 |
| 組合 / 拆解 | 組合單 / 拆解單 / Repack | 產品組合、拆貨 |
| 借出 / 借入 | 借出單 / 借入單 | 借貨還貨管理，與盤盈盤虧連動 |

**國際對照的設計模式**：

- **ERPNext** 將這些統一抽象為 **Stock Entry**，用 `purpose` 欄位區分：Material Issue / Material Receipt / Material Transfer / Material Transfer for Manufacture / Material Consumption for Manufacture / Manufacture / Repack / Send to Subcontractor / Disassemble。並可自訂 **Stock Entry Type**（例如「報廢單」目的仍是 Material Transfer，但可限制只有特定角色可提交）（來源：[ERPNext Stock Entry](https://docs.frappe.io/erpnext/stock-entry)、[Stock Entry Purpose](https://docs.frappe.io/erpnext/stock-entry-purpose)）。
- **Odoo** 則以 **操作類型（Operation Types）+ 多步驟路由（Routes / Push-Pull Rules）** 組合：One-step / Two-step / Three-step receipt & delivery（例如 Three-step receipt = Input → Quality → Stock），並以 **Virtual Locations**（虛擬庫位）表達輸入區、輸出區、跨dock、在途（來源：[Odoo Inventory](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory.html)）。
- **SAP WM** 的抽象更細：Movement Type（101 進貨…）＋ **Transfer Requirement（TR，調撥需求）** 與 **Transfer Order（TO，調撥單）** 兩段式，且明確支援 **Negative Stock（負庫存）** 於暫存區，使「WM 先上架、IM 後過帳」可行（來源：[SAP Warehouse Movements](https://help.sap.com/docs/SAP_ERP/34fc810a607e4ae5a287b6e233b8566f/248fc95360267214e10000000a174cb4.html)）。
- **NetSuite WMS** 以 bin management、cycle counting、return authorization receipts、wave transactions 為主軸（來源：[NetSuite WMS](https://www.netsuite.com/portal/products/erp/warehouse-fulfillment/wms.shtml)）。

### M4. 進貨（採購）

- 請購單 → 詢價／比價 → **採購單（Purchase Order）** → **收料單／檢驗單** → **進貨單（Goods Receipt）** → **進貨退回**。
- 關鍵設計：**採購單與進貨單是兩張單**，進貨單可引用（link）採購單，支援**分批收貨**與**數量累計核對**（訂單量 vs 已收量 vs 未收量）。TMS ERP 有「採購單據跟催查詢」「採購訂單未出查詢」「採購單批次處理」「收料檢驗設定／收料單／收料檢驗單／異常處理單／收料退回單」，是台灣標準分工（來源：[TMS ERP](https://www.tmserp.com.tw/introduction_02.aspx?Mtype=0)）。
- **自動補貨**：依安全水位／再訂購點自動建議採購量（ERPKing「商品補貨建議明細表」、TMS「智慧型自動採購」）。

### M5. 銷貨（銷售）

- 訂單 → 揀貨單 → 驗貨 → 出貨單 → 銷貨單 → 銷退貨 → 開立發票。
- **可用量（Available）而非單純現存量**的扣減是關鍵：Oracle 的定義為
  `Quantity Available = On hand − Protected − Reserved − Reserve transfer − Backordered`
  （來源：[Oracle Reviewing Reservation Types](https://docs.oracle.com/cd/F38747_01/oroms/pdf/210/cws_help/master/Reviewing_Reservation_Types/Reviewing_Reservation_Types.htm)）。這是 PRD 裡最容易被忽略、但主管一定會問的公式。
- 庫存量低於安全值或信用額度不足時的**警訊/硬控管**（ERPKing「控管出貨」；TMS「品項超收、低於或高於庫存水位的警訊提醒」）。

### M6. 盤點與庫存調整

- **盤點（Physical Inventory）**：全盤、抽盤（cycle count）、ABC 分級盤點（凌越「ABC 等級盤點管理」）。
- **盤點精靈**：ERPKing「特殊的盤點精靈，加速盤點作業與盤差調整」；TMS 提供「智慧型盤點系統（手機/平板/EXCEL）」「盤點機」「保存批號盤點」。
- **盤盈虧差異處理**：需有**差異原因碼（reason code）**、**差異會計科目（盤盈入、盤虧出）**、**差異審核流程**與**容差設定**（小於 X% 自動核准）。
- **盤點期間能否出入庫** → 見 §4.2。
- ERPNext 的 **Stock Reconciliation** 同時支援「期初盤點（Opening Stock）」與「實際盤點對帳」，並支援 CSV 批次匯入與條碼掃描對帳；差異科目預設為 *Stock Adjustment*（來源：[ERPNext Stock Reconciliation](https://docs.frappe.io/erpnext/stock-reconciliation)）。

### M7. 調撥／調貨（多倉）

- **調撥申請 → 核准 → 調撥單 → 出庫 → 在途 → 入庫**。TMS ERP 的「B-D-A 庫存調撥申請處理（經由申請→核准的程序調撥產品，並轉成調撥單）」是台灣標準作法的直接證據（來源：[TMS ERP 庫存資料管理手冊](https://www.tmserp.com.tw/file/download/B%E5%BA%AB%E5%AD%98%E8%B3%87%E6%96%99%E7%AE%A1%E7%90%86%E4%BD%BF%E7%94%A8%E6%89%8B%E5%86%8A.pdf)）。
- **在途（In-Transit）**：ERPNext 提供 `Add to Transit` 勾選 + Transit 型態的 Warehouse，使調撥產生兩段 Stock Entry（出庫至在途倉、目的地入庫），目的地可**分批收貨**並以 `per_transferred` 追蹤百分比（來源：[ERPNext Stock Entry](https://docs.frappe.io/erpnext/stock-entry)、[frappe/erpnext stock_entry.py](https://github.com/frappe/erpnext/blob/develop/erpnext/stock/doctype/stock_entry/stock_entry.py)）。
- **權限**：可依倉庫設定檢視／編輯／提交權限（來源：[ERPNext 多倉調撥流程](https://nexeves.com/blog/ERPNext/multi-warehouse-inter-warehouse-transfer-flow-in-erpnext)）。

### M8. 批次、效期、序號（批次追溯）

- **批號／批次（Batch / Lot）**：入庫時產生或指定，含製造日期、有效期限（到期日）、製造批號；出貨可指定批號成本出貨（TMS「產品批號指定成本出貨」）。
- **序號（Serial No）**：序號商品，每一實體有唯一序號；ERPNext 可於進貨時自動產生序號（Serial Number Series）與自動建立批次（Automatically Create New Batch）（來源：[ERPNext Stock Reconciliation](https://docs.frappe.io/erpnext/stock-reconciliation)）。
- **FEFO（先到期先出）**：Odoo 的 Removal Strategies 提供 FIFO / LIFO / **FEFO** / Closest location / Least packages（來源：[Odoo Inventory](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory.html)）。食品業更是法規要求：**「倉儲作業應遵行先進先出之原則，並確實記錄」**（來源：[食品良好衛生規範準則 第六條](https://mlunch.nat.gov.tw/manasystem/files/law/1071026162106_FS_%E9%A3%9F%E5%93%81%E8%89%AF%E5%A5%BD%E8%A1%9B%E7%94%9F%E8%A6%8F%E7%AF%84%E6%BA%96%E5%89%87%E6%BA%96%E5%89%87%E6%A2%9D%E6%96%87%5b1%5d.pdf)）。

### M9. 安全水位與補貨

- 安全庫存量、再訂購點、經濟訂購量、最小起訂量、供應商交期（lead time）。
- **補貨建議報表**（TMS「供應商安全存量表」「商品補貨建議明細表／彙總表」；Odoo 有 Reordering rules 與 Replenishment report）。
- **不足存量報告**（凌越「不足安全存量報表」「具備不足存量轉採購作業」）。

### M10. 成本、毛利與會計對接

- **成本計算方法**：移動平均（Moving Average）、FIFO（批次成本）、標準成本、LIFO。
  - 移動平均公式：`新平均 = (原數量 × 原均價 + 進貨數量 × 進貨單價) ÷ (原數量 + 進貨數量)`；出貨按當期均價計價，不影響均價。
  - FIFO：出貨先取最早入庫的層(layer)，各層保留原始成本。
  - 來源：[ERPNext FIFO and Moving Average](https://docs.frappe.io/erpnext/fifo-and-moving-average)、[Valuation rate 計算差異](https://docs.frappe.io/erpnext/calculation-of-valuation-rate-in-fifo-and-moving-average.md)、[ERPNext Stock Settings](https://docs.frappe.io/erpnext/stock-settings)。
- **永續盤存制（Perpetual Inventory）**：每一筆庫存異動同時產生 Stock Ledger Entry 與 General Ledger Entry（來源：[ERPNext Perpetual Inventory](https://docs.frappe.io/erpnext/perpetual-inventory)）。
- **毛利**：銷貨單毛利分析、業務利潤明細表、客戶/商品/類別毛利分析（ERPKing「銷貨利潤分析表」「業務利潤明細表」；TMS「銷貨單毛利分析」；凌越「成本/利潤估算、利潤中心績效管控」）。

### M11. 稅務與發票（台灣專屬）

- **稅別**：應稅（多數 5%）、零稅率（出口、國際運輸、供應保稅區營業人使用之貨物勞務）、免稅（醫療、教育、部分金融、售土地等）— 營業稅法第 7、8 條（來源：[加值型及非加值型營業稅法解析](https://account.hkpro.tw/news-info.asp?id=505)、[臺北國稅局 — 營業稅](https://www.ntbt.gov.tw/multiplehtml/7905a940ba314d6cb73a0dab4017a692)）。
- **發票類型**：統一發票（B2B 三聯式／B2C）、電子發票、收銀機發票、免用統一發票；特殊情形含折讓證明單、作廢發票（來源：[Avalara Taiwan VAT guide](https://www.avalara.com/us/en/vatlive/country-guides/asia/taiwan/taiwanese-vat-rates-and-compliance.html)）。
- **電子發票整合服務平台**：財政部提供 B2B 存證電子發票，營業人須準備工商憑證、申請發票字軌、註冊登錄、取號設定（來源：[財政部全球資訊網](https://www.mof.gov.tw/singlehtml/384fb3077bb349ea973e7fc6f13b6974?cntId=ae30f3b2312f46368f4995c104aa1dfc)）。
- **發票號碼連續性、作廢、折讓**需可追蹤，否則申報作業會被國稅局退件。

### M12. 多幣別

- 台灣 ERP 普遍支援多幣別、每日匯率、進口拆價（FOB 分攤運費/保險/報關費入商品成本）。TMS「外幣採購支付及進口商品入帳自動拆價功能」；凌越「多國幣別、匯率金額及多種收付款模式，不同幣別可設定不同的單價/小計/合計小數位數」。
- **成本**應以交易當日匯率折算（base currency），報表層顯示原幣與本幣。

### M13. 權限與資料隔離

- **功能權限**：依角色控制單據可用作業（ERPKing「庫存量低於安全值或信用額度不足時，可設定提示或控管是否出貨」）。
- **欄位級權限**：i-TEC「倉庫人員管量不管價」→ 成本欄位對倉管隱藏；凌越「銷貨單價、成本瀏覽權限控管」。
- **資料範圍隔離（Data Isolation）**：Odoo 以三機制達成多公司隔離：`company_id` 欄位、**Record Rules**、**Allowed Companies**；常見漏洞是自訂模型未加 record rule、record rule 被停用、以及 `sudo()` 繞過規則（應改用 `with_company()`）（來源：[Odoo Multi-Company Data Leak 修復](https://deploymonkey.com/blog/odoo-multi-company-data-leak-fix)）。
- **依倉庫／分倉的存取範圍**：ERP「管理作業」層級的權限設定（TMS「庫存資料-人員操作權限設定」）。

### M14. 稽核軌跡（Audit Trail）

- **誰、在何時、做了什麼、改了哪個欄位（舊值→新值）、從哪個 IP 進來**。
- Odoo 生態系有 OCA 官方的 **Audit Log** 模組（可依 model 訂閱 create/read/write/delete 記錄規則，並有自動清理排程）與多個商用稽核模組（field-level 舊值/新值、不可變更、專屬 Audit Manager 角色、記錄匯出行為）（來源：[OCA Audit Log](https://apps.odoo.com/apps/modules/18.0/auditlog)、[Audit Log & Access Tracking](https://apps.odoo.com/apps/modules/19.0/wt_audit_log)）。
- **不可竄改的技術做法**：append-only + **雜湊鏈（hash chain）**，每筆紀錄 commit 前一筆的 hash，任何竄改/刪除/重排都會被 `verify_chain()` 偵測並指出斷點索引；併發寫入需以鎖序列化 append 以避免分叉（來源：[Building an Append-Only Hash-Chained Audit Log](https://github.com/utility-billing/utilitybilling.org/blob/main/content/billing-reconciliation-audit-logging/gasb-audit-trail-compliance-patterns/building-an-append-only-hash-chained-audit-log/index.md)、[K-riti/AuditTrail](https://github.com/K-riti/AuditTrail)）。
- **注意盲點**：雜湊鏈可偵測「修改、重排、中段刪除」，但**偵測不到尾端截斷**（刪掉最新幾筆仍是一致的前綴），因此需要把 head hash **外部錨定**（例如每日快照/異地備份）才能閉環（來源：[audit-log（Node）](https://github.com/pametan/audit-log)）。

### M15. 報表與匯出

- 台灣 ERP 報表家族（可作為命名對照）：庫存彙總表、分庫存量表、倉庫存量表、庫存異動明細帳、進銷存彙總表、庫存盤點虧表、庫存盤盈虧表、庫存呆滯明細表、調撥明細表、調整明細表、商品批號庫存明細表/期限管制表/異動追蹤表、採購未出查詢、補貨建議表、銷貨利潤分析表。
- **匯出格式**：ERPKing 支援 Word / Excel / PDF / CSV / JPG；Odoo 支援 CSV / Excel / PDF；學生專案建議至少支援 **CSV（UTF-8 with BOM，避免 Excel 開啟中文亂碼）** 與 Excel。

---

## 3. 台灣常見領域術語表

| 中文術語 | 英文／系統對應 | 說明與注意事項 |
|---|---|---|
| 品號 / 商品編號 | SKU / Item Code | 系統唯一鍵 |
| 商品主檔 | Item Master / Product Master | 含類別、單位、批號旗標、稅別 |
| 庫存帳 / 結存明細 | Stock Ledger / Stock Ledger Entry | 不可變的異動明細帳，是盤點與追溯的基礎 |
| 現存量 | On-hand Quantity | 實際持有數量 |
| 可用量 | Available Quantity | = 現存 − 已保留 − 凍結 − 退貨待處理 − 在途扣減 |
| 已保留量 | Reserved Quantity | 已被訂單占用 |
| 安全庫存量 | Safety Stock | 緩衝庫存 |
| 再訂購點 | Reorder Point (ROP) | = 安全庫存 + 日均銷量 × 補貨天數 |
| 補貨天數 / 交期 | Lead Time | 供應商下單到收貨 |
| 經濟訂購量 | EOQ | 單次最佳採購量 |
| 最低起訂量 | MOQ | 供應商限制 |
| 分倉 | Warehouse / 分公司倉庫 | 台灣慣用「分倉」指同一公司多個實體倉庫 |
| 儲位 / 庫位 | Bin / Location / Storage Location | 倉庫內細部存放位置；三段式代號 |
| 在途 | In-Transit / Transit | 調撥已出未到；需獨立倉別或狀態 |
| 調撥單 | Stock Transfer / Transfer Order | 內部倉間移轉 |
| 調撥申請 | Transfer Request / Material Request | 需核准的調撥請求 |
| 盤點 | Physical Inventory / Stock Take | 全盤 |
| 抽盤 | Cycle Count | 定期盤部分品項 |
| 盤盈 / 盤虧 | Surplus / Shortage | 需原因碼與審核 |
| 庫存調整 | Inventory Adjustment | 單筆手動調整 |
| 批號 / 批次 | Batch No / Lot No | 一批進貨識別碼 |
| 保存期限 / 效期 | Expiry Date / Shelf Life | 台灣食品法規用「保存期限」，實務也說「效期」 |
| 有效日期 | Expiration Date | 食安法施行細則第 13 條要求標示；保存期限 3 個月以上者可僅標年月並以月末日為終止日（來源：[健康遠見 — 食藥署說明](https://health.gvm.com.tw/article/87533)） |
| 序號 | Serial No | 唯一序號商品管理 |
| 先進先出 | FIFO | 依入庫順序出貨；食品倉儲法規要求 |
| 先到期先出 | FEFO | 依效期出貨；Odoo 支援 |
| 移動平均成本 | Moving Average | 出貨按加權平均成本 |
| 批次成本 | FIFO / Layered Cost | 依批次層計算 |
| 標準成本 | Standard Cost | 預設固定成本 |
| 單位成本 | Valuation Rate / Unit Cost | 評價單價 |
| 售價 | Sales Price | 可分級（大盤/中盤/小盤/企業/VIP） |
| 毛利 | Gross Margin | 售價 − 單位成本 |
| 毛利率 | Gross Margin % | 毛利 ÷ 售價 |
| 稅別 | Tax Type | 應稅（多數 5%）/ 零稅率 / 免稅 |
| 統一發票 | Uniform Invoice | 三聯式（甲乙丙） |
| 電子發票 | e-invoice | 含 B2B 存證 |
| 銷項稅 / 進項稅 | Output VAT / Input VAT | 應納稅額 = 銷項 − 進項 |
| 折讓證明單 | Credit Note | 銷退/折扣的稅憑 |
| 幣別 / 匯率 | Currency / Exchange Rate | 台灣 ERP 常設「每日匯率設定」 |
| 帳料合一 | Stock & Books Reconciliation | 庫存帳與會計帳一致；關帳後鎖控不得修改 |
| 關帳 / 期末作業 | Period Closing | 鎖定期間不可再改 |
| 防呆 | Error Prevention | 超收、超領、負庫存等即時警訊 |
| 留抵稅額 | Input VAT Credit | 進項 > 銷項時可留抵 |
| 寄庫 / 寄售 | Consignment | 商品寄放他方或他方寄放本方；須在報表口徑中明確納入或排除 |
| 借貨 | Loan / Rental | 借出/借入，含跟催報表 |
| 拆貨 / 組合 | Repack / BOM Assembly | 拆解與組裝 |
| 六定原則 | 6M / 定品定位定量定容定置定人 | i-TEC 提到的倉儲管理原則（+ APS 後加第 7 定「定時」） |

---

## 4. 實務上常見但容易漏掉的需求細節與邊界條件

> 這是本報告價值最高的一節。每一條都附上外部證據或業界共識。

### 4.1 負庫存是否允許？

- **業界分歧，但主流建議為「不允許」**：
  - Oracle 明確：「You cannot enter a transaction that will make the on-hand quantity negative.」（來源：[Oracle WITI](https://docs.oracle.com/en/industries/retail/retail-oms-suite-cloud/26.2.301.0/romoh/WITI.htm)）
  - ERPNext：負庫存可在公司層級允許或禁止，「Best practice is to disable it」（來源：[ERPNext 多倉調撥流程](https://nexeves.com/blog/ERPNext/multi-warehouse-inter-warehouse-transfer-flow-in-erpnext)）。
  - SAP WM 支援在暫存區管理負庫存，讓「WM 先上架、IM 後過帳」可行。
  - 台灣 ERP 普遍提供「庫存計算」開關：ERPKing「防止沒有庫存卻打銷貨單的情形，**若不需計算庫存也可關閉提醒**」（來源：[鈞陽 DataKing](https://www.erpking.com.tw/dataking-purchase-sales-stock)）。
- **PRD 建議**：設定為**系統參數（公司層級）可切換**，預設「不允許負庫存」，並在阻擋時提供「是否仍要繼續？」的覆核路徑（需具備特定權限 + 留下紀錄）。另外補一句容易被忽略的：**回溯（backdated）單據**會讓「當時允許負庫存」與「事後看是負的」產生矛盾，PRD 需定義回溯日期的處理規則。

### 4.2 盤點期間能否出入庫？

- **這是盤點設計的核心決策，PRD 必須明文回答**。常見三種模式：
  1. **凍結模式（Freeze）**：盤點期間鎖定該倉/該品項的所有異動。優點：帳實最準；缺點：作業停擺。SAP、Oracle 都提供「Freeze」旗標（Reservation freeze / item location frozen），Oracle 說明凍結後揀貨單不會印出該品項、且訂單仍會保留該品項（來源：[Oracle WITI](https://docs.oracle.com/en/industries/retail/retail-oms-suite-cloud/26.2.301.0/romoh/WITI.htm)）。
  2. **動態盤點（Smart Count / 不凍結）**：**盤點開始時固定基準數量**，盤點期間的異動被系統記錄，結束時自動比對。NetSuite Smart Count 描述最清楚：「The inventory level used for the count is taken at the time the count starts for each individual item... automatically alerts counters so they can react appropriately」（來源：[NetSuite WMS - Cycle Counting](https://www.netsuite.com/portal/products/erp/warehouse-fulfillment/wms.shtml)）。SYSPRO 亦有對應機制：**差異超過設定的 % 則要求重盤**（Cycle count variance %）（來源：[SYSPRO WMS Cycle Counts PDF](https://help.syspro.com/syspro-8-2026-r2/resources/pdfs/syspro-8-wms-cycle-counts-reference-guide.pdf)）。
  3. **快照法**：盤點結束取一次系統現存與實盤比較，期間異動不影響（但差異會被高估）。
- **PRD 建議**：實作模式 2（動態盤點 + 基準凍結時間 + 期中異動追蹤 + 差異門檻重盤），並明確列出「盤點期間哪些作業被阻擋」（例如：該倉的調撥出庫、盤盈虧以外的調整單）。Dynamics 365 亦提供 "Allow pallet moves during cycle counting" 這種細部開關供 PRD 參考（來源：[Dynamics 365 Cycle Counting](https://learn.microsoft.com/en-us/dynamics365/supply-chain/warehousing/cycle-counting)）。

### 4.3 採購單與進貨單的關聯

- 兩張單、單向引用：**採購單（PO）→ 進貨單（GRN）**，進貨單帶入 PO 編號與未交量。
- **分批收貨**：同一 PO 可對應多張進貨單；需計算「訂單量 / 已收量 / 未收量 / 超收量」。台灣系統普遍具備：TMS「採購單據跟催查詢」「採購訂單未出查詢」；ERPKing「收料單」「收料檢驗單」「異常處理單」「收料退回單」「進貨單」「進貨退回單」。
- **超收容差**：需定義允許超收的 %（i-TEC 明確列出「品項超收…警訊提醒」）。
- **逆向單據**：進貨退回單必須反向沖回庫存與成本，且要能追溯到原進貨單。

### 4.4 銷貨退貨（銷退）

- 銷退必須能追溯到**原銷貨單**，且決定：
  - 退回**入哪個批號**（同批號 / 新批號 / 不良品倉）
  - 退回**是否重新上架**（可售 / 待檢 / 報廢）
  - **是否沖回成本**（影響毛利）與**是否產生銷項稅額調整**
- 需有「退貨率」與「退貨原因」統計（KPI 之一：rate of return 與其原因趨勢）。

### 4.5 庫存調整審核

- 調整單應有：**原因碼（報廢／損壞／失竊／樣品／試用／盤盈虧／其他）**、**申請人 vs 核准人分離**、**金額門檻自動核准**。
- 台灣實務已有完整制度：TMS「**借轉盤虧**」「**借入轉盤盈**」顯示借貸與盤盈虧在流程上互相連結；ERPKing 有「調整類別設定」。
- 成本影響：盤盈需入「盤盈科目」，盤虧需沖「存貨跌價損失」或「管銷費用」；會計需可指定差異會計科目（ERPNext 預設 *Stock Adjustment*）。

### 4.6 多倉調撥的在途（In-Transit）

- **發出即減、到貨才增**，否則總量在途中不平。
- 在途需可見於「全公司庫存總表」但不可計入「目的地可用量」。
- 到貨可能**分批**（ERPNext `per_transferred`）、可能**短溢**（需盤盈盤虧或退運處理）。
- 若採 **Transit 虛擬倉** 方案，必須確保報表不會把在途誤算為任一實體倉的可用庫存（Odoo 用 Virtual Locations 解決此問題）。

### 4.7 權限與資料隔離

- 三層：功能（能不能進這個作業）→ 欄位（能不能看成本/毛利）→ 資料範圍（能看哪些倉/哪些公司）。
- **自訂模組漏掉 record rule 是最常見的越權來源**；`sudo()` 會繞過所有規則（來源：[Odoo Multi-Company Data Leak](https://deploymonkey.com/blog/odoo-multi-company-data-leak-fix)）。
- 建議：PRD 寫入「**每張表與每支 API 都必須受公司/倉庫範圍過濾**」，並把「跨公司查詢」列為需明文授權的功能。

### 4.8 稽核紀錄不可竄改

- 需求不只是「有 log」，而是：**append-only + 欄位級舊值/新值 + 完整 actor/時間/IP + 任何竄改可被偵測**。
- 實作選項：
  - 基本版：DB trigger 禁止 UPDATE/DELETE on audit table + DB 帳號權限分離。
  - 進階版：**hash chain**（每筆含 prevHash）＋ `verify_chain()` 定期檢查＋ **head hash 外部錨定**（每日 head 寫入唯讀檔案或異地備份），以補上「尾端截斷」的盲點。
  - 事件溯源（Event Sourcing）：狀態由事件重播推導，天然不可竄改（來源：[K-riti/AuditTrail](https://github.com/K-riti/AuditTrail)）。
- **隱私/權限**：稽核紀錄本身的檢視權限應獨立於一般管理員（Odoo 商用模組普遍設專屬 Audit Manager 角色）。
- 保留期限：需可設定（Odoo OCA Audit Log 預設 180 天自動清除；食品業要求相關紀錄保存至少 5 年）。

### 4.9 併發／多人同時異動

- 兩名倉管同時對同一品項出貨 → 兩者都讀到存量 10，各自出 8 → 結果 -6 但系統記 2 → **遺失更新（Lost Update）**。
- 解法：
  - **樂觀鎖（Optimistic Concurrency）**：`version` 欄位，更新時檢查版本，不符則拒絕（Odoo、ERPNext、Django REST framework 皆預設使用；K-riti AuditTrail 以 Version 欄位 + unique constraint 實作）。學生專案在單一框架（Spring Data JPA `@Version`、Django `select_for_update`、SQLAlchemy `version_id_col`）下即可獲得。
  - **悲觀鎖（Pessimistic Lock）**：`SELECT ... FOR UPDATE` 鎖定庫存列，適合熱門品項。
  - **資料庫層級約束**：庫存欄位 `CHECK (qty >= 0)` 兜底。
  - **冪等性（Idempotency）**：前端重複送出同一張單需以單號唯一性 + request id 去重，避免重複扣帳。
- **單據狀態機**：草稿 → 送審 → 已核准 → 已過帳 → 已作廢；只有「已過帳」會影響結存，「作廢」必須以反向單據沖回，不可直接刪除。

### 4.10 成本計算：移動平均 vs 批次成本

- 選型影響很大，PRD 應讓「每個商品」可設定計價方式（ERPNext 的做法：Item 上設定 valuation method，Stock Settings 提供預設值 FIFO / Moving Average / LIFO）（來源：[ERPNext Stock Settings](https://docs.frappe.io/erpnext/stock-settings)）。
- 兩者對毛利與報表的差異（官方範例）：

| 交易 | 數量 | 單位成本 | 說明 |
|---|---|---|---|
| 4/1 進貨 | 10 | 100 | |
| 4/6 進貨 | 20 | 120 | |
| 4/10 銷貨 | 15 | ? | |

- **FIFO**：取 10×100 + 5×120 = **1,600**；剩餘 15 件 @120 = 1,800。
- **移動平均**：平均 = (10×100 + 20×120) ÷ 30 = **113.33**；銷貨 15 × 113.33 = **1,700**；剩餘 15 × 113.33 = 1,700。
- 總金額相同（3,400），但**毛利與期末存貨價值不同** → 影響會計與稅務申報。來源：[ERPNext Valuation Rate 計算差異](https://docs.frappe.io/erpnext/calculation-of-valuation-rate-in-fifo-and-moving-average.md)。
- **回溯單據（backdated）**在 FIFO 會導致「成本需要重算（repost）」，在移動平均則會導致均價連鎖改寫；PRD 需定義回溯的處理與重算機制（來源：[ERPNext FIFO and Moving Average — backdated entries](https://docs.frappe.io/erpnext/fifo-and-moving-average)）。
- **實務建議**：學生專案採「**全局移動平均 + 可選批次**」即可涵蓋 90% 需求，成本模型簡單、報表即時。

### 4.11 其他常見但易漏的細節

| # | 細節 | 說明 / 來源 |
|---|---|---|
| a | **期初庫存** | 系統上線時需有「庫存數量期初設定」作業（TMS「B-L 庫存數量期初設定」）；ERPNext 以 Stock Reconciliation 的 Opening Stock 目的處理 |
| b | **商品停用 / 淘汰品** | 停用商品不能被新單據引用，但歷史與庫存仍需保留（TMS「淘汰品：庫存總數為 0 時才可勾選」） |
| c | **零庫存自動下架** | 電商情境下庫存 ≤ 0 自動下架，但有「持續上架」旗標優先（TMS 網管資料設定） |
| d | **空值與零的語意** | 「無庫存」與「庫存為 0」在可用量計算中意義不同 |
| e | **四捨五入與小數位** | 單位換算時的 rounding 規則（Odoo 有 `rounding` 精度與 rounding method：UP / HALF-UP）；非 10 進位單位（斤/兩）換算會產生小數（凌越支援） |
| f | **多包裝單位** | 12 個/箱、箱/打；是否允許「只reserve整箱」（Odoo: Reserve Only Full Packagings / Reserve Partial Packagings） |
| g | **效期即期品通知** | 到期前 N 天自動警示與通知（TMS「即期品主動到期通知」「即期品自動通知」）；ERP 業界另有「30/60/90 天到期報表」 |
| h | **過期品禁止出貨** | ERPNext 可在交易層級自動阻擋過期品銷售；食品業必須 |
| i | **食品追溯與保存年限** | 食品業者應保存原料/半成品/成品來源文件**至少 5 年**（109 年 1 月 1 日實施；未保存可罰 3 萬–300 萬元）（來源：[實施保存產品來源文件法規說明](https://www.fda.gov.tw/tc/includes/GetFile.ashx?id=f639083017326230405)）；追溯憑證須保存至**有效日期後 6 個月**（來源：[食品及其相關產品追溯追蹤系統管理辦法](https://www.fda.gov.tw/tc/includes/GetFile.ashx?id=f636694223442315469)）；食品業紀錄/電子資料庫至少保存 5 年（[食品良好衛生規範準則 第十二條](https://mlunch.nat.gov.tw/manasystem/files/law/1071026162106_FS_%E9%A3%9F%E5%93%81%E8%89%AF%E5%A5%BD%E8%A1%9B%E7%94%9F%E8%A6%8F%E7%AF%84%E6%BA%96%E5%89%87%E6%BA%96%E5%89%87%E6%A2%9D%E6%96%87%5b1%5d.pdf)） |
| j | **寄倉/寄售/借貨** | 這些數量**不屬於公司所有**，毛利與庫存金額計算需明確排除或分列（Odoo 提供 Consignment 功能；台灣 TMS 與凌越皆有寄庫/借貨模組） |
| k | **多公司/合併報表** | 母子公司合併報表、公司合併分析（凌越「公司合併報表」） |
| n | **成本回溯與重算** | 「重新過帳-庫存異動明細檔」「重計-現有庫存量檔」為維護作業（ERPKing） |
| o | **資料匯入/匯出與對帳** | Excel 批次匯入商品/儲位/盤盈虧單（TMS）；ERPKing 支援 Word/Excel/PDF/CSV/JPG 匯出 |
| p | **鎖單與結帳期間** | 帳料合一：關帳後鎖控不得修改（i-TEC）；單據一經過帳即不可刪除，只能作廢並沖回 |

---

## 5. 學生／作品集階段的務實 MVP 範圍建議

### 5.1 業界對「MVP」的既有定義（可引用的基準）

- 中小實作商務的 **MVP-scope engagement：6–10 週**，功能界定為：SKU/庫位/庫存量管理、收貨/調整/調撥流程、低庫存警示與可搜尋歷史、倉管與管理員角色權限、可稽核的變更歷史（來源：[Simicode Inventory Management](https://simicode.org/services/inventory-management)）。
- No-code 產品的庫存 MVP 時程：**3–6 週**；功能分級為 MVP（商品資料庫、庫存量、基本警示）與進階（多庫位、採購單、條碼整合、預測）（來源：[Goodspeed Studio — Build an Inventory Tracker with Bubble](https://goodspeed.studio/blog/build-inventory-tracker-bubble)、[13Labs](https://www.13labs.au/build/inventory-management)）。
- 學生/教學專案的典型模組：商品、供應商、庫存異動、採購單、庫存警示 + 報表/CSV 匯出 + 稽核紀錄 + 種子資料 + Docker + Swagger（來源：[CSEProjects360/barcode-management-system](https://github.com/CSEProjects360/26CP360WEBMGMT0024-barcode-management-system)）。
- Odoo 客製專案的實作路線圖（很好的分期範例）：Phase 1 庫位階層與限制 → Phase 2 FIFO 出庫策略 → Phase 3 條碼（收/發/標籤列印）→ Phase 4 損壞/維修/退貨；Stretch：多倉路由、ABC 分析、供應商評分（來源：[udhay8005/Inventory-management roadmap](https://github.com/udhay8005/Inventory-management/blob/main/docs/09-roadmap.md)）。
- 全端小型專案的技術棧範例：FastAPI + SQLAlchemy + Streamlit + PostgreSQL + Docker + Alembic，並強調「**數量更新採版本控制（version-controlled quantity updates）**」與「重複零件偵測」（來源：[zoiehou/inventory-management-app](https://github.com/zoiehou/inventory-management-app)）。

### 5.2 建議的 PRD MVP 分層

**MVP（必做，作品集有說服力的最小集合）**

1. **主檔**：商品（含類別、基本/採購/銷售單位與換算）、供應商、倉庫、儲位、使用者與角色。
2. **庫存異動引擎**：單一「庫存異動單據」模型，具 `type`（進貨/銷貨/領用/調整/盤盈虧/調撥）、來源/目標倉庫、數量、單位成本、批號（選填）、備註、**狀態機（草稿/已過帳/已作廢）**、**作廢以反向沖回而非刪除**。
3. **不可變結存明細（Stock Ledger）**：每次過帳寫入一筆異動明細（倉庫、商品、批號、數量±、單位成本、結存數量），並由明細推導現存量。**這是本系統技術含量最高、也最能展示專業度的部分。**
4. **盤點**：建立盤點單 → 輸入實盤量 → 產生盤盈/盤虧差異 → 差異需審核 → 過帳。支援盤點期間鎖定該倉出入（凍結模式為最簡實作）。
5. **調撥**：單一調撥單，發出即減、到貨即增（可在途標記），支援**分批收貨**。
6. **安全水位與補貨**：商品設安全存量/再訂購點，產出「低於水位清單」與「建議補貨量」。
7. **成本**：全局移動平均（可加簡化 FIFO 說明）；銷貨時自動帶出成本並計算毛利。
8. **報表**：現存量（依倉/商品）、庫存異動明細、進銷存彙總、盤點差異、銷貨毛利、低於水位清單。**支援 CSV 匯出（UTF-8 BOM）。**
9. **權限**：三角色（管理員/倉管/採購或管理層）+ 欄位級隱藏（倉管看不到成本與毛利）。
10. **稽核紀錄**：所有新增/修改/刪除/過帳寫入 append-only 稽核表，含 actor、時間、動作、對象、舊值/新值；**稽核表僅可讀、不可改刪**。
11. **基礎非功能**：Docker 一鍵啟動、種子資料、Swagger/OpenAPI、README 與操作說明。

**第二階段（Stretch，視時間加做）**

- 批次/效期 + FEFO 出貨 + 到期警示
- 序號商品
- 條碼（QR）掃描收/發/盤
- 採購單 → 進貨單 分批收貨 + 未交量跟催
- 訂單/銷貨單/銷退
- 多幣別與匯率
- 稅別與發票資訊（可只做欄位與計算，實際開票對接不做）
- 動態盤點（期中異動追蹤 + 差異門檻重盤）
- 權限細分到倉庫層級 + 多公司隔離
- 儀表板（庫存準確率、周轉率、DSI、呆滯金額）

**明確建議不做（除非有額外時間）**

- 條碼標籤列印排版、RF 終端、ASRS
- 生產/BOM/MRP、委外加工、租賃/借貸/寄售
- POS、串接電商平台 API、ERP 對接
- 電子發票實際開立（保留欄位與稅額計算即可）
- 碳帳、碳排計算

### 5.3 可寫進 PRD 的合理非功能需求（NFR）

> 學生作品的 NFR 不必寫得像招標文件，但要有「數字」且可被驗收。以下數字係依常見小型系統實務與業界基準擬定，屬**合理務實值**。

| 類別 | 需求（建議寫法） | 參考 |
|---|---|---|
| **效能** | 一般列表/查詢頁首屏回應 ≤ 2 秒（P95）；庫存現存量查詢（10 萬筆以內）≤ 1 秒；報表匯出 5 萬筆 ≤ 10 秒 | 一般 Web 系統 UX 基準 |
| **資料量級** | 支援商品 50,000 筆、供應商 5,000 筆、庫存結存明細 5,000,000 筆、單據 200,000 筆；單一倉 SKU 10,000 筆 | 依台灣中小企業/校園規模擬定 |
| **併發** | 至少支援 20 個同時連線使用者；同一品項的庫存更新採樂觀鎖（version 欄位），衝突時回應明確錯誤訊息而非靜默覆寫 | §4.9 |
| **可用性** | 核心異動作業（進貨/銷貨/盤點/調撥）可用性 ≥ 99.5%；系統需在資料庫中斷時明確報錯且不產生部分寫入（交易 Transactional） | |
| **離線/網路不穩** | 條碼掃描盤點需支援「離線暫存 → 連線後自動同步」；離線期間的盤點資料不得覆蓋線上較新版本（以版本號/時間戳衝突偵測）；提供明確的衝突提示 | 倉儲現場 Wi-Fi 常不穩；TMS 有「賣場盤點轉訂單」離線下單功能 |
| **稽核不可竄改** | 稽核紀錄僅可新增（append-only），應用程式帳號無 UPDATE/DELETE 權限；提供完整性檢查功能，偵測到竄改時回報斷點紀錄 | §4.8 |
| **可追溯性** | 任一商品可由「結存明細」回溯到造成該筆存量的所有單據與操作者（單向 & 反向皆可） | 台灣法規：食品追溯、藥品溯源 |
| **備份與還原** | 支援每日自動備份（DB + 上傳檔案），保留 30 天；備份須可還原驗證；至少一份離機/異地備份 | 進銷存＝財務資料，備份是基本要求 |
| **匯出** | 所有報表可匯出 CSV（UTF-8 with BOM，Excel 可直接開啟）與 Excel（.xlsx）；匯出內容包含查詢條件與產生時間 | |
| **相容性** | 支援 Chrome / Edge 最新兩個版本；響應式設計，平板（768–1024px）可完成收發與盤點作業 | 倉管現場多用平板 |
| **資安** | 密碼以加鹽雜湊儲存；登入失敗鎖定；所有異動 API 需驗證身分與權限；支援 HTTPS | |
| **可維護性** | 程式碼需附 README、ERD、種子資料、Swagger/OpenAPI、單元測試涵蓋結存計算與成本計算等核心邏輯 | 作品集評量重點 |
| **在地化** | 介面繁體中文；日期 `YYYY/MM/DD`；金額千分位、幣別符號；CSV 匯出以 UTF-8 BOM 編碼 | 台灣環境 |
| **法規保留** | 稽核與單據紀錄保存期限可設定（預設 ≥ 5 年，符合食品/藥品業要求） | [食品良好衛生規範準則 第十二條](https://mlunch.nat.gov.tw/manasystem/files/law/1071026162106_FS_%E9%A3%9F%E5%93%81%E8%89%AF%E5%A5%BD%E8%A1%9B%E7%94%9F%E8%A6%8F%E7%AF%84%E6%BA%96%E5%89%87%E6%BA%96%E5%89%87%E6%A2%9D%E6%96%87%5b1%5d.pdf) |

---

## 6. 可借鑑的開源／商用產品藍圖

### 6.1 ERPNext（開源，GPL-3；Blueprint 參考首選）

**模組組織**（`stock` 子模組）：

```
Stock
├── Item / Item Group / Item Attribute         商品主檔、分類、屬性
├── Warehouse（支援階層樹 + Warehouse Type: Transit / Work in Progress）
├── Bin                                        庫位（含庫存數量）
├── Serial No / Batch（Serial and Batch Bundle）批次序號
├── UOM + UOM Conversion Detail                多單位換算
├── Stock Entry（+ Stock Entry Type + Purpose） 異動單據引擎
├── Stock Reconciliation                        盤點/期初
├── Stock Ledger Entry                          不可變結存明細 ★
├── Delivery Note / Pick List / Packing List    出貨流程
├── Purchase Receipt / Material Request         進貨與請購
├── Landed Cost Voucher                         到岸成本分攤
├── Item Valuation（FIFO / Moving Average / Standard）
└── Stock Settings / Stock Entry Type / Warehouse Type
```

**值得直接借鏡的設計**：
1. **單一 Stock Entry + purpose 欄位**取代十幾張獨立單據表 → 資料模型極簡，報表與權限統一。
2. **Stock Ledger Entry 為 append-only 結存明細**，現存量是它的投影 → 天然支援追溯與重算。
3. **Warehouse Type = Transit** 實現多倉調撥在途。
4. **Serial and Batch Bundle** 統一處理批次/序號的多對多關聯（比「批次表 + 序號表 + 中間表」更容易實作）。
5. **Stock Entry Type 可自訂**並綁定用途 → 天然對應台灣的「領料單/報廢單/拆貨單」。

來源：[ERPNext Stock Entry](https://docs.frappe.io/erpnext/stock-entry)、[Stock Entry Purpose](https://docs.frappe.io/erpnext/stock-entry-purpose)、[Stock Reconciliation](https://docs.frappe.io/erpnext/stock-reconciliation)、[Warehouse](https://docs.frappe.io/erpnext/warehouse)、[Stock Settings](https://docs.frappe.io/erpnext/stock-settings)、[Perpetual Inventory](https://docs.frappe.io/erpnext/perpetual-inventory)、[FIFO and Moving Average](https://docs.frappe.io/erpnext/fifo-and-moving-average)。

### 6.2 Odoo Inventory（開源 + 企業版；產品化程度最高）

**模組組織**（Inventory & MRP 應用）：

```
Inventory
├── Products（Product type: Storable / Consumable / Service）
│   ├── Units of Measure / UoM Categories（Ratio + Rounding）
│   ├── Packagings（產品/供應商層級包裝）
│   ├── Product Tracking（No Tracking / Lot / Serial）
│   └── Expiration dates
├── Warehouses & Locations
│   ├── Operation Types（多步驟收發：Input → Quality → Stock）
│   ├── Routes & Push/Pull Rules
│   ├── Storage Categories、Putaway Rules
│   ├── Removal Strategies（FIFO / LIFO / FEFO / Closest / Least packages）
│   └── Virtual Locations（輸入、輸出、跨dock、在途）
├── Inventory Adjustments / Cycle Counts
├── Reordering Rules / Replenishment / MTO
├── Scrap / Consignment（寄售）/ Landed Costs
├── Stock Valuation（自動成本 vs 手動成本）
├── Reporting（Forecasted / Stock / Locations / Moves History）
└── Barcode App（條碼掃描收發盤）
```

**值得直接借鏡的設計**：
1. **Warehouse 與 Location 分層**：Warehouse 負責「流程與路由」，Location 負責「物理存放」，虛擬 Location 表達暫存/在途。這個分工讓多倉與多步驟流程的擴充成本很低。
2. **Operation Types + 多步驟路由** → 一套引擎撐起「一步/兩步/三步收發」。
3. **Removal Strategies 抽象** → 成本出庫與揀貨順序統一由策略決定。
4. **Replenishment Report**（預估）而非只有「低於水位」→ 更貼近補貨決策。

來源：[Odoo Inventory 19.0](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory.html)、[Units of measure](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/product_management/configure/uom.html)、[Packaging](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/product_management/configure/packaging.html)、[Inventory management](https://www.odoo.com/documentation/master/applications/inventory_and_mrp/inventory/warehouses_storage/inventory_management.html)。

### 6.3 台灣商用 ERP（領域用語與流程的最佳藍圖）

| 產品 | 可借鏡處 | 網址 |
|---|---|---|
| **TMS ERP 進銷存** | 庫存子系統 16 項作業的完整分工（產品倉庫設定、產品類別、產品基本資料、庫存調撥單據、盤點盈虧、產品成本調整、期初設定、盤點盈虧報表、預估成本異動、銷管成本類別…）；調撥「申請→核准→轉單」；多單位換算值維護；批號指定成本出貨 | [功能介紹](https://www.tmserp.com.tw/MainFunction.aspx) ／ [進銷存系統](https://www.tmserp.com.tw/introduction_02.aspx?Mtype=0) ／ [庫存資料管理手冊 PDF](https://www.tmserp.com.tw/file/download/B%E5%BA%AB%E5%AD%98%E8%B3%87%E6%96%99%E7%AE%A1%E7%90%86%E4%BD%BF%E7%94%A8%E6%89%8B%E5%86%8A.pdf) |
| **鈞陽 DataKing / 鼎新 e-GO** | 「進銷存必備 10 大功能」清單；盤點精靈；防呆控管出貨；報表命名體系（分庫存量表、庫存呆滯明細表、庫存盤點虧表、調撥明細表…）；編碼管理（ISO 表單編號） | [DataKing 進銷存](https://www.erpking.com.tw/dataking-purchase-sales-stock) |
| **凌越 ERP 進銷存** | 多公司/多部門/多幣別/多倉；商品單位/輔助單位/數量轉換（含非 10 進位）；ABC 等級盤點；批次/效期/序號；寄售寄庫；利潤中心；外銷 OBU | [凌越進銷存](https://www.lyserp.com/Lywebsite/lyProduct/Product-STK_01.htm) |
| **i-TEC ERP** | 「六定原則」；權責劃分（管量不管價）；帳料合一與關帳鎖控；現庫存/途程庫存/預估庫存三層概念；警訊提醒（超收、水位） | [i-TEC 進銷存管理](https://www.itecerp.com/%E9%8A%B7-%E9%8A%B7%E5%94%AE%E7%AE%A1%E7%90%86/%E9%80%B2%E9%8A%B7%E5%AD%98%E7%AE%A1%E7%90%86.html) |
| **TMS 保存批號、效期管理** | 符合衛福部溯源要求（非登不可/非追不可）、即期品到期通知、撿貨自動配置最近到期日批號、批號分倉存盤點、批號驗貨 | [保存批號、效期管理](https://erp.ktnet.com.tw/introduction_31.aspx?Mtype=1) |

### 6.4 其他國際參考（流程與機制的細節來源）

| 產品 | 可借鏡處 | 網址 |
|---|---|---|
| **SAP WM** | Movement Type + TR/TO 兩段式；暫存區負庫存；倉儲結構細分到 storage bin | [Warehouse Movements](https://help.sap.com/docs/SAP_ERP/34fc810a607e4ae5a287b6e233b8566f/248fc95360267214e10000000a174cb4.html) |
| **NetSuite WMS** | Smart Count（盤點基準凍結 + 期中異動提示）；Bin Management；Return Authorization | [NetSuite WMS](https://www.netsuite.com/portal/products/erp/warehouse-fulfillment/wms.shtml) |
| **Oracle WMS** | 循環盤點與揀貨任務交錯；差異% 觸發 LPN 重盤；Freeze 旗標 | [Oracle WMS Implementation Guide](https://docs.oracle.com/cd/E18727-01/doc.121/e13434/T210618T210766.htm) |
| **SYSPRO WMS** | Cycle Count 任務化、變異% 重盤流程 | [SYSPRO Cycle Counts PDF](https://help.syspro.com/syspro-8-2026-r2/resources/pdfs/syspro-8-wms-cycle-counts-reference-guide.pdf) |
| **Dynamics 365 SCM** | 盤點工作自動產生（依門檻參數）、Location profile 層級設定 | [Cycle Counting](https://learn.microsoft.com/en-us/dynamics365/supply-chain/warehousing/cycle-counting) |
| **Ximple ERP** | 11 個核心整合模組（會計、銷售、庫存、倉儲 WMS、採購、供應鏈、供應商管理、營運、員工、CRM、B2B 電商）共用單一資料庫 | [Ximple ERP](https://www.ximplesolution.com/erp-product) |

### 6.5 供學生專案參考的開源實作

| 專案 | 用途 |
|---|---|
| [udhay8005/Inventory-management](https://github.com/udhay8005/Inventory-management) | Odoo 客製的 WMS 擴充，含庫位階層限制、FIFO 出貨策略、條碼收發 wizard、損壞/維修/退貨，以及明確的 Phase 分期路線圖 — **分期規劃的最佳範本** |
| [zoiehou/inventory-management-app](https://github.com/zoiehou/inventory-management-app) | FastAPI + SQLAlchemy + Streamlit + PostgreSQL + Docker + Alembic，強調**數量更新的版本控制**與重複零件偵測 — **小型全端專案的技術棧與 API 設計範本** |
| [CSEProjects360/barcode-management-system](https://github.com/CSEProjects360/26CP360WEBMGMT0024-barcode-management-system) | 教學型模組骨架：商品/供應商/庫存異動/採購單/庫存警示 + 報表/CSV + 稽核 + 種子資料 + Swagger + Docker — **PRD 功能邊界的現成藍圖** |
| [K-riti/AuditTrail](https://github.com/K-riti/AuditTrail) | 事件溯源 + CQRS + 樂觀併發 + append-only 稽核的完整範例 — **稽核與併發控制的實作參考** |

---

## 7. 給 PRD 撰寫者的具體提醒（Checklist）

- [ ] PRD 中每個模組都標註了**來源單據**與**影響的結存方向**（+/-）。
- [ ] 明確回答「負庫存是否允許」，並說明可切換性與覆核流程。
- [ ] 明確回答「盤點期間能否出入庫」，並描述盤點基準如何取得、差異如何計算與審核。
- [ ] 說明採購單與進貨單的關聯、分批收貨與超收容差。
- [ ] 銷退的批號歸屬、可售狀態與成本沖回規則已定義。
- [ ] 多倉調撥有「在途」狀態與總量平衡說明。
- [ ] 權限同時涵蓋功能、欄位（成本/毛利）、資料範圍（倉/公司）三層。
- [ ] 稽核紀錄為 append-only，且寫明了完整性檢查方式與保留期限。
- [ ] 成本計價方式（移動平均／FIFO）與回溯單據處理已定義。
- [ ] 術語表與 UI 用字一致（台灣慣用詞：分倉、儲位、盤盈盤虧、調撥單、銷退、批號/效期、安全庫存）。
- [ ] NFR 有具體數字，且可被驗收（回應時間、資料量級、併發數、備份保留天數）。
- [ ] 資料匯出格式（CSV UTF-8 BOM / Excel）已指定。
- [ ] MVP 與第二階段功能邊界明確，並說明被排除項目的理由。

---

## 8. 來源網址總覽

### 8.1 台灣商用 ERP / 領域文件
1. TMS ERP — 進銷存系統功能介紹：https://www.tmserp.com.tw/introduction_02.aspx?Mtype=0
2. TMS ERP — 庫存資料管理操作說明手冊（PDF）：https://www.tmserp.com.tw/file/download/B%E5%BA%AB%E5%AD%98%E8%B3%87%E6%96%99%E7%AE%A1%E7%90%86%E4%BD%BF%E7%94%A8%E6%89%8B%E5%86%8A.pdf
3. TMS ERP — 功能介紹：https://www.tmserp.com.tw/MainFunction.aspx
4. TMS ERP — 行業適用（物流倉儲業／WMS）：https://tmserp.com.tw/industry_07.aspx
5. TMS ERP — 保存批號、效期管理：https://erp.ktnet.com.tw/introduction_31.aspx?Mtype=1
6. 鈞陽 DataKing — 進銷存管理系統：https://www.erpking.com.tw/dataking-purchase-sales-stock
7. 凌越 ERP — 進銷存系統：https://www.lyserp.com/Lywebsite/lyProduct/Product-STK_01.htm
8. i-TEC ERP — 進銷存管理系統：https://www.itecerp.com/%E9%8A%B7-%E9%8A%B7%E5%94%AE%E7%AE%A1%E7%90%86/%E9%80%B2%E9%8A%B7%E5%AD%98%E7%AE%A1%E7%90%86.html
9. Ximple ERP — 核心模組：https://www.ximplesolution.com/erp-product

### 8.2 開源 ERP / WMS
10. ERPNext — Stock Entry：https://docs.frappe.io/erpnext/stock-entry
11. ERPNext — Stock Entry Purpose：https://docs.frappe.io/erpnext/stock-entry-purpose
12. ERPNext — Stock Reconciliation：https://docs.frappe.io/erpnext/stock-reconciliation
13. ERPNext — Warehouse：https://docs.frappe.io/erpnext/warehouse
14. ERPNext — Stock Settings：https://docs.frappe.io/erpnext/stock-settings
15. ERPNext — Perpetual Inventory：https://docs.frappe.io/erpnext/perpetual-inventory
16. ERPNext — FIFO and Moving Average：https://docs.frappe.io/erpnext/fifo-and-moving-average
17. ERPNext — Valuation Rate 計算差異：https://docs.frappe.io/erpnext/calculation-of-valuation-rate-in-fifo-and-moving-average.md
18. frappe/erpnext — stock_entry.py（Add to Transit / per_transferred 原始碼）：https://github.com/frappe/erpnext/blob/develop/erpnext/stock/doctype/stock_entry/stock_entry.py
19. ERPNext — 多倉與跨倉調撥流程：https://nexeves.com/blog/ERPNext/multi-warehouse-inter-warehouse-transfer-flow-in-erpnext
20. Odoo 19 — Inventory 文件：https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory.html
21. Odoo — Inventory management（Warehouse vs Location）：https://www.odoo.com/documentation/master/applications/inventory_and_mrp/inventory/warehouses_storage/inventory_management.html
22. Odoo 19 — Units of measure：https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/product_management/configure/uom.html
23. Odoo 19 — Packaging：https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/product_management/configure/packaging.html
24. Odoo — UoM 原始碼（factor / rounding / 換算）：https://github.com/odoo/odoo/blob/20.0/addons/uom/models/uom_uom.py
25. OCA — Audit Log：https://apps.odoo.com/apps/modules/18.0/auditlog
26. Odoo Apps — Audit Log & Access Tracking：https://apps.odoo.com/apps/modules/19.0/wt_audit_log
27. Odoo — Multi-Company Data Leak 修復與 Record Rules：https://deploymonkey.com/blog/odoo-multi-company-data-leak-fix

### 8.3 國際商用 WMS
28. SAP — Warehouse Movements（含負庫存、TR/TO）：https://help.sap.com/docs/SAP_ERP/34fc810a607e4ae5a287b6e233b8566f/248fc95360267214e10000000a174cb4.html
29. SAP — Movement Types in WM：https://help.sap.com/docs/SAP_ERP/34fc810a607e4ae5a287b6e233b8566f/2a8fc95360267214e10000000a174cb4.html
30. NetSuite — WMS：https://www.netsuite.com/portal/products/erp/warehouse-fulfillment/wms.shtml
31. NetSuite — Inventory Management KPIs：https://www.netsuite.com/portal/resource/articles/inventory-management/inventory-management-kpis-metrics.shtml
32. Oracle — Working with Inventory Transactions（負庫存禁止、Freeze 旗標）：https://docs.oracle.com/en/industries/retail/retail-oms-suite-cloud/26.2.301.0/romoh/WITI.htm
33. Oracle — Reviewing Reservation Types（可用量公式）：https://docs.oracle.com/cd/F38747_01/oroms/pdf/210/cws_help/master/Reviewing_Reservation_Types/Reviewing_Reservation_Types.htm
34. Oracle — Creating and Maintaining Item Warehouses：https://docs.oracle.com/cd/E69185_01/cwdirect/pdf/18013/cwdirect_user_reference/WH07_08.htm
35. Oracle — Warehouse Management Implementation Guide：https://docs.oracle.com/cd/E18727-01/doc.121/e13434/T210618T210766.htm
36. SYSPRO — WMS Cycle Counts（PDF）：https://help.syspro.com/syspro-8-2026-r2/resources/pdfs/syspro-8-wms-cycle-counts-reference-guide.pdf
37. Dynamics 365 — Cycle Counting：https://learn.microsoft.com/en-us/dynamics365/supply-chain/warehousing/cycle-counting
38. Dynamics 365 — Shelf Life / Batch Expiry：https://learn.microsoft.com/sl-si/dynamics365/supply-chain/master-planning/planning-optimization/shelf-life
39. Infor SyteLine — Inventory Control（負數異動驗證）：https://docs.infor.com/csi/9.01.x/en-us/useradminlist/csbi_9.01.x_inventory_user_op_sl_en-us_50332.pdf

### 8.4 KPI / 方法論
40. Advotics — Supply Chain KPIs：https://advotics.com/en/blog/kpi-to-evaluate-your-supply-chain-performance
41. Cleverence — DSI 指標：https://www.cleverence.com/articles/for-business/average-days-to-sell-the-inventory-4827
42. Cleverence — 庫存周轉率：https://www.cleverence.com/articles/for-business/inventory-turnover-explained-4821
43. 安全庫存與再訂購點計算機：https://www.ecbase.tw/t/safety-stock
44. ism.ws — Warehouse KPIs：https://www.ism.ws/logistics/warehouse-kpi

### 8.5 台灣法規與稅務
45. 臺北國稅局 — 營業稅：https://www.ntbt.gov.tw/multiplehtml/7905a940ba314d6cb73a0dab4017a692
46. 財政部全球資訊網 — 電子發票整合服務平台：https://www.mof.gov.tw/singlehtml/384fb3077bb349ea973e7fc6f13b6974?cntId=ae30f3b2312f46368f4995c104aa1dfc
47. Avalara — Taiwanese VAT rates and compliance：https://www.avalara.com/us/en/vatlive/country-guides/asia/taiwan/taiwanese-vat-rates-and-compliance.html
48. 點擊時代 — 加值型及非加值型營業稅法解析：https://account.hkpro.tw/news-info.asp?id=505
49. 食藥署 — 食品良好衛生規範準則（PDF）：https://mlunch.nat.gov.tw/manasystem/files/law/1071026162106_FS_%E9%A3%9F%E5%93%81%E8%89%AF%E5%A5%BD%E8%A1%9B%E7%94%9F%E8%A6%8F%E7%AF%84%E6%BA%96%E5%89%87%E6%BA%96%E5%89%87%E6%A2%9D%E6%96%87%5b1%5d.pdf
50. 食藥署 — 食品及其相關產品追溯追蹤系統管理辦法：https://www.fda.gov.tw/tc/includes/GetFile.ashx?id=f636694223442315469
51. 食藥署 — 實施保存產品來源文件法規說明：https://www.fda.gov.tw/tc/includes/GetFile.ashx?id=f639083017326230405
52. 健康遠見 — 食藥署解答有效日期標示（保存期限 3 個月以上以月末日為終止日）：https://health.gvm.com.tw/article/87533

### 8.6 稽核 / 併發 / 學生專案參考實作
53. Building an Append-Only Hash-Chained Audit Log：https://github.com/utility-billing/utilitybilling.org/blob/main/content/billing-reconciliation-audit-logging/gasb-audit-trail-compliance-patterns/building-an-append-only-hash-chained-audit-log/index.md
54. K-riti/AuditTrail（事件溯源 + CQRS + 樂觀併發）：https://github.com/K-riti/AuditTrail
55. pametan/audit-log（Node，hash chain + head 錨定盲點）：https://github.com/pametan/audit-log
56. udhay8005/Inventory-management（Odoo WMS 擴充 + 分期路線圖）：https://github.com/udhay8005/Inventory-management/blob/main/docs/09-roadmap.md
57. zoiehou/inventory-management-app（FastAPI 全端）：https://github.com/zoiehou/inventory-management-app
58. CSEProjects360/barcode-management-system（學生專案骨架）：https://github.com/CSEProjects360/26CP360WEBMGMT0024-barcode-management-system
59. Simicode — Inventory Management（MVP 範圍與時程）：https://simicode.org/services/inventory-management
60. Goodspeed Studio — Build an Inventory Tracker（MVP 3–6 週）：https://goodspeed.studio/blog/build-inventory-tracker-bubble

---

*本研究僅供 PRD 撰寫參考；涉及稅務、發票與食品安全法規之實際適用，建議由會計師與法規專業人士確認。*
