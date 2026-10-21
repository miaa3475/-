"""盤點端點（PRD FR-14、FR-15）。"""

from decimal import Decimal

from flask import Blueprint, jsonify, request
from sqlalchemy import and_

from ..auth import (
    ROLE_ADMIN,
    ROLE_WAREHOUSE,
    current_user,
    login_required,
    mask_prices,
    roles_required,
)
from ..extensions import db
from ..models import (
    ABORTED,
    APPROVED,
    IN_PROGRESS,
    SUBMITTED,
    Adjustment,
    AdjustmentLine,
    Product,
    ProductBatch,
    StockBalance,
    Stocktake,
    StocktakeLine,
)
from ..serializers import dt, qty
from ..services.audit import AuditService
from ..services.documents import DocumentError, assert_second_person, next_no, transition
from ..services.stock import MOVE_ADJUSTMENT, StockError, StockService

bp = Blueprint("stocktakes", __name__, url_prefix="/api/stocktakes")

DIFF_RATE_THRESHOLD = Decimal("0.01")  # 1%


def _bad(msg, status=400):
    return jsonify({"error": msg}), status


def _int(value):
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def ok(payload, status=200):
    return jsonify(mask_prices(payload)), status


def _payload(st: Stocktake) -> dict:
    return {
        "id": st.id,
        "st_no": st.st_no,
        "status": st.status,
        "scope_type": st.scope_type,
        "scope_id": st.scope_id,
        "total_diff_rate": qty(st.total_diff_rate),
        "submitted_at": dt(st.submitted_at),
        "created_at": dt(st.created_at),
        "lines": [
            {
                "id": line.id,
                "product_id": line.product_id,
                "product_code": line.product.product_code,
                "name": line.product.name,
                "batch_id": line.batch_id,
                "batch_no": line.batch.batch_no if line.batch else None,
                "location_id": line.location_id,
                "location_code": line.location.code if line.location else None,
                "book_qty": qty(line.book_qty),
                "actual_qty": qty(line.actual_qty),
                "diff_qty": qty(line.diff_qty),
                "reason_code": line.reason_code,
            }
            for line in st.lines
        ],
    }


@bp.get("")
@login_required
def list_stocktakes():
    status = request.args.get("status")
    query = db.session.query(Stocktake)
    if status:
        query = query.filter(Stocktake.status == status)
    rows = query.order_by(Stocktake.id.desc()).all()
    return ok(
        [
            {
                "id": st.id,
                "st_no": st.st_no,
                "status": st.status,
                "scope_type": st.scope_type,
                "scope_id": st.scope_id,
                "total_diff_rate": qty(st.total_diff_rate),
                "submitted_at": dt(st.submitted_at),
                "created_at": dt(st.created_at),
            }
            for st in rows
        ]
    )


@bp.post("")
@login_required
@roles_required(ROLE_WAREHOUSE, ROLE_ADMIN)
def create_stocktake():
    data = request.get_json(silent=True) or {}
    scope_type = (data.get("scope_type") or "").strip().upper()
    scope_id = _int(data.get("scope_id"))
    if scope_type not in ("LOCATION", "CATEGORY", "PRODUCT"):
        return _bad("盤點範圍類型必須是 LOCATION、CATEGORY 或 PRODUCT")
    if not scope_id:
        return _bad("盤點範圍必填")

    query = db.session.query(StockBalance).join(
        Product, StockBalance.product_id == Product.id
    )
    if scope_type == "LOCATION":
        query = query.filter(StockBalance.location_id == scope_id)
    elif scope_type == "PRODUCT":
        query = query.filter(StockBalance.product_id == scope_id)
    else:
        query = query.filter(Product.category_id == scope_id)
    balances = query.all()

    user = current_user()
    st = Stocktake(
        st_no=next_no("stocktakes"),
        scope_type=scope_type,
        scope_id=scope_id,
        status=IN_PROGRESS,
        freeze_mode="FREEZE",
    )
    db.session.add(st)
    db.session.flush()
    for bal in balances:
        db.session.add(
            StocktakeLine(
                stocktake_id=st.id,
                product_id=bal.product_id,
                batch_id=bal.batch_id,
                location_id=bal.location_id,
                book_qty=bal.on_hand,
                actual_qty=None,
            )
        )
    AuditService.record(
        actor_id=user.id,
        action="STOCKTAKE_CREATE",
        object_type="stocktakes",
        object_id=st.id,
        doc_type="stocktakes",
        doc_no=st.st_no,
    )
    db.session.commit()
    return ok(_payload(st), 201)


@bp.get("/<int:sid>")
@login_required
def get_stocktake(sid):
    st = db.session.get(Stocktake, sid)
    if st is None:
        return _bad("找不到此盤點單", 404)
    return ok(_payload(st))


