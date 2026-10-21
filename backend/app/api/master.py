"""主檔端點：商品類別、商品、供應商、報價、倉庫、庫位（PRD FR-4～FR-8）。"""

from flask import Blueprint, jsonify, request

from ..auth import (
    ROLE_ADMIN,
    ROLE_PURCHASE,
    ROLE_WAREHOUSE,
    login_required,
    mask_prices,
    roles_required,
)
from ..extensions import db
from ..models import (
    Location,
    Product,
    ProductCategory,
    ProductSupplier,
    Supplier,
    Warehouse,
)
from ..serializers import d, money, qty

bp = Blueprint("master", __name__, url_prefix="/api")


def _bad(msg, status=400):
    return jsonify({"error": msg}), status


def ok(payload, status=200):
    """統一出口：價格遮蔽在序列化層完成（PRD FR-3）。"""
    return jsonify(mask_prices(payload)), status


def _int(value):
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _dec(value, default=None):
    if value in (None, ""):
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


# --- 商品類別 ------------------------------------------------------------
def category_payload(c: ProductCategory) -> dict:
    return {
        "id": c.id,
        "code": c.code,
        "name": c.name,
        "parent_id": c.parent_id,
        "safety_stock": qty(c.safety_stock),
        "reorder_multiplier": qty(c.reorder_multiplier),
    }


@bp.get("/categories")
@login_required
def list_categories():
    rows = db.session.query(ProductCategory).order_by(ProductCategory.code).all()
    return ok([category_payload(c) for c in rows])


@bp.post("/categories")
@login_required
@roles_required(ROLE_ADMIN, ROLE_PURCHASE)
def create_category():
    data = request.get_json(silent=True) or {}
    code = (data.get("code") or "").strip()
    name = (data.get("name") or "").strip()
    if not code or not name:
        return _bad("類別代號與名稱必填")
    if db.session.query(ProductCategory).filter_by(code=code).first():
        return _bad(f"類別代號 {code} 已存在")
    row = ProductCategory(
        code=code,
        name=name,
        parent_id=_int(data.get("parent_id")),
        safety_stock=_dec(data.get("safety_stock")),
        reorder_multiplier=_dec(data.get("reorder_multiplier"), 1),
    )
    db.session.add(row)
    db.session.commit()
    return ok(category_payload(row), 201)


@bp.put("/categories/<int:cid>")
@login_required
@roles_required(ROLE_ADMIN, ROLE_PURCHASE)
def update_category(cid):
    row = db.session.get(ProductCategory, cid)
    if row is None:
        return _bad("找不到此類別", 404)
    data = request.get_json(silent=True) or {}
    if "name" in data:
        row.name = (data.get("name") or "").strip() or row.name
    if "parent_id" in data:
        row.parent_id = _int(data.get("parent_id"))
    if "safety_stock" in data:
        row.safety_stock = _dec(data.get("safety_stock"))
    if "reorder_multiplier" in data:
        row.reorder_multiplier = _dec(data.get("reorder_multiplier"), 1)
    db.session.commit()
    return ok(category_payload(row))


# --- 商品 ----------------------------------------------------------------
def product_payload(p: Product) -> dict:
    return {
        "id": p.id,
        "product_code": p.product_code,
        "name": p.name,
        "barcode": p.barcode,
        "category_id": p.category_id,
        "category_name": p.category.name if p.category else None,
        "unit": p.unit,
        "pack_size": p.pack_size,
        "conversion_factor": qty(p.conversion_factor),
        "purchase_price": money(p.purchase_price),
        "is_batch_tracked": p.is_batch_tracked,
        "status": p.status,
    }


def _next_product_code() -> str:
    rows = db.session.query(Product.product_code).all()
    max_no = 0
    for (code,) in rows:
        if code and code.startswith("P-"):
            try:
                max_no = max(max_no, int(code[2:]))
            except ValueError:
                continue
    return f"P-{max_no + 1:06d}"


@bp.get("/products")
@login_required
def list_products():
    q = (request.args.get("q") or "").strip()
    barcode = (request.args.get("barcode") or "").strip()
    category_id = _int(request.args.get("category_id"))
    status = request.args.get("status")

    query = db.session.query(Product)
    if barcode:
        query = query.filter(Product.barcode == barcode)
    elif q:
        like = f"%{q}%"
        query = query.filter(
            db.or_(
                Product.name.ilike(like),
                Product.product_code.ilike(like),
                Product.barcode.ilike(like),
            )
        )
    if category_id:
        query = query.filter(Product.category_id == category_id)
    if status:
        query = query.filter(Product.status == status)
    rows = query.order_by(Product.product_code).all()
    return ok([product_payload(p) for p in rows])


