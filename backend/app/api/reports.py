"""進銷存彙總報表（PRD FR-21）。"""

from decimal import Decimal

from flask import Blueprint, jsonify, request

from ..auth import login_required, mask_prices
from ..extensions import db
from ..models import Product, ProductCategory, StockLedger
from ..serializers import qty

bp = Blueprint("reports", __name__, url_prefix="/api/reports")

IN_TYPES = ("RECEIPT", "OPENING")
OUT_TYPES = ("ISSUE", "SALE")


def _int(value):
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


@bp.get("/summary")
@login_required
def summary():
    date_from = request.args.get("from")
    date_to = request.args.get("to")
    category_id = _int(request.args.get("category_id"))

    query = db.session.query(StockLedger).join(
        Product, StockLedger.product_id == Product.id
    )
    if category_id:
        query = query.filter(Product.category_id == category_id)
    if date_from:
        query = query.filter(StockLedger.occurred_at >= f"{date_from} 00:00:00")
    if date_to:
        query = query.filter(StockLedger.occurred_at <= f"{date_to} 23:59:59")

    buckets: dict[int, dict] = {}
    for row in query.all():
        bucket = buckets.setdefault(
            row.product_id,
            {"in_qty": Decimal("0"), "issue_qty": Decimal("0"), "sale_qty": Decimal("0"), "adjust_qty": Decimal("0")},
        )
        delta = Decimal(str(row.qty_delta))
        if row.movement_type in IN_TYPES:
            bucket["in_qty"] += delta
        elif row.movement_type == "ISSUE":
            bucket["issue_qty"] += -delta
        elif row.movement_type == "SALE":
            bucket["sale_qty"] += -delta
        elif row.movement_type == "ADJUSTMENT":
            bucket["adjust_qty"] += delta
        elif row.movement_type == "REVERSAL":
            bucket["adjust_qty"] += delta

    items = []
    for product_id, bucket in buckets.items():
        product = db.session.get(Product, product_id)
        category = db.session.get(ProductCategory, product.category_id) if product and product.category_id else None
        net = bucket["in_qty"] - bucket["issue_qty"] - bucket["sale_qty"] + bucket["adjust_qty"]
        items.append(
            {
                "product_id": product_id,
                "product_code": product.product_code if product else None,
                "name": product.name if product else None,
                "category_name": category.name if category else None,
                "in_qty": qty(bucket["in_qty"]),
                "issue_qty": qty(bucket["issue_qty"]),
                "sale_qty": qty(bucket["sale_qty"]),
                "adjust_qty": qty(bucket["adjust_qty"]),
                "net_qty": qty(net),
            }
        )
    items.sort(key=lambda x: (x["product_code"] or ""))
    return jsonify(mask_prices({"items": items}))
