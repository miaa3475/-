# API 契約 — 庫存管理系統

> 前後端唯一協調基準。後端 `backend/app/api/` 與前端 `frontend/src/api.js` 都必須符合本文件。
> 回應一律 `application/json; charset=utf-8`。錯誤回應格式：`{"error": "中文訊息"}`，HTTP 狀態碼見各端點。

## 認證

- 請求需帶 `Authorization: Bearer <token>`（登入端點除外）。
- Token 過期（閒置 30 分鐘）或無效 → `401 {"error": "..."}`；角色無權限 → `403 {"error": "..."}`。
- 角色代碼：`WAREHOUSE`（倉管）、`PURCHASE`（採購）、`ADMIN`（主管）。
- **價格遮蔽**：角色為 `WAREHOUSE` 時，序列化結果移除 `purchase_price`（商品主檔）與 `unit_price`／`amount`（進貨單明細與總額）。其餘角色全部可見。遮蔽在後端序列化層完成，前端不做判斷。

## 端點

### 認證
| 方法 | 路徑 | 請求 | 回應 |
|---|---|---|---|
| POST | `/api/auth/login` | `{username, password}` | `{token, user:{id,username,display_name,role}}` |
| POST | `/api/auth/logout` | — | `{"ok":true}` |
| GET | `/api/auth/me` | — | `{user:{id,username,display_name,role}}` |

### 分類
| 方法 | 路徑 | 請求 | 回應 |
|---|---|---|---|
| GET | `/api/categories` | — | `[{id,code,name,parent_id,safety_stock,reorder_multiplier}]` |
| POST | `/api/categories` | `{code,name,parent_id?,safety_stock?,reorder_multiplier?}` | 201 物件 |
| PUT | `/api/categories/{id}` | 同上 | 物件 |

### 商品
| 方法 | 路徑 | 請求 | 回應 |
|---|---|---|---|
| GET | `/api/products` | `?q=&barcode=&category_id=&status=` | `[{id,product_code,name,barcode,category_id,category_name,unit,pack_size,conversion_factor,purchase_price,is_batch_tracked,status}]` |
| POST | `/api/products` | `{name,barcode?,category_id,unit,pack_size?,conversion_factor?,purchase_price?,is_batch_tracked?}` | 201 物件 |
| PUT | `/api/products/{id}` | 同上 | 物件 |
| POST | `/api/products/{id}/disable` | — | `{"ok":true}` |

### 供應商與報價
| 方法 | 路徑 | 請求 | 回應 |
|---|---|---|---|
| GET | `/api/suppliers` | `?q=` | `[{id,tax_id,company_name,contact_name,phone,status}]` |
| POST | `/api/suppliers` | `{tax_id,company_name,contact_name?,phone?}` | 201 物件 |
| PUT | `/api/suppliers/{id}` | 同上 | 物件 |
| GET | `/api/quotes` | `?product_id=` | `[{id,product_id,supplier_id,supplier_name,unit_price,moq,lead_time_days,valid_until}]` |
| POST | `/api/quotes` | `{product_id,supplier_id,unit_price,moq?,lead_time_days?,valid_until?}` | 201 物件 |

### 倉庫與庫位
| 方法 | 路徑 | 請求 | 回應 |
|---|---|---|---|
| GET | `/api/warehouses` | — | `[{id,code,name}]` |
| GET | `/api/locations` | `?warehouse_id=` | `[{id,warehouse_id,parent_id,code,name,is_frozen,is_aggregate,status}]` |
| GET | `/api/locations/tree` | — | `[{id,code,name,children:[...]}]` |
| POST | `/api/locations` | `{warehouse_id,parent_id?,code,name,is_aggregate?}` | 201 物件 |
| PUT | `/api/locations/{id}` | `{name?,is_frozen?,status?}` | 物件 |

