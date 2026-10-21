"""核心流程與邊界案例測試（對應 PRD §4 與 spec 的 I/O 矩陣）。"""

from conftest import auth, location_id, login


# --- 認證與權限 ----------------------------------------------------------
def test_login_success_and_me(client):
    token = login(client, "wh")
    response = client.get("/api/auth/me", headers=auth(token))
    assert response.status_code == 200
    assert response.get_json()["user"]["role"] == "WAREHOUSE"


def test_login_wrong_password_does_not_reveal_account(client):
    response = client.post(
        "/api/auth/login", json={"username": "wh", "password": "wrong"}
    )
    assert response.status_code == 401
    assert response.get_json()["error"] == "帳號或密碼錯誤"


def test_missing_token_returns_401(client):
    assert client.get("/api/products").status_code == 401


def test_invalid_token_returns_401(client):
    assert client.get("/api/products", headers=auth("nope")).status_code == 401


def test_role_restriction_returns_403(client):
    token = login(client, "wh")
    response = client.get("/api/audit", headers=auth(token))
    assert response.status_code == 403


def test_price_masking_for_warehouse(client):
    token = login(client, "wh")
    products = client.get("/api/products", headers=auth(token)).get_json()
    assert products
    assert all("purchase_price" not in p for p in products)


def test_price_visible_for_admin(client):
    token = login(client, "ad1")
    products = client.get("/api/products", headers=auth(token)).get_json()
    assert all("purchase_price" in p for p in products)


# --- 商品主檔 ------------------------------------------------------------
def test_create_product_auto_code(client):
    token = login(client, "pc")
    response = client.post(
        "/api/products",
        headers=auth(token),
        json={"name": "新商品", "barcode": "999", "category_id": 1, "unit": "箱"},
    )
    assert response.status_code == 201
    assert response.get_json()["product_code"].startswith("P-")


def test_duplicate_barcode_rejected(client):
    token = login(client, "pc")
    response = client.post(
        "/api/products",
        headers=auth(token),
        json={"name": "重複條碼", "barcode": "47100000001", "category_id": 1, "unit": "箱"},
    )
    assert response.status_code == 400
    assert "已被其他商品使用" in response.get_json()["error"]


def test_supplier_tax_id_validation(client):
    token = login(client, "pc")
    response = client.post(
        "/api/suppliers",
        headers=auth(token),
        json={"tax_id": "123", "company_name": "測試供應商"},
    )
    assert response.status_code == 400


# --- 庫存異動 ------------------------------------------------------------
def test_receipt_increases_stock_and_writes_ledger(client):
    token = login(client, "wh")
    loc = location_id(client, token, "A-01-01")
    response = client.post(
        "/api/receipts",
        headers=auth(token),
        json={
            "reason": "期初測試",
            "lines": [{"product_id": 1, "qty": 10, "location_id": loc}],
        },
    )
    assert response.status_code == 201, response.get_json()

    stock = client.get("/api/stock", headers=auth(token)).get_json()
    total = sum(item["on_hand"] for item in stock if item["product_id"] == 1)
    assert total == 10

    ledger = client.get("/api/stock/ledger", headers=auth(token)).get_json()
    assert ledger["total"] == 1
    assert ledger["items"][0]["qty_delta"] == 10


def test_receipt_requires_batch_no_for_batch_tracked_product(client):
    token = login(client, "wh")
    loc = location_id(client, token, "A-01-01")
    response = client.post(
        "/api/receipts",
        headers=auth(token),
        json={"lines": [{"product_id": 2, "qty": 5, "location_id": loc}]},
    )
    assert response.status_code == 400
    assert "批號" in response.get_json()["error"]


def test_issue_beyond_available_stock_rejected(client):
    token = login(client, "wh")
    loc = location_id(client, token, "A-01-01")
    client.post(
        "/api/receipts",
        headers=auth(token),
        json={"lines": [{"product_id": 1, "qty": 5, "location_id": loc}]},
    )
    response = client.post(
        "/api/issues",
        headers=auth(token),
        json={
            "purpose": "INTERNAL_LOSS",
            "lines": [{"product_id": 1, "qty": 10, "location_id": loc}],
        },
    )
    assert response.status_code == 400
    assert "可用庫存不足" in response.get_json()["error"]


def test_issue_purpose_cannot_be_sale(client):
    token = login(client, "wh")
    loc = location_id(client, token, "A-01-01")
    response = client.post(
        "/api/issues",
        headers=auth(token),
        json={
            "purpose": "SALE",
            "lines": [{"product_id": 1, "qty": 1, "location_id": loc}],
        },
    )
    assert response.status_code == 400


