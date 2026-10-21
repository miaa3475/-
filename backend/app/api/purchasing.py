"""採購端點：補貨建議與採購單（PRD FR-16～FR-18）。"""

from datetime import date, datetime
from decimal import Decimal

from flask import Blueprint, jsonify, request

from ..auth import (
    ROLE_ADMIN,
    ROLE_PURCHASE,
    ROLE_WAREHOUSE,
    current_user,
    login_required,
    mask_prices,
    roles_required,
)
from ..extensions import db
from ..models import (
    APPROVED,
    DRAFT,
    PENDING_APPROVAL,
    REJECTED,
    SUBMITTED,
    VOIDED,
    Product,
    ProductCategory,
    ProductSupplier,
    PurchaseOrder,
    PurchaseOrderLine,
    StockBalance,
    Supplier,
)
from ..serializers import d, dt, money, qty
from ..services.audit import AuditService
from ..services.documents import (
    DocumentError,
    assert_second_person,
    next_no,
    transition,
)
from ..services.stock import StockError, StockService

bp = Blueprint("purchasing", __name__, url_prefix="/api/purchase")


def _bad(msg, status=400):
    return jsonify({"error": msg}), status


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


def _date(value):
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def ok(payload, status=200):
    return jsonify(mask_prices(payload)), status


def _safety_stock(product: Product) -> Decimal:
    """商品個別設定優先於類別預設（PRD FR-16）。"""
    if product.category_id:
        category = db.session.get(ProductCategory, product.category_id)
        if category is not None and category.safety_stock is not None:
            return Decimal(str(category.safety_stock))
    if product.safety_stock is not None:
        return Decimal(str(product.safety_stock))
    return Decimal("0")


def _multiplier(product: Product) -> Decimal:
    if product.category_id:
        category = db.session.get(ProductCategory, product.category_id)
        if category is not None and category.reorder_multiplier is not None:
            return Decimal(str(category.reorder_multiplier))
    if product.reorder_multiplier is not None:
        return Decimal(str(product.reorder_multiplier))
    return Decimal("1")


@bp.get("/replenishment")
@login_required
@roles_required(ROLE_PURCHASE, ROLE_ADMIN)
def replenishment():
    products = db.session.query(Product).filter(Product.status == "ACTIVE").all()
    items = []
    for product in products:
        safety = _safety_stock(product)
        multiplier = _multiplier(product)
        on_hand = StockService.product_on_hand(product.id)
        if safety <= 0 or on_hand >= safety:
            continue
        suggested = max(Decimal("1"), safety * multiplier - on_hand)

        quote = (
            db.session.query(ProductSupplier)
            .filter(ProductSupplier.product_id == product.id)
            .order_by(ProductSupplier.unit_price)
            .first()
        )
        items.append(
            {
                "product_id": product.id,
                "product_code": product.product_code,
                "name": product.name,
                "on_hand": qty(on_hand),
                "safety_stock": qty(safety),
                "reorder_multiplier": qty(multiplier),
                "suggested_qty": qty(suggested),
                "best_supplier_id": quote.supplier_id if quote else None,
                "best_supplier_name": quote.supplier.company_name if quote else None,
                "best_price": money(quote.unit_price) if quote else None,
            }
        )
    items.sort(key=lambda x: (x["on_hand"], x["name"]))
    return ok(items)


def _payload(po: PurchaseOrder) -> dict:
    return {
        "id": po.id,
        "po_no": po.po_no,
        "status": po.status,
        "supplier_id": po.supplier_id,
        "supplier_name": po.supplier.company_name if po.supplier else None,
        "expected_date": d(po.expected_date),
        "total_amount": money(po.total_amount),
        "sent_at": dt(po.sent_at),
        "approved_at": dt(po.approved_at),
        "created_at": dt(po.created_at),
        "lines": [
            {
                "id": line.id,
                "product_id": line.product_id,
                "product_code": line.product.product_code,
                "name": line.product.name,
                "qty_ordered": qty(line.qty_ordered),
                "qty_received": qty(line.qty_received),
                "unit_price": money(line.unit_price),
                "batch_no": line.batch_no,
            }
            for line in po.lines
        ],
    }


@bp.get("/orders")
@login_required
@roles_required(ROLE_PURCHASE, ROLE_ADMIN, ROLE_WAREHOUSE)
def list_orders():
    status = request.args.get("status")
    supplier_id = _int(request.args.get("supplier_id"))
    query = db.session.query(PurchaseOrder)
    if status:
        query = query.filter(PurchaseOrder.status == status)
    if supplier_id:
        query = query.filter(PurchaseOrder.supplier_id == supplier_id)
    rows = query.order_by(PurchaseOrder.id.desc()).all()
    return ok([_payload(po) for po in rows])


