"""銷貨端點（PRD FR-19，最小可用）。"""

from flask import Blueprint, jsonify, request

from ..auth import ROLE_ADMIN, current_user, login_required, mask_prices, roles_required
from ..extensions import db
from ..models import (
    SUBMITTED,
    VOIDED,
    Location,
    Product,
    SalesOrder,
    SalesOrderLine,
    StockLedger,
)
from ..serializers import dt, money, qty
from ..services.documents import next_no, transition
from ..services.stock import MOVE_SALE, StockError, StockService

bp = Blueprint("sales", __name__, url_prefix="/api/sales")


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


def ok(payload, status=200):
    return jsonify(mask_prices(payload)), status


def _payload(so: SalesOrder) -> dict:
    return {
        "id": so.id,
        "so_no": so.so_no,
        "status": so.status,
        "customer_text": so.customer_text,
        "sold_by": so.sold_by_user.display_name if so.sold_by_user else None,
        "sold_at": dt(so.sold_at),
        "total_amount": money(so.total_amount),
        "lines": [
            {
                "id": line.id,
                "product_id": line.product_id,
                "product_code": line.product.product_code,
                "name": line.product.name,
                "batch_id": line.batch_id,
                "batch_no": line.batch.batch_no if line.batch else None,
                "qty": qty(line.qty),
                "unit_price": money(line.unit_price),
                "amount": money(line.amount),
                "location_id": line.location_id,
                "location_code": line.location.code if line.location else None,
            }
            for line in so.lines
        ],
    }


@bp.get("/orders")
@login_required
def list_orders():
    rows = db.session.query(SalesOrder).order_by(SalesOrder.id.desc()).all()
    return ok([_payload(so) for so in rows])


@bp.post("/orders")
@login_required
@roles_required(ROLE_ADMIN)
def create_order():
    data = request.get_json(silent=True) or {}
    lines = data.get("lines") or []
    if not lines:
        return _bad("至少需要一筆品項")

    user = current_user()
    so = SalesOrder(
        so_no=next_no("sales_orders"),
        customer_text=(data.get("customer_text") or "").strip() or None,
        status=SUBMITTED,
        sold_by=user.id,
        total_amount=0,
    )
    db.session.add(so)
    db.session.flush()

    total = 0.0
    try:
        for item in lines:
            product_id = _int(item.get("product_id"))
            location_id = _int(item.get("location_id"))
            batch_id = _int(item.get("batch_id"))
            qty_value = _dec(item.get("qty"), 0)
            unit_price = _dec(item.get("unit_price"), 0)
            if not product_id or not location_id:
                return _bad("商品與庫位必填")
            if not qty_value or qty_value <= 0:
                return _bad("數量必須大於 0")
            product = db.session.get(Product, product_id)
            if product is None:
                return _bad("找不到此商品", 404)
            if product.status != "ACTIVE":
                return _bad(f"商品 {product.name} 已停用，不能銷貨")
            location = db.session.get(Location, location_id)
            if location is not None and location.is_frozen:
                return _bad(f"庫位 {location.code} 已凍結，不能出貨")

            amount = qty_value * unit_price
            StockService.issue(
                product_id=product_id,
                location_id=location_id,
                qty=qty_value,
                operator_id=user.id,
                batch_id=batch_id,
                purpose="SALE",
                movement_type=MOVE_SALE,
                source_doc_type="SALES_ORDER",
                source_doc_no=so.so_no,
            )
            db.session.add(
                SalesOrderLine(
                    so_id=so.id,
                    product_id=product_id,
                    batch_id=batch_id,
                    qty=qty_value,
                    unit_price=unit_price,
                    amount=amount,
                    location_id=location_id,
                )
            )
            total += amount
    except StockError as e:
        db.session.rollback()
        return _bad(e.message, e.status)

    so.total_amount = total
    db.session.commit()
    return ok(_payload(so), 201)


@bp.post("/orders/<int:sid>/void")
@login_required
@roles_required(ROLE_ADMIN)
def void_order(sid):
    so = db.session.get(SalesOrder, sid)
    if so is None:
        return _bad("找不到此銷貨單", 404)
    if so.status == VOIDED:
        return _bad("此銷貨單已作廢")
    user = current_user()
    try:
        for line in so.lines:
            ledgers = (
                db.session.query(StockLedger)
                .filter(
                    StockLedger.source_doc_no == so.so_no,
                    StockLedger.product_id == line.product_id,
                    StockLedger.location_id == line.location_id,
                    StockLedger.movement_type == MOVE_SALE,
                )
                .all()
            )
            for ledger in ledgers:
                StockService.reverse(ledger=ledger, operator_id=user.id, reason="銷貨單作廢")
        transition(so, "sales_orders", VOIDED, user.id, "DOC_VOID", doc_no=so.so_no)
        db.session.commit()
    except StockError as e:
        db.session.rollback()
        return _bad(e.message, e.status)
    return ok({"ok": True, "id": so.id})