@bp.put("/<int:sid>/lines")
@login_required
@roles_required(ROLE_WAREHOUSE, ROLE_ADMIN)
def update_lines(sid):
    st = db.session.get(Stocktake, sid)
    if st is None:
        return _bad("找不到此盤點單", 404)
    if st.status != IN_PROGRESS:
        return _bad(f"盤點單 {st.st_no} 已於 {st.status} 階段，不可修改實盤數量")
    data = request.get_json(silent=True) or {}
    rows = data.get("lines") or []
    index = {line.id: line for line in st.lines}
    for item in rows:
        line = index.get(_int(item.get("id")))
        if line is None:
            continue
        actual = item.get("actual_qty")
        if actual is None or actual == "":
            line.actual_qty = None
        else:
            try:
                value = Decimal(str(actual))
            except Exception:
                return _bad("實盤數量格式不正確")
            if value < 0:
                return _bad("實盤數量不可為負")
            line.actual_qty = value
    db.session.commit()
    return ok({"ok": True})


@bp.post("/<int:sid>/submit")
@login_required
@roles_required(ROLE_WAREHOUSE, ROLE_ADMIN)
def submit_stocktake(sid):
    st = db.session.get(Stocktake, sid)
    if st is None:
        return _bad("找不到此盤點單", 404)
    if any(line.actual_qty is None for line in st.lines):
        return _bad("所有品項都必須填寫實盤數量才能提交")

    total_book = sum((Decimal(str(line.book_qty)) for line in st.lines), Decimal("0"))
    total_abs_diff = sum(
        (abs(Decimal(str(line.actual_qty)) - Decimal(str(line.book_qty))) for line in st.lines),
        Decimal("0"),
    )
    rate = (total_abs_diff / total_book) if total_book > 0 else Decimal("0")

    for line in st.lines:
        line.diff_qty = Decimal(str(line.actual_qty)) - Decimal(str(line.book_qty))

    user = current_user()
    try:
        transition(st, "stocktakes", SUBMITTED, user.id, "STOCKTAKE_SUBMIT", doc_no=st.st_no)
    except DocumentError as e:
        db.session.rollback()
        return _bad(e.message, e.status)
    st.submitted_by = user.id
    st.submitted_at = db.func.now()
    st.total_diff_rate = rate
    db.session.commit()

    matched = sum(
        1 for line in st.lines if Decimal(str(line.actual_qty)) == Decimal(str(line.book_qty))
    )
    accuracy = (matched / len(st.lines)) if st.lines else 1.0
    return ok({"total_diff_rate": qty(rate), "accuracy_rate": round(accuracy, 4), "lines": _payload(st)["lines"]})


@bp.post("/<int:sid>/approve")
@login_required
@roles_required(ROLE_ADMIN)
def approve_stocktake(sid):
    st = db.session.get(Stocktake, sid)
    if st is None:
        return _bad("找不到此盤點單", 404)
    user = current_user()
    try:
        assert_second_person(st.submitted_by, user.id)
        transition(st, "stocktakes", APPROVED, user.id, "STOCKTAKE_APPROVE", doc_no=st.st_no)
        st.approved_by = user.id

        # 自動產生庫存調整並套用
        adj = Adjustment(
            adj_no=next_no("adjustments"),
            status=APPROVED,
            reason_code="STOCKTAKE",
            remark=f"盤點 {st.st_no} 差異調整",
            requested_by=user.id,
            approved_by=user.id,
        )
        db.session.add(adj)
        db.session.flush()
        for line in st.lines:
            if not line.diff_qty or Decimal(str(line.diff_qty)) == 0:
                continue
            db.session.add(
                AdjustmentLine(
                    adjustment_id=adj.id,
                    product_id=line.product_id,
                    batch_id=line.batch_id,
                    location_id=line.location_id,
                    qty_delta=line.diff_qty,
                    reason_code="STOCKTAKE",
                )
            )
            StockService.apply(
                product_id=line.product_id,
                location_id=line.location_id,
                qty_delta=Decimal(str(line.diff_qty)),
                movement_type=MOVE_ADJUSTMENT,
                operator_id=user.id,
                batch_id=line.batch_id,
                source_doc_type="ADJUSTMENT",
                source_doc_no=adj.adj_no,
                allow_negative=True,
                override_reason="STOCKTAKE",
                check_freeze=False,
            )
        db.session.commit()
    except (StockError, DocumentError) as e:
        db.session.rollback()
        return _bad(e.message, e.status)
    return ok({"ok": True})


@bp.post("/<int:sid>/abort")
@login_required
@roles_required(ROLE_WAREHOUSE, ROLE_ADMIN)
def abort_stocktake(sid):
    st = db.session.get(Stocktake, sid)
    if st is None:
        return _bad("找不到此盤點單", 404)
    user = current_user()
    try:
        transition(st, "stocktakes", ABORTED, user.id, "STOCKTAKE_ABORT", doc_no=st.st_no)
        db.session.commit()
    except DocumentError as e:
        db.session.rollback()
        return _bad(e.message, e.status)
    return ok({"ok": True})