### 庫存查詢與結存明細
| 方法 | 路徑 | 請求 | 回應 |
|---|---|---|---|
| GET | `/api/stock` | `?q=&barcode=&location_id=` | `[{product_id,product_code,name,barcode,batch_id,batch_no,location_id,location_code,on_hand,is_batch_tracked}]` |
| GET | `/api/stock/ledger` | `?product_id=&location_id=&batch_id=&movement_type=&from=&to=&page=` | `{total, items:[{id,seq,occurred_at,product_code,name,batch_no,location_code,movement_type,qty_delta,source_doc_type,source_doc_no,purpose,operator,override_by,override_reason}]}` |

### 進貨單
| 方法 | 路徑 | 請求 | 回應 |
|---|---|---|---|
| GET | `/api/receipts` | `?po_id=&status=&from=&to=` | `[{id,gr_no,po_id,po_no,status,received_at,operator,reason,total_amount,lines:[{id,product_id,product_code,name,batch_no,qty,expiry_date,location_id,location_code,unit_price}]}]` |
| POST | `/api/receipts` | `{po_id?,reason?,lines:[{product_id,batch_no?,expiry_date?,qty,location_id,unit_price?}]}` | 201 完整進貨單物件（同上） |
| POST | `/api/receipts/{id}/void` | `{reason}` | `{"ok":true, "new_id": 123}` |

### 領用單
| 方法 | 路徑 | 請求 | 回應 |
|---|---|---|---|
| GET | `/api/issues` | `?from=&to=` | `[{id,issue_no,status,purpose,remark,operator,occurred_at,lines:[{id,product_id,product_code,name,batch_no,qty,location_id,location_code}]}]` |
| POST | `/api/issues` | `{purpose,remark?,lines:[{product_id,batch_id?,qty,location_id}]}` | 201 `{id,issue_no,status}` |

### 移位
| 方法 | 路徑 | 請求 | 回應 |
|---|---|---|---|
| POST | `/api/stock/moves` | `{product_id,batch_id?,from_location_id,to_location_id,qty}` | 201 `{id,seq}` |

### 庫存調整
| 方法 | 路徑 | 請求 | 回應 |
|---|---|---|---|
| GET | `/api/adjustments` | `?status=` | `[{id,adj_no,status,reason_code,remark,requested_by,approved_by,created_at,lines:[{id,product_id,product_code,name,batch_no,location_id,location_code,qty_delta}]}]` |
| POST | `/api/adjustments` | `{reason_code,remark?,lines:[{product_id,batch_id?,location_id,qty_delta}]}` | 201 `{id,adj_no,status}` |
| POST | `/api/adjustments/{id}/submit` | — | `{"ok":true}` |
| POST | `/api/adjustments/{id}/approve` | `{approved:true}` | `{"ok":true}` |

### 盤點單
| 方法 | 路徑 | 請求 | 回應 |
|---|---|---|---|
| GET | `/api/stocktakes` | `?status=` | `[{id,st_no,status,scope_type,scope_id,total_diff_rate,submitted_at,created_at}]` |
| GET | `/api/stocktakes/{id}` | — | `{id,st_no,status,scope_type,scope_id,total_diff_rate,submitted_at,created_at,lines:[{id,product_id,product_code,name,batch_id,batch_no,location_id,location_code,book_qty,actual_qty,diff_qty,reason_code}]}` |
| POST | `/api/stocktakes` | `{scope_type,scope_id}`（scope_type: `LOCATION`/`CATEGORY`/`PRODUCT`） | 201 `{id,st_no,status,total_diff_rate,lines:[{id,product_id,product_code,name,batch_id,batch_no,location_id,location_code,book_qty,actual_qty,diff_qty}]}` |
| PUT | `/api/stocktakes/{id}/lines` | `{lines:[{id,actual_qty}]}` | `{"ok":true}` |
| POST | `/api/stocktakes/{id}/submit` | — | `{total_diff_rate,accuracy_rate,lines:[...含 diff_qty]}` |
| POST | `/api/stocktakes/{id}/approve` | — | `{"ok":true}` |
| POST | `/api/stocktakes/{id}/abort` | — | `{"ok":true}` |