@bp.post("/products")
@login_required
@roles_required(ROLE_ADMIN, ROLE_PURCHASE, ROLE_WAREHOUSE)
def create_product():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return _bad("商品名稱必填")
    barcode = (data.get("barcode") or "").strip() or None
    if barcode and db.session.query(Product).filter(Product.barcode == barcode).first():
        return _bad(f"條碼 {barcode} 已被其他商品使用")

    row = Product(
        product_code=_next_product_code(),
        name=name,
        barcode=barcode,
        category_id=_int(data.get("category_id")),
        unit=(data.get("unit") or "件"),
        pack_size=_int(data.get("pack_size")),
        conversion_factor=_dec(data.get("conversion_factor"), 1),
        purchase_price=_dec(data.get("purchase_price")),
        is_batch_tracked=bool(data.get("is_batch_tracked")),
        status="ACTIVE",
    )
    db.session.add(row)
    db.session.commit()
    return ok(product_payload(row), 201)


@bp.put("/products/<int:pid>")
@login_required
@roles_required(ROLE_ADMIN, ROLE_PURCHASE, ROLE_WAREHOUSE)
def update_product(pid):
    row = db.session.get(Product, pid)
    if row is None:
        return _bad("找不到此商品", 404)
    data = request.get_json(silent=True) or {}
    if "barcode" in data:
        barcode = (data.get("barcode") or "").strip() or None
        if barcode:
            other = (
                db.session.query(Product)
                .filter(Product.barcode == barcode, Product.id != pid)
                .first()
            )
            if other:
                return _bad(f"條碼 {barcode} 已被其他商品使用")
        row.barcode = barcode
    if "name" in data:
        row.name = (data.get("name") or "").strip() or row.name
    if "category_id" in data:
        row.category_id = _int(data.get("category_id"))
    if "unit" in data:
        row.unit = data.get("unit") or row.unit
    if "pack_size" in data:
        row.pack_size = _int(data.get("pack_size"))
    if "conversion_factor" in data:
        row.conversion_factor = _dec(data.get("conversion_factor"), 1)
    if "purchase_price" in data:
        row.purchase_price = _dec(data.get("purchase_price"))
    if "is_batch_tracked" in data:
        row.is_batch_tracked = bool(data.get("is_batch_tracked"))
    db.session.commit()
    return ok(product_payload(row))


@bp.post("/products/<int:pid>/disable")
@login_required
@roles_required(ROLE_ADMIN)
def disable_product(pid):
    row = db.session.get(Product, pid)
    if row is None:
        return _bad("找不到此商品", 404)
    from ..services.stock import StockService
    from decimal import Decimal

    if StockService.product_on_hand(pid) > Decimal("0"):
        return _bad("此商品仍有庫存，請先移出庫存或撤銷停用")
    row.status = "DISABLED"
    db.session.commit()
    return jsonify({"ok": True})


# --- 供應商與報價 --------------------------------------------------------
def supplier_payload(s: Supplier) -> dict:
    return {
        "id": s.id,
        "tax_id": s.tax_id,
        "company_name": s.company_name,
        "contact_name": s.contact_name,
        "phone": s.phone,
        "status": s.status,
    }


@bp.get("/suppliers")
@login_required
def list_suppliers():
    q = (request.args.get("q") or "").strip()
    query = db.session.query(Supplier)
    if q:
        like = f"%{q}%"
        query = query.filter(
            db.or_(
                Supplier.company_name.ilike(like),
                Supplier.tax_id.ilike(like),
                Supplier.contact_name.ilike(like),
            )
        )
    rows = query.order_by(Supplier.company_name).all()
    return ok([supplier_payload(s) for s in rows])


@bp.post("/suppliers")
@login_required
@roles_required(ROLE_ADMIN, ROLE_PURCHASE)
def create_supplier():
    data = request.get_json(silent=True) or {}
    company_name = (data.get("company_name") or "").strip()
    if not company_name:
        return _bad("公司名稱必填")
    tax_id = (data.get("tax_id") or "").strip() or None
    if tax_id:
        if not (len(tax_id) == 8 and tax_id.isdigit()):
            return _bad("統編格式必須是 8 碼數字")
        if db.session.query(Supplier).filter_by(tax_id=tax_id).first():
            return _bad(f"統編 {tax_id} 已存在")
    row = Supplier(
        tax_id=tax_id,
        company_name=company_name,
        contact_name=(data.get("contact_name") or "").strip() or None,
        phone=(data.get("phone") or "").strip() or None,
        status="ACTIVE",
    )
    db.session.add(row)
    db.session.commit()
    return ok(supplier_payload(row), 201)


@bp.put("/suppliers/<int:sid>")
@login_required
@roles_required(ROLE_ADMIN, ROLE_PURCHASE)
def update_supplier(sid):
    row = db.session.get(Supplier, sid)
    if row is None:
        return _bad("找不到此供應商", 404)
    data = request.get_json(silent=True) or {}
    if "tax_id" in data:
        tax_id = (data.get("tax_id") or "").strip() or None
        if tax_id and not (len(tax_id) == 8 and tax_id.isdigit()):
            return _bad("統編格式必須是 8 碼數字")
        if tax_id:
            other = (
                db.session.query(Supplier)
                .filter(Supplier.tax_id == tax_id, Supplier.id != sid)
                .first()
            )
            if other:
                return _bad(f"統編 {tax_id} 已存在")
        row.tax_id = tax_id
    for key in ("company_name", "contact_name", "phone"):
        if key in data:
            setattr(row, key, (data.get(key) or "").strip() or None)
    if "status" in data:
        row.status = data.get("status")
    db.session.commit()
    return ok(supplier_payload(row))