@bp.post("/orders")
@login_required
@roles_required(ROLE_PURCHASE, ROLE_ADMIN)
def create_order():
    data = request.get_json(silent=True) or {}
    lines = data.get("lines") or []
    supplier_id = _int(data.get("supplier_id"))
    expected_date = _date(data.get("expected_date"))
    if not supplier_id:
        return _bad("供應商必填")
    if not expected_date:
        return _bad("預估交期必填")
    if not lines:
        return _bad("至少需要一筆品項")

    user = current_user()
    po = PurchaseOrder(
        po_no=next_no("purchase_orders"),
        supplier_id=supplier_id,
        status=DRAFT,
        expected_date=expected_date,
        total_amount=0,
    )
    db.session.add(po)
    db.session.flush()

    total = 0.0
    for item in lines:
        product_id = _int(item.get("product_id"))
        qty_value = _dec(item.get("qty"), 0)
        unit_price = _dec(item.get("unit_price"))
        if not product_id or not qty_value or qty_value <= 0:
            return _bad("商品與數量必填，且數量必須大於 0")
        if unit_price is None:
            return _bad("單價必填")
        product = db.session.get(Product, product_id)
        if product is None:
            return _bad("找不到此商品", 404)
        db.session.add(
            PurchaseOrderLine(
                po_id=po.id,
                product_id=product_id,
                qty_ordered=qty_value,
                qty_received=0,
                unit_price=unit_price,
                batch_no=(item.get("batch_no") or "").strip() or None,
            )
        )
        total += qty_value * unit_price
    po.total_amount = total
    db.session.commit()
    return ok(_payload(po), 201)


@bp.get("/orders/<int:oid>")
@login_required
def get_order(oid):
    po = db.session.get(PurchaseOrder, oid)
    if po is None:
        return _bad("找不到此採購單", 404)
    return ok(_payload(po))


@bp.post("/orders/<int:oid>/submit")
@login_required
@roles_required(ROLE_PURCHASE, ROLE_ADMIN)
def submit_order(oid):
    po = db.session.get(PurchaseOrder, oid)
    if po is None:
        return _bad("找不到此採購單", 404)
    user = current_user()
    try:
        transition(po, "purchase_orders", PENDING_APPROVAL, user.id, "DOC_SUBMIT", doc_no=po.po_no)
    except DocumentError as e:
        db.session.rollback()
        return _bad(e.message, e.status)
    po.sent_by = user.id
    po.sent_at = datetime.utcnow()
    db.session.commit()
    return ok({"ok": True})


@bp.post("/orders/<int:oid>/approve")
@login_required
@roles_required(ROLE_ADMIN)
def approve_order(oid):
    po = db.session.get(PurchaseOrder, oid)
    if po is None:
        return _bad("找不到此採購單", 404)
    user = current_user()
    try:
        assert_second_person(po.sent_by, user.id)
        transition(po, "purchase_orders", APPROVED, user.id, "DOC_APPROVE", doc_no=po.po_no)
    except DocumentError as e:
        db.session.rollback()
        return _bad(e.message, e.status)
    po.approved_by = user.id
    po.approved_at = datetime.utcnow()
    if not po.po_no or "-" not in po.po_no:
        po.po_no = next_no("purchase_orders")
    db.session.commit()
    return ok({"ok": True, "po_no": po.po_no})


@bp.post("/orders/<int:oid>/reject")
@login_required
@roles_required(ROLE_ADMIN)
def reject_order(oid):
    po = db.session.get(PurchaseOrder, oid)
    if po is None:
        return _bad("找不到此採購單", 404)
    user = current_user()
    data = request.get_json(silent=True) or {}
    try:
        transition(po, "purchase_orders", REJECTED, user.id, "DOC_REJECT", doc_no=po.po_no)
    except DocumentError as e:
        db.session.rollback()
        return _bad(e.message, e.status)
    po.reason = (data.get("reason") or "").strip() or None
    db.session.commit()
    return ok({"ok": True})


@bp.post("/orders/<int:oid>/void")
@login_required
@roles_required(ROLE_ADMIN)
def void_order(oid):
    po = db.session.get(PurchaseOrder, oid)
    if po is None:
        return _bad("找不到此採購單", 404)
    user = current_user()
    data = request.get_json(silent=True) or {}
    try:
        transition(po, "purchase_orders", VOIDED, user.id, "DOC_VOID", doc_no=po.po_no)
    except DocumentError as e:
        db.session.rollback()
        return _bad(e.message, e.status)
    po.reason = (data.get("reason") or "").strip() or po.reason
    db.session.commit()
    return ok({"ok": True, "id": po.id})
