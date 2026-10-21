"""種子資料（PRD SM-4：一鍵重置 ≤ 30 秒）。

用法：
    flask seed --reset      # 清空並重建
    flask seed              # 沒有資料時才建立
"""

import random
from datetime import datetime, timedelta

import click
from flask.cli import with_appcontext

from .auth import hash_password
from .extensions import db
from .models import (
    APPROVED,
    DRAFT,
    IN_PROGRESS,
    PENDING_APPROVAL,
    REJECTED,
    SUBMITTED,
    VOIDED,
    Adjustment,
    AdjustmentLine,
    AuditLog,
    AuthToken,
    GoodsReceipt,
    GoodsReceiptLine,
    IssueOrder,
    IssueOrderLine,
    Location,
    Product,
    ProductBatch,
    ProductCategory,
    ProductSupplier,
    PurchaseOrder,
    PurchaseOrderLine,
    Role,
    SalesOrder,
    SalesOrderLine,
    StockBalance,
    Stocktake,
    StocktakeLine,
    StockLedger,
    Supplier,
    User,
    Warehouse,
)
from .services.documents import next_no
from .services.stock import MOVE_SALE, StockService

DEFAULT_PASSWORD = "demo1234"

CATEGORIES = [("DRINK", "飲料"), ("RAW", "原料"), ("SPARE", "備品"), ("PACK", "包材")]
ZONES = [("A", "A 區"), ("B", "B 區"), ("C", "C 區")]
SUPPLIER_NAMES = [
    "台灣飲料股份有限公司", "全國食品原料行", "宏達備品有限公司", "包材大王企業社",
    "東南物流股份有限公司", "新北化學原料股份有限公司", "大同包裝材料行", "永豐商行",
    "中興百貨股份有限公司", "凱利國際貿易公司", "信昌實業股份有限公司", "長春食品有限公司",
    "統一原料供應商", "瑞興工業股份有限公司", "友邦包材有限公司",
]


def _reset():
    """清空所有業務資料（保留 schema）。刪除順序需遵守外鍵相依。"""
    for model in (
        StockLedger, StockBalance,
        SalesOrderLine, SalesOrder,
        GoodsReceiptLine, GoodsReceipt,
        IssueOrderLine, IssueOrder,
        AdjustmentLine, Adjustment,
        StocktakeLine, Stocktake,
        PurchaseOrderLine, PurchaseOrder,
        ProductSupplier, ProductBatch, Product, ProductCategory, Supplier,
        Location, Warehouse,
        AuditLog, AuthToken, User, Role,
    ):
        db.session.query(model).delete()
    db.session.commit()