def test_move_between_locations_keeps_total(client):
    token = login(client, "wh")
    loc_a = location_id(client, token, "A-01-01")
    loc_b = location_id(client, token, "A-01-02")
    client.post(
        "/api/receipts",
        headers=auth(token),
        json={"lines": [{"product_id": 1, "qty": 8, "location_id": loc_a}]},
    )
    response = client.post(
        "/api/stock/moves",
        headers=auth(token),
        json={
            "product_id": 1,
            "from_location_id": loc_a,
            "to_location_id": loc_b,
            "qty": 3,
        },
    )
    assert response.status_code == 201, response.get_json()

    stock = client.get("/api/stock", headers=auth(token)).get_json()
    by_location = {i["location_id"]: i["on_hand"] for i in stock if i["product_id"] == 1}
    assert by_location[loc_a] == 5
    assert by_location[loc_b] == 3
    assert sum(by_location.values()) == 8


def test_move_to_frozen_location_rejected(client):
    token = login(client, "ad1")
    loc_a = location_id(client, token, "A-01-01")
    loc_b = location_id(client, token, "A-01-02")
    client.put(f"/api/locations/{loc_b}", headers=auth(token), json={"is_frozen": True})
    response = client.post(
        "/api/stock/moves",
        headers=auth(token),
        json={
            "product_id": 1,
            "from_location_id": loc_a,
            "to_location_id": loc_b,
            "qty": 1,
        },
    )
    assert response.status_code == 400
    assert "凍結" in response.get_json()["error"]


def test_ledger_sum_equals_on_hand(client):
    """SM-3：任一庫存數字都能由結存明細逐筆加總還原。"""
    token = login(client, "wh")
    loc = location_id(client, token, "A-01-01")
    client.post(
        "/api/receipts",
        headers=auth(token),
        json={"lines": [{"product_id": 1, "qty": 12, "location_id": loc}]},
    )
    client.post(
        "/api/issues",
        headers=auth(token),
        json={
            "purpose": "OTHER",
            "lines": [{"product_id": 1, "qty": 4, "location_id": loc}],
        },
    )
    stock = client.get("/api/stock", headers=auth(token)).get_json()
    on_hand = sum(i["on_hand"] for i in stock if i["product_id"] == 1)
    ledger = client.get(
        "/api/stock/ledger?product_id=1", headers=auth(token)
    ).get_json()
    ledger_sum = sum(i["qty_delta"] for i in ledger["items"])
    assert ledger_sum == on_hand == 8


# --- 採購與第二人覆核 ----------------------------------------------------
def test_purchase_order_flow_and_second_person_rule(client):
    pc = login(client, "pc")
    ad1 = login(client, "ad1")
    ad2 = login(client, "ad2")

    created = client.post(
        "/api/purchase/orders",
        headers=auth(pc),
        json={
            "supplier_id": 1,
            "expected_date": "2026-11-01",
            "lines": [{"product_id": 1, "qty": 20, "unit_price": 95}],
        },
    )
    assert created.status_code == 201, created.get_json()
    po_id = created.get_json()["id"]
    assert created.get_json()["po_no"].startswith("PO-")

    assert client.post(f"/api/purchase/orders/{po_id}/submit", headers=auth(pc)).status_code == 200

    # 送單者本人不可核准
    self_approve = client.post(f"/api/purchase/orders/{po_id}/approve", headers=auth(pc))
    assert self_approve.status_code == 403  # 採購角色無核准權限

    approved = client.post(f"/api/purchase/orders/{po_id}/approve", headers=auth(ad2))
    assert approved.status_code == 200, approved.get_json()


def test_replenishment_lists_low_stock_items(client):
    pc = login(client, "pc")
    response = client.get("/api/purchase/replenishment", headers=auth(pc))
    assert response.status_code == 200
    items = response.get_json()
    assert items
    for item in items:
        assert item["on_hand"] < item["safety_stock"]
        assert item["suggested_qty"] >= 1


# --- 盤點 ----------------------------------------------------------------
def test_stocktake_freeze_blocks_movement(client):
    wh = login(client, "wh")
    loc = location_id(client, wh, "A-01-01")
    client.post(
        "/api/receipts",
        headers=auth(wh),
        json={"lines": [{"product_id": 1, "qty": 10, "location_id": loc}]},
    )
    created = client.post(
        "/api/stocktakes", headers=auth(wh), json={"scope_type": "LOCATION", "scope_id": loc}
    )
    assert created.status_code == 201, created.get_json()

    blocked = client.post(
        "/api/receipts",
        headers=auth(wh),
        json={"lines": [{"product_id": 1, "qty": 1, "location_id": loc}]},
    )
    assert blocked.status_code == 400
    assert "盤點" in blocked.get_json()["error"]


