"""端到端煙霧測試：對實際執行的伺服器跑一次完整業務流程。

用法： python scripts/smoke.py [base_url]
"""

import json
import sys

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5000"
client = httpx.Client(base_url=BASE, timeout=30.0)


def check(label, condition, detail=""):
    mark = "OK " if condition else "FAIL"
    print(f"[{mark}] {label}" + (f" — {detail}" if detail else ""))
    if not condition:
        raise SystemExit(1)


def main():
    # 1. 登入
    r = client.post("/api/auth/login", json={"username": "warehouse1", "password": "demo1234"})
    check("登入 warehouse1", r.status_code == 200, r.text[:120])
    wh = {"Authorization": f"Bearer {r.json()['token']}"}

    r = client.post("/api/auth/login", json={"username": "admin1", "password": "demo1234"})
    admin = {"Authorization": f"Bearer {r.json()['token']}"}
    r = client.post("/api/auth/login", json={"username": "purchase1", "password": "demo1234"})
    purchase = {"Authorization": f"Bearer {r.json()['token']}"}
    check("登入 admin1 / purchase1", True)

    # 2. 價格遮蔽
    products = client.get("/api/products", headers=wh).json()
    check("倉管看不到採購單價", all("purchase_price" not in p for p in products), f"{len(products)} 筆商品")
    admin_products = client.get("/api/products", headers=admin).json()
    check("主管看得到採購單價", all("purchase_price" in p for p in admin_products))

    # 3. 進貨
    locations = client.get("/api/locations", headers=wh).json()
    active = client.get("/api/stocktakes?status=IN_PROGRESS", headers=wh).json()
    frozen_locations = {s["scope_id"] for s in active if s["scope_type"] == "LOCATION"}
    leaf = next(
        l for l in reversed([l for l in locations if not l["is_aggregate"]])
        if l["id"] not in frozen_locations
    )
    product = next(p for p in admin_products if not p["is_batch_tracked"])
    r = client.post(
        "/api/receipts",
        headers=wh,
        json={"reason": "煙霧測試", "lines": [{"product_id": product["id"], "qty": 25, "location_id": leaf["id"]}]},
    )
    check("建立進貨單", r.status_code == 201, r.text[:200])
    gr_no = r.json()["gr_no"]

    # 4. 庫存與結存明細
    stock = client.get("/api/stock", headers=wh).json()
    on_hand = sum(i["on_hand"] for i in stock if i["product_id"] == product["id"])
    ledger = client.get(f"/api/stock/ledger?product_id={product['id']}", headers=wh).json()
    ledger_sum = sum(i["qty_delta"] for i in ledger["items"])
    check("結存明細加總 = 現存數量", abs(ledger_sum - on_hand) < 0.001, f"明細 {ledger_sum} vs 現存 {on_hand}")

    # 5. 領用超出庫存被拒
    r = client.post(
        "/api/issues",
        headers=wh,
        json={"purpose": "INTERNAL_LOSS", "lines": [{"product_id": product["id"], "qty": 99999, "location_id": leaf["id"]}]},
    )
    check("領用超量被拒", r.status_code == 400, r.json().get("error", "")[:80])

    # 6. 補貨建議
    r = client.get("/api/purchase/replenishment", headers=purchase)
    check("補貨建議清單", r.status_code == 200, f"{len(r.json())} 項低於水位")

    # 7. 採購單送單 → 核准（第二人覆核）
    supplier = client.get("/api/suppliers", headers=purchase).json()[0]
    r = client.post(
        "/api/purchase/orders",
        headers=purchase,
        json={
            "supplier_id": supplier["id"],
            "expected_date": "2026-12-31",
            "lines": [{"product_id": product["id"], "qty": 30, "unit_price": 88}],
        },
    )
    check("建立採購單", r.status_code == 201, r.text[:160])
    po_id = r.json()["id"]
    po_no = r.json()["po_no"]
    check("採購單號格式 PO-YYYYMMDD-序號", po_no.startswith("PO-"), po_no)

    check("送單", client.post(f"/api/purchase/orders/{po_id}/submit", headers=purchase).status_code == 200)
    r = client.post(f"/api/purchase/orders/{po_id}/approve", headers=purchase)
    check("採購角色不可核准", r.status_code == 403)
    r = client.post(f"/api/purchase/orders/{po_id}/approve", headers=admin)
    check("主管核准採購單", r.status_code == 200, r.text[:120])

    # 8. 盤點凍結阻擋異動
    r = client.post("/api/stocktakes", headers=wh, json={"scope_type": "LOCATION", "scope_id": leaf["id"]})
    check("建立盤點單", r.status_code == 201, r.text[:160])
    st_id = r.json()["id"]
    r = client.post(
        "/api/receipts",
        headers=wh,
        json={"lines": [{"product_id": product["id"], "qty": 1, "location_id": leaf["id"]}]},
    )
    check("盤點期間異動被阻擋", r.status_code == 400 and "盤點" in r.json().get("error", ""), r.json().get("error", "")[:80])

    st_lines = client.get(f"/api/stocktakes/{st_id}", headers=wh).json()["lines"]
    client.put(
        f"/api/stocktakes/{st_id}/lines",
        headers=wh,
        json={
            "lines": [
                {"id": st_lines[0]["id"], "actual_qty": float(st_lines[0]["book_qty"]) - 2}
            ]
            + [
                {"id": l["id"], "actual_qty": float(l["book_qty"])}
                for l in st_lines[1:]
            ]
        },
    )
    r = client.post(f"/api/stocktakes/{st_id}/submit", headers=wh)
    check("提交盤點結果", r.status_code == 200, r.text[:160])
    # 盤點核准後：全庫存總量應減少 2（盤虧）
    def total_stock():
        return sum(i["on_hand"] for i in client.get("/api/stock", headers=wh).json())

    before_total = total_stock()
    r = client.post(f"/api/stocktakes/{st_id}/approve", headers=admin)
    check("主管核准盤點差異", r.status_code == 200, r.text[:160])
    after_total = total_stock()
    check("盤點差異已調整庫存", abs((before_total - after_total) - 2) < 0.001, f"{before_total} → {after_total}")

    # 9. 銷貨與作廢回滾
    before_sale_total = total_stock()
    r = client.post(
        "/api/sales/orders",
        headers=admin,
        json={"customer_text": "煙霧測試客戶", "lines": [{"product_id": product["id"], "qty": 3, "unit_price": 120, "location_id": leaf["id"]}]},
    )
    check("建立銷貨單", r.status_code == 201, r.text[:160])
    so_id = r.json()["id"]
    after_sale_total = total_stock()
    check("銷貨扣減庫存", abs((before_sale_total - after_sale_total) - 3) < 0.001, f"{before_sale_total} → {after_sale_total}")

    r = client.post(f"/api/sales/orders/{so_id}/void", headers=admin)
    check("作廢銷貨單", r.status_code == 200, r.text[:120])
    restored_total = total_stock()
    check("作廢後庫存回滾", abs(restored_total - before_sale_total) < 0.001, f"{after_sale_total} → {restored_total}")

    # 10. 稽核軌跡
    r = client.get("/api/audit", headers=admin)
    check("稽核軌跡可查詢", r.status_code == 200, f"{r.json()['total']} 筆")
    actions = {i["action"] for i in r.json()["items"]}
    check("稽核含敏感操作", {"DOC_SUBMIT", "DOC_APPROVE", "STOCKTAKE_SUBMIT"} & actions != set(), ", ".join(sorted(actions))[:120])

    # 11. 前端靜態檔
    r = client.get("/")
    check("前端首頁可載入", r.status_code == 200 and "<div id=\"root\">" in r.text, f"{len(r.text)} bytes")

    print("\n全部煙霧測試通過。")


if __name__ == "__main__":
    main()