def seed_database(reset: bool = False) -> dict:
    random.seed(20261021)

    if reset:
        _reset()
    if db.session.query(User).count() > 0:
        return {"skipped": True}

    # --- 角色 ---
    roles = {}
    for code, name in [("WAREHOUSE", "倉管人員"), ("PURCHASE", "採購人員"), ("ADMIN", "主管")]:
        role = Role(code=code, name=name)
        db.session.add(role)
        roles[code] = role
    db.session.flush()

    # --- 使用者（6 個，示範送單 ≠ 核准）---
    users = {}
    for username, display_name, code in [
        ("warehouse1", "陳倉管", "WAREHOUSE"),
        ("warehouse2", "林倉管", "WAREHOUSE"),
        ("purchase1", "王採購", "PURCHASE"),
        ("purchase2", "李採購", "PURCHASE"),
        ("admin1", "張主管", "ADMIN"),
        ("admin2", "陳副理", "ADMIN"),
    ]:
        user = User(
            username=username,
            password_hash=hash_password(DEFAULT_PASSWORD),
            display_name=display_name,
            role_id=roles[code].id,
            is_active=True,
            must_change_password=False,
        )
        db.session.add(user)
        users[username] = user
    db.session.flush()

    # --- 倉庫與庫位 ---
    warehouse = Warehouse(code="WH1", name="主倉庫")
    db.session.add(warehouse)
    db.session.flush()
    for zone_code, zone_name in ZONES:
        zone = Location(
            warehouse_id=warehouse.id, parent_id=None, code=zone_code,
            name=zone_name, is_aggregate=True, status="ACTIVE",
        )
        db.session.add(zone)
        db.session.flush()
        for row in range(1, 4):
            for col in range(1, 4):
                db.session.add(Location(
                    warehouse_id=warehouse.id, parent_id=zone.id,
                    code=f"{zone_code}-{row:02d}-{col:02d}",
                    name=f"{zone_name} {row}排{col}位",
                    is_frozen=False, status="ACTIVE",
                ))
    db.session.flush()
    leaf_locations = [loc for loc in db.session.query(Location).all() if not loc.is_aggregate]

    # --- 商品類別（安全水位預設）---
    categories = []
    for code, name in CATEGORIES:
        category = ProductCategory(code=code, name=name, safety_stock=20, reorder_multiplier=2)
        db.session.add(category)
        categories.append(category)
    db.session.flush()

    # --- 商品 ---
    products = []
    counts = {"飲料": 80, "原料": 60, "備品": 40, "包材": 20}
    code_no = 0
    for category in categories:
        for index in range(counts[category.name]):
            code_no += 1
            is_batch = category.name in ("飲料", "原料") and index % 6 == 0
            product = Product(
                product_code=f"P-{code_no:06d}",
                name=f"{category.name}-{index + 1:03d}",
                barcode=f"471{code_no:08d}" if index % 2 == 0 else None,
                category_id=category.id,
                unit="箱",
                pack_size=12,
                conversion_factor=12,
                purchase_price=round(random.uniform(50, 900), 2),
                is_batch_tracked=is_batch,
                status="ACTIVE",
            )
            db.session.add(product)
            products.append(product)
    db.session.flush()

    # --- 供應商與報價 ---
    suppliers = []
    for index, name in enumerate(SUPPLIER_NAMES, start=1):
        supplier = Supplier(
            tax_id=f"{70000000 + index * 137:08d}"[-8:],
            company_name=name,
            contact_name=f"聯絡人{index}",
            phone=f"02-{20000000 + index * 111:08d}",
            status="ACTIVE",
        )
        db.session.add(supplier)
        suppliers.append(supplier)
    db.session.flush()

    for product in products:
        for supplier in random.sample(suppliers, random.randint(1, 3)):
            db.session.add(ProductSupplier(
                product_id=product.id,
                supplier_id=supplier.id,
                unit_price=round(random.uniform(40, 950), 2),
                moq=random.choice([1, 5, 10, 20]),
                lead_time_days=random.choice([3, 5, 7, 14]),
            ))
    db.session.flush()

    # --- 期初庫存（以期初建帳寫入結存明細，確保可逐筆還原）---
    admin = users["admin1"]
    for product in random.sample(products, 100):
        location = random.choice(leaf_locations)
        StockService.opening(
            product_id=product.id,
            location_id=location.id,
            qty=random.randint(5, 200),
            operator_id=admin.id,
        )
    db.session.flush()

    # --- 採購單 ---
    purchase_orders = []
    for index, status in enumerate([
        DRAFT, DRAFT, PENDING_APPROVAL, PENDING_APPROVAL,
        APPROVED, APPROVED, REJECTED, VOIDED,
    ]):
        supplier = suppliers[index % len(suppliers)]
        po = PurchaseOrder(
            po_no=next_no("purchase_orders"),
            supplier_id=supplier.id,
            status=DRAFT,
            expected_date=(datetime.utcnow() + timedelta(days=index + 3)).date(),
            total_amount=0,
        )
        db.session.add(po)
        db.session.flush()
        total = 0.0
        for product in random.sample(products, random.randint(2, 4)):
            qty = random.randint(10, 100)
            price = round(random.uniform(40, 950), 2)
            db.session.add(PurchaseOrderLine(
                po_id=po.id, product_id=product.id, qty_ordered=qty,
                qty_received=0, unit_price=price,
            ))
            total += qty * price
        po.total_amount = total
        if status in (PENDING_APPROVAL, APPROVED, REJECTED, VOIDED):
            po.sent_by = users["purchase1"].id
            po.sent_at = datetime.utcnow() - timedelta(days=1)
        if status in (APPROVED, REJECTED, VOIDED):
            po.approved_by = users["admin1"].id
            po.approved_at = datetime.utcnow()
        po.status = status
        purchase_orders.append(po)
    db.session.flush()

    # --- 進貨單（對應已核准的採購單）---
    for order_index, po in enumerate([p for p in purchase_orders if p.status == APPROVED]):
        receipt = GoodsReceipt(
            gr_no=next_no("goods_receipts"),
            po_id=po.id,
            status=SUBMITTED,
            operator_id=users["warehouse1"].id,
            received_at=datetime.utcnow() - timedelta(hours=order_index + 1),
        )
        db.session.add(receipt)
        db.session.flush()
        for line in po.lines:
            location = random.choice(leaf_locations)
            qty = random.randint(1, max(1, int(float(line.qty_ordered) * 0.5)))
            batch_no = None
            batch_id = None
            if line.product.is_batch_tracked:
                batch_no = f"B{datetime.utcnow().strftime('%Y%m%d')}-{random.randint(1, 99)}"
                batch = StockService.get_or_create_batch(line.product_id, batch_no)
                batch_id = batch.id
            StockService.receive(
                product_id=line.product_id,
                location_id=location.id,
                qty=qty,
                operator_id=users["warehouse1"].id,
                batch_no=batch_no,
                source_doc_no=receipt.gr_no,
            )
            line.qty_received = float(line.qty_received) + qty
            db.session.add(GoodsReceiptLine(
                gr_id=receipt.id, product_id=line.product_id, batch_id=batch_id,
                qty=qty, batch_no=batch_no, location_id=location.id,
                unit_price=line.unit_price,
            ))
    db.session.flush()

    # --- 銷貨單（只賣有庫存的商品）---
    balances = db.session.query(StockBalance).filter(StockBalance.on_hand > 0).all()
    by_product: dict[int, list] = {}
    for balance in balances:
        by_product.setdefault(balance.product_id, []).append(balance)

    sellable_products = [p for p in by_product if len(by_product[p]) > 0]
    for index in range(8):
        so = SalesOrder(
            so_no=next_no("sales_orders"),
            customer_text=f"客戶公司 {index + 1}",
            status=SUBMITTED,
            sold_by=users["admin1"].id,
            sold_at=datetime.utcnow() - timedelta(days=index),
            total_amount=0,
        )
        db.session.add(so)
        db.session.flush()
        total = 0.0
        for product_id in random.sample(sellable_products, min(2, len(sellable_products))):
            balance = random.choice(by_product[product_id])
            product = balance.product
            qty = max(1, int(float(balance.on_hand) * 0.1))
            price = round(float(product.purchase_price or 100) * 1.3, 2)
            amount = qty * price
            StockService.issue(
                product_id=product.id,
                location_id=balance.location_id,
                qty=qty,
                operator_id=users["admin1"].id,
                batch_id=balance.batch_id,
                purpose="SALE",
                movement_type=MOVE_SALE,
                source_doc_no=so.so_no,
            )
            db.session.add(SalesOrderLine(
                so_id=so.id, product_id=product.id, batch_id=balance.batch_id,
                qty=qty, unit_price=price, amount=amount, location_id=balance.location_id,
            ))
            total += amount
        so.total_amount = total
    db.session.flush()

    # --- 盤點單 ---
    # 進行中／待核准的盤點只凍結「單一庫位」，避免整個類別被鎖住而無法示範其他流程。
    for index, (scope_type, scope_id) in enumerate([
        ("LOCATION", leaf_locations[0].id),
        ("LOCATION", leaf_locations[1].id),
        ("CATEGORY", categories[0].id),
    ]):
        st = Stocktake(
            st_no=next_no("stocktakes"),
            scope_type=scope_type,
            scope_id=scope_id,
            status=IN_PROGRESS if index == 0 else (SUBMITTED if index == 1 else APPROVED),
            freeze_mode="FREEZE",
        )
        db.session.add(st)
        db.session.flush()

        current = db.session.query(StockBalance).all()
        if scope_type == "LOCATION":
            current = [b for b in current if b.location_id == scope_id]
        elif scope_type == "CATEGORY":
            product_ids = [p.id for p in products if p.category_id == scope_id]
            current = [b for b in current if b.product_id in product_ids]
        else:
            current = [b for b in current if b.product_id == scope_id]

        for balance in current:
            book = float(balance.on_hand)
            actual = book
            if index == 1:
                actual = max(0.0, book - 2)  # 製造一筆盤虧供示範
            db.session.add(StocktakeLine(
                stocktake_id=st.id, product_id=balance.product_id,
                batch_id=balance.batch_id, location_id=balance.location_id,
                book_qty=balance.on_hand, actual_qty=actual,
                diff_qty=actual - book,
            ))
        if st.status in (SUBMITTED, APPROVED):
            st.submitted_by = users["warehouse1"].id
            st.submitted_at = datetime.utcnow()
            st.total_diff_rate = 0.01
        if st.status == APPROVED:
            st.approved_by = users["admin2"].id

    db.session.commit()

    return {
        "users": len(users),
        "products": len(products),
        "suppliers": len(suppliers),
        "locations": len(leaf_locations),
        "purchase_orders": len(purchase_orders),
    }


@click.command("seed")
@click.option("--reset", is_flag=True, help="先清空既有資料再建立")
@with_appcontext
def seed_command(reset):
    """建立教學用種子資料。"""
    result = seed_database(reset=reset)
    if result.get("skipped"):
        click.echo("資料庫已有帳號，略過建立（加 --reset 可重建）。")
        return
    click.echo("種子資料建立完成：" + ", ".join(f"{k}={v}" for k, v in result.items()))
    click.echo(f"登入帳號：warehouse1 / purchase1 / admin1，密碼 {DEFAULT_PASSWORD}")