def quote_payload(q: ProductSupplier) -> dict:
    return {
        "id": q.id,
        "product_id": q.product_id,
        "supplier_id": q.supplier_id,
        "supplier_name": q.supplier.company_name if q.supplier else None,
        "unit_price": money(q.unit_price),
        "moq": q.moq,
        "lead_time_days": q.lead_time_days,
        "valid_until": d(q.valid_until),
    }


@bp.get("/quotes")
@login_required
def list_quotes():
    product_id = _int(request.args.get("product_id"))
    query = db.session.query(ProductSupplier)
    if product_id:
        query = query.filter(ProductSupplier.product_id == product_id)
    rows = query.order_by(ProductSupplier.unit_price).all()
    return ok([quote_payload(q) for q in rows])


@bp.post("/quotes")
@login_required
@roles_required(ROLE_ADMIN, ROLE_PURCHASE)
def create_quote():
    data = request.get_json(silent=True) or {}
    product_id = _int(data.get("product_id"))
    supplier_id = _int(data.get("supplier_id"))
    unit_price = _dec(data.get("unit_price"))
    if not product_id or not supplier_id:
        return _bad("商品與供應商必填")
    if unit_price is None:
        return _bad("單價必填")
    row = ProductSupplier(
        product_id=product_id,
        supplier_id=supplier_id,
        unit_price=unit_price,
        moq=_int(data.get("moq")),
        lead_time_days=_int(data.get("lead_time_days")),
        valid_until=_parse_date(data.get("valid_until")),
    )
    db.session.add(row)
    db.session.commit()
    return ok(quote_payload(row), 201)


def _parse_date(value):
    if not value:
        return None
    from datetime import date

    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


# --- 倉庫與庫位 ----------------------------------------------------------
def location_payload(loc: Location, children=None) -> dict:
    payload = {
        "id": loc.id,
        "warehouse_id": loc.warehouse_id,
        "parent_id": loc.parent_id,
        "code": loc.code,
        "name": loc.name,
        "is_frozen": loc.is_frozen,
        "is_aggregate": loc.is_aggregate,
        "status": loc.status,
    }
    if children is not None:
        payload["children"] = children
    return payload


@bp.get("/warehouses")
@login_required
def list_warehouses():
    rows = db.session.query(Warehouse).order_by(Warehouse.code).all()
    return ok([{"id": w.id, "code": w.code, "name": w.name} for w in rows])


@bp.get("/locations")
@login_required
def list_locations():
    warehouse_id = _int(request.args.get("warehouse_id"))
    query = db.session.query(Location)
    if warehouse_id:
        query = query.filter(Location.warehouse_id == warehouse_id)
    rows = query.order_by(Location.code).all()
    return ok([location_payload(loc) for loc in rows])


@bp.get("/locations/tree")
@login_required
def locations_tree():
    rows = db.session.query(Location).order_by(Location.code).all()
    by_parent: dict[int | None, list[Location]] = {}
    for loc in rows:
        by_parent.setdefault(loc.parent_id, []).append(loc)

    def build(parent_id):
        out = []
        for loc in by_parent.get(parent_id, []):
            out.append(location_payload(loc, build(loc.id)))
        return out

    return ok(build(None))


@bp.post("/locations")
@login_required
@roles_required(ROLE_ADMIN)
def create_location():
    data = request.get_json(silent=True) or {}
    code = (data.get("code") or "").strip()
    name = (data.get("name") or "").strip()
    warehouse_id = _int(data.get("warehouse_id"))
    if not code or not name or not warehouse_id:
        return _bad("庫位代號、名稱與倉庫必填")
    exists = (
        db.session.query(Location)
        .filter(Location.warehouse_id == warehouse_id, Location.code == code)
        .first()
    )
    if exists:
        return _bad(f"庫位代號 {code} 已存在於此倉庫")
    row = Location(
        warehouse_id=warehouse_id,
        parent_id=_int(data.get("parent_id")),
        code=code,
        name=name,
        is_aggregate=bool(data.get("is_aggregate")),
        status="ACTIVE",
    )
    db.session.add(row)
    db.session.commit()
    return ok(location_payload(row), 201)


@bp.put("/locations/<int:lid>")
@login_required
@roles_required(ROLE_ADMIN)
def update_location(lid):
    row = db.session.get(Location, lid)
    if row is None:
        return _bad("找不到此庫位", 404)
    data = request.get_json(silent=True) or {}
    if "name" in data:
        row.name = (data.get("name") or "").strip() or row.name
    if "is_frozen" in data:
        row.is_frozen = bool(data.get("is_frozen"))
    if "status" in data:
        row.status = data.get("status")
    db.session.commit()
    return ok(location_payload(row))