### 採購單
| 方法 | 路徑 | 請求 | 回應 |
|---|---|---|---|
| GET | `/api/purchase/replenishment` | — | `[{product_id,product_code,name,on_hand,safety_stock,reorder_multiplier,suggested_qty,best_supplier_id,best_supplier_name,best_price}]` |
| GET | `/api/purchase/orders` | `?status=&supplier_id=` | `[{id,po_no,status,supplier_id,supplier_name,expected_date,total_amount,sent_at,approved_at,created_at,lines:[{id,product_id,product_code,name,qty_ordered,qty_received,unit_price,batch_no}]}]` |
| POST | `/api/purchase/orders` | `{supplier_id,expected_date,lines:[{product_id,qty,unit_price,batch_no?}]}` | 201 `{id,po_no,status}` |
| POST | `/api/purchase/orders/{id}/submit` | — | `{"ok":true}` |
| POST | `/api/purchase/orders/{id}/approve` | — | `{"ok":true,po_no}` |
| POST | `/api/purchase/orders/{id}/reject` | `{reason}` | `{"ok":true}` |
| POST | `/api/purchase/orders/{id}/void` | `{reason}` | `{"ok":true,new_id}` |

### 銷貨單
| 方法 | 路徑 | 請求 | 回應 |
|---|---|---|---|
| GET | `/api/sales/orders` | — | `[{id,so_no,status,customer_text,sold_by,sold_at,total_amount,lines:[{id,product_id,product_code,name,batch_no,qty,unit_price,amount,location_id,location_code}]}]` |
| POST | `/api/sales/orders` | `{customer_text?,lines:[{product_id,batch_id?,qty,unit_price,location_id}]}` | 201 `{id,so_no,status,total_amount}` |
| POST | `/api/sales/orders/{id}/void` | `{reason}` | `{"ok":true,new_id}` |

### 稽核軌跡
| 方法 | 路徑 | 請求 | 回應 |
|---|---|---|---|
| GET | `/api/audit` | `?actor_id=&object_type=&from=&to=&page=` | `{total, items:[{id,seq,occurred_at,actor,action,object_type,object_id,field_name,old_value,new_value,doc_type,doc_no}]}` |

### 進銷存彙總報表
| 方法 | 路徑 | 請求 | 回應 |
|---|---|---|---|
| GET | `/api/reports/summary` | `?from=&to=&category_id=` | `{items:[{product_id,product_code,name,category_name,in_qty,issue_qty,sale_qty,adjust_qty,net_qty}]}` |

### 使用者與角色
| 方法 | 路徑 | 請求 | 回應 |
|---|---|---|---|
| GET | `/api/users` | — | `[{id,username,display_name,role_id,role_code,role_name,is_active}]` |
| GET | `/api/users/roles` | — | `[{id,code,name}]` |
| POST | `/api/users` | `{username,password,display_name,role_id}` | 201 物件 |
| PUT | `/api/users/{id}/role` | `{role_id}` | 物件 |

### 種子資料重置
| 方法 | 路徑 | 請求 | 回應 |
|---|---|---|---|
| POST | `/api/dev/seed` | — | `{"ok":true}` |

## 種子帳號（`flask seed` 建立，密碼統一 `demo1234`）

| 帳號 | 角色 |
|---|---|
| `warehouse1` / `warehouse2` | WAREHOUSE |
| `purchase1` / `purchase2` | PURCHASE |
| `admin1` / `admin2` | ADMIN |

## 單據狀態機

| 單據 | 狀態流轉 |
|---|---|
| 採購單 | `DRAFT` → `PENDING_APPROVAL` → `APPROVED` / `REJECTED`；`APPROVED` → `VOIDED` |
| 進貨單 | `DRAFT` → `SUBMITTED`；`SUBMITTED` → `VOIDED` |
| 領用單 | `DRAFT` → `SUBMITTED`；`SUBMITTED` → `VOIDED` |
| 銷貨單 | `DRAFT` → `SUBMITTED`；`SUBMITTED` → `VOIDED` |
| 盤點單 | `IN_PROGRESS` → `SUBMITTED` → `APPROVED`；`IN_PROGRESS` → `ABORTED`；`SUBMITTED`/`APPROVED` → `VOIDED` |
| 庫存調整 | `DRAFT` → `PENDING_APPROVAL` → `APPROVED` / `REJECTED`；`APPROVED` → `VOIDED` |