def test_stocktake_submit_requires_all_quantities(client):
    wh = login(client, "wh")
    loc = location_id(client, wh, "A-01-01")
    client.post(
        "/api/receipts",
        headers=auth(wh),
        json={"lines": [{"product_id": 1, "qty": 10, "location_id": loc}]},
    )
    created = client.post(
        "/api/stocktakes", headers=auth(wh), json={"scope_type": "LOCATION", "scope_id": loc}
    )
    st_id = created.get_json()["id"]
    response = client.post(f"/api/stocktakes/{st_id}/submit", headers=auth(wh))
    assert response.status_code == 400
    assert "實盤數量" in response.get_json()["error"]


def test_stocktake_approve_creates_adjustment(client):
    wh = login(client, "wh")
    ad1 = login(client, "ad1")
    loc = location_id(client, wh, "A-01-01")
    client.post(
        "/api/receipts",
        headers=auth(wh),
        json={"lines": [{"product_id": 1, "qty": 10, "location_id": loc}]},
    )
    created = client.post(
        "/api/stocktakes", headers=auth(wh), json={"scope_type": "LOCATION", "scope_id": loc}
    )
    st_id = created.get_json()["id"]
    lines = created.get_json()["lines"]
    client.put(
        f"/api/stocktakes/{st_id}/lines",
        headers=auth(wh),
        json={"lines": [{"id": lines[0]["id"], "actual_qty": 8}]},
    )
    submitted = client.post(f"/api/stocktakes/{st_id}/submit", headers=auth(wh))
    assert submitted.status_code == 200, submitted.get_json()

    approved = client.post(f"/api/stocktakes/{st_id}/approve", headers=auth(ad1))
    assert approved.status_code == 200, approved.get_json()

    stock = client.get("/api/stock", headers=auth(wh)).get_json()
    total = sum(i["on_hand"] for i in stock if i["product_id"] == 1)
    assert total == 8


# --- 銷貨與作廢 ----------------------------------------------------------
def test_sales_order_deducts_stock(client):
    ad1 = login(client, "ad1")
    loc = location_id(client, ad1, "A-01-01")
    client.post(
        "/api/receipts",
        headers=auth(ad1),
        json={"lines": [{"product_id": 1, "qty": 10, "location_id": loc}]},
    )
    response = client.post(
        "/api/sales/orders",
        headers=auth(ad1),
        json={"lines": [{"product_id": 1, "qty": 3, "unit_price": 150, "location_id": loc}]},
    )
    assert response.status_code == 201, response.get_json()
    assert response.get_json()["total_amount"] == 450

    stock = client.get("/api/stock", headers=auth(ad1)).get_json()
    assert sum(i["on_hand"] for i in stock if i["product_id"] == 1) == 7


def test_void_sales_order_reverses_stock(client):
    ad1 = login(client, "ad1")
    loc = location_id(client, ad1, "A-01-01")
    client.post(
        "/api/receipts",
        headers=auth(ad1),
        json={"lines": [{"product_id": 1, "qty": 10, "location_id": loc}]},
    )
    so = client.post(
        "/api/sales/orders",
        headers=auth(ad1),
        json={"lines": [{"product_id": 1, "qty": 3, "unit_price": 150, "location_id": loc}]},
    ).get_json()

    voided = client.post(f"/api/sales/orders/{so['id']}/void", headers=auth(ad1))
    assert voided.status_code == 200, voided.get_json()

    stock = client.get("/api/stock", headers=auth(ad1)).get_json()
    assert sum(i["on_hand"] for i in stock if i["product_id"] == 1) == 10

    # 原明細仍在（不可刪除），且有反向沖銷
    ledger = client.get("/api/stock/ledger", headers=auth(ad1)).get_json()
    assert ledger["total"] == 3  # 期初 + 銷貨 + 沖銷


# --- 稽核 ----------------------------------------------------------------
def test_audit_trail_records_sensitive_actions(client):
    wh = login(client, "wh")
    ad1 = login(client, "ad1")
    loc = location_id(client, wh, "A-01-01")
    client.post(
        "/api/receipts",
        headers=auth(wh),
        json={"lines": [{"product_id": 1, "qty": 10, "location_id": loc}]},
    )
    client.post(
        "/api/stocktakes", headers=auth(wh), json={"scope_type": "LOCATION", "scope_id": loc}
    )
    response = client.get("/api/audit", headers=auth(ad1))
    assert response.status_code == 200
    actions = {item["action"] for item in response.get_json()["items"]}
    assert "LOGIN" in actions
    assert "STOCKTAKE_CREATE" in actions
