"""庫存端點：查詢、結存明細、進貨、領用、移位、庫存調整（PRD FR-9～FR-13、FR-19）。"""

from datetime import date, datetime, timedelta

from flask import Blueprint, g, jsonify, request

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
    SUBMITTED,
    VOIDED,
    Adjustment,
    AdjustmentLine,
    GoodsReceipt,
    GoodsReceiptLine,
    IssueOrder,
    IssueOrderLine,
    Location,
    Product,
    ProductBatch,
    PurchaseOrder,
    SalesOrder,
    StockBalance,
    StockLedger,
    User,
)
from ..serializers import d, dt, money, qty
from ..services.audit import AuditService
from ..services.documents import (
    DocumentError,
    assert_second_person,
    next_no,
    transition,
)
from ..services.stock import (
    MOVE_ADJUSTMENT,
    MOVE_ISSUE,
    MOVE_SALE,
    StockError,
    StockService,
)

bp = Blueprint("stock", __name__, url_prefix="/api")


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
    """統一出口：價格遮蔽在序列化層完成（PRD FR-3）。"""
    return jsonify(mask_prices(payload)), status


# --- 庫存查詢與結存明細 --------------------------------------------------
@bp.get("/stock")
@login_required
def query_stock():
    q = (request.args.get("q") or "").strip()
    barcode = (request.args.get("barcode") or "").strip()
    location_id = _int(request.args.get("location_id"))

    query = db.session.query(StockBalance).join(Product, StockBalance.product_id == Product.id)
    if q:
        like = f"%{q}%"
        query = query.filter(
            db.or_(Product.name.ilike(like), Product.product_code.ilike(like))
        )
    if barcode:
        query = query.filter(Product.barcode == barcode)
    if location_id:
        query = query.filter(StockBalance.location_id == location_id)

    rows = query.order_by(Product.product_code, StockBalance.location_id).all()
    items = []
    for bal in rows:
        batch = db.session.get(ProductBatch, bal.batch_id) if bal.batch_id else None
        location = db.session.get(Location, bal.location_id)
        items.append(
            {
                "product_id": bal.product_id,
                "product_code": bal.product.product_code,
                "name": bal.product.name,
                "barcode": bal.product.barcode,
                "batch_id": bal.batch_id,
                "batch_no": batch.batch_no if batch else None,
                "location_id": bal.location_id,
                "location_code": location.code if location else None,
                "on_hand": qty(bal.on_hand),
                "is_batch_tracked": bal.product.is_batch_tracked,
            }
        )
    return ok(items)


@bp.get("/stock/ledger")
@login_required
def query_ledger():
    page = max(1, _int(request.args.get("page")) or 1)
    page_size = min(200, max(1, _int(request.args.get("page_size")) or 50))
    product_id = _int(request.args.get("product_id"))
    location_id = _int(request.args.get("location_id"))
    batch_id = _int(request.args.get("batch_id"))
    movement_type = request.args.get("movement_type")
    date_from = request.args.get("from")
    date_to = request.args.get("to")

    query = db.session.query(StockLedger).join(
        Product, StockLedger.product_id == Product.id
    )
    if product_id:
        query = query.filter(StockLedger.product_id == product_id)
    if location_id:
        query = query.filter(StockLedger.location_id == location_id)
    if batch_id:
        query = query.filter(StockLedger.batch_id == batch_id)
    if movement_type:
        query = query.filter(StockLedger.movement_type == movement_type)
    if date_from:
        query = query.filter(StockLedger.occurred_at >= f"{date_from} 00:00:00")
    if date_to:
        query = query.filter(StockLedger.occurred_at <= f"{date_to} 23:59:59")

    total = query.count()
    rows = (
        query.order_by(StockLedger.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    items = []
    for row in rows:
        batch = db.session.get(ProductBatch, row.batch_id) if row.batch_id else None
        location = db.session.get(Location, row.location_id)
        items.append(
            {
                "id": row.id,
                "seq": row.seq,
                "occurred_at": dt(row.occurred_at),
                "product_id": row.product_id,
                "product_code": row.product.product_code,
                "name": row.product.name,
                "batch_id": row.batch_id,
                "batch_no": batch.batch_no if batch else None,
                "location_id": row.location_id,
                "location_code": location.code if location else None,
                "movement_type": row.movement_type,
                "qty_delta": qty(row.qty_delta),
                "source_doc_type": row.source_doc_type,
                "source_doc_no": row.source_doc_no,
                "purpose": row.purpose,
                "operator": row.operator.display_name if row.operator else None,
                "override_by": row.override_by,
                "override_reason": row.override_reason,
            }
        )
    return ok({"total": total, "items": items})


# --- 進貨單 --------------------------------------------------------------
def receipt_payload(r: GoodsReceipt) -> dict:
    order = r.order
    return {
        "id": r.id,
        "gr_no": r.gr_no,
        "po_id": r.po_id,
        "po_no": order.po_no if order else None,
        "status": r.status,
        "received_at": dt(r.received_at),
        "operator": r.operator.display_name if r.operator else None,
        "reason": r.reason,
        "total_amount": money(
            sum((line.qty * (line.unit_price or 0) for line in r.lines), start=0)
        ),
        "lines": [
            {
                "id": line.id,
                "product_id": line.product_id,
                "product_code": line.product.product_code,
                "name": line.product.name,
                "batch_id": line.batch_id,
                "batch_no": line.batch_no,
                "qty": qty(line.qty),
                "expiry_date": d(line.expiry_date),
                "location_id": line.location_id,
                "location_code": line.location.code if line.location else None,
                "unit_price": money(line.unit_price),
            }
            for line in r.lines
        ],
    }


@bp.get("/receipts")
@login_required
def list_receipts():
    po_id = _int(request.args.get("po_id"))
    status = request.args.get("status")
    date_from = request.args.get("from")
    date_to = request.args.get("to")
    query = db.session.query(GoodsReceipt)
    if po_id:
        query = query.filter(GoodsReceipt.po_id == po_id)
    if status:
        query = query.filter(GoodsReceipt.status == status)
    if date_from:
        query = query.filter(GoodsReceipt.received_at >= f"{date_from} 00:00:00")
    if date_to:
        query = query.filter(GoodsReceipt.received_at <= f"{date_to} 23:59:59")
    rows = query.order_by(GoodsReceipt.id.desc()).all()
    return ok([receipt_payload(r) for r in rows])


@bp.post("/receipts")
@login_required
@roles_required(ROLE_WAREHOUSE, ROLE_PURCHASE, ROLE_ADMIN)
def create_receipt():
    data = request.get_json(silent=True) or {}
    lines = data.get("lines") or []
    if not lines:
        return _bad("至少需要一筆品項")

    po = None
    po_id = _int(data.get("po_id"))
    if po_id:
        po = db.session.get(PurchaseOrder, po_id)
        if po is None:
            return _bad("找不到此採購單", 404)
        if po.status != APPROVED:
            return _bad(f"採購單 {po.po_no} 尚未核准，不能收貨")

    user = current_user()
    receipt = GoodsReceipt(
        gr_no=next_no("goods_receipts"),
        po_id=po_id,
        status=SUBMITTED,
        operator_id=user.id,
        reason=(data.get("reason") or "").strip() or None,
    )
    db.session.add(receipt)
    db.session.flush()

    total = 0.0
    try:
        for item in lines:
            product_id = _int(item.get("product_id"))
            location_id = _int(item.get("location_id"))
            qty_value = _dec(item.get("qty"), 0)
            if not product_id or not location_id:
                return _bad("商品與庫位必填")
            if not qty_value or qty_value <= 0:
                return _bad("數量必須大於 0")
            product = db.session.get(Product, product_id)
            if product is None:
                return _bad("找不到此商品", 404)
            if product.status != "ACTIVE":
                return _bad(f"商品 {product.name} 已停用，不能入貨")
            location = db.session.get(Location, location_id)
            if location is None:
                return _bad("找不到此庫位", 404)
            if location.is_frozen:
                return _bad(f"庫位 {location.code} 已凍結，不能入貨")
            if location.is_aggregate:
                return _bad(f"庫位 {location.code} 為彙總層，不能存放商品")

            unit_price = _dec(item.get("unit_price"))
            if po is not None and unit_price is None:
                po_line = next(
                    (pl for pl in po.lines if pl.product_id == product_id), None
                )
                unit_price = float(po_line.unit_price) if po_line else None

            # 超收檢查（PRD FR-9）
            if po is not None:
                po_line = next(
                    (pl for pl in po.lines if pl.product_id == product_id), None
                )
                if po_line is not None:
                    if float(po_line.qty_received) + qty_value > float(po_line.qty_ordered):
                        return _bad(
                            f"商品 {product.name} 超收：已收 {qty(po_line.qty_received)}，"
                            f"訂購 {qty(po_line.qty_ordered)}"
                        )
                    po_line.qty_received = float(po_line.qty_received) + qty_value

            batch_id = None
            batch_no = (item.get("batch_no") or "").strip() or None
            if product.is_batch_tracked and not batch_no:
                return _bad(f"商品 {product.name} 啟用批次管理，必須輸入批號")

            StockService.receive(
                product_id=product_id,
                location_id=location_id,
                qty=qty_value,
                operator_id=user.id,
                batch_no=batch_no,
                expiry_date=_date(item.get("expiry_date")),
                source_doc_no=receipt.gr_no,
            )
            if batch_no:
                batch = (
                    db.session.query(ProductBatch)
                    .filter(
                        ProductBatch.product_id == product_id,
                        ProductBatch.batch_no == batch_no,
                    )
                    .first()
                )
                batch_id = batch.id if batch else None

            receipt_line = GoodsReceiptLine(
                gr_id=receipt.id,
                product_id=product_id,
                batch_id=batch_id,
                qty=qty_value,
                batch_no=batch_no,
                expiry_date=_date(item.get("expiry_date")),
                location_id=location_id,
                unit_price=unit_price,
            )
            db.session.add(receipt_line)
            total += qty_value * (unit_price or 0)
    except StockError as e:
        db.session.rollback()
        return _bad(e.message, e.status)

    db.session.commit()
    return ok(receipt_payload(receipt), 201)


@bp.post("/receipts/<int:rid>/void")
@login_required
@roles_required(ROLE_ADMIN)
def void_receipt(rid):
    receipt = db.session.get(GoodsReceipt, rid)
    if receipt is None:
        return _bad("找不到此進貨單", 404)
    if receipt.status == VOIDED:
        return _bad("此進貨單已作廢")
    user = current_user()

    try:
        for line in receipt.lines:
            ledgers = (
                db.session.query(StockLedger)
                .filter(
                    StockLedger.source_doc_no == receipt.gr_no,
                    StockLedger.product_id == line.product_id,
                    StockLedger.location_id == line.location_id,
                    StockLedger.movement_type == "RECEIPT",
                )
                .all()
            )
            for ledger in ledgers:
                StockService.reverse(ledger=ledger, operator_id=user.id, reason="進貨單作廢")
        transition(
            receipt,
            "goods_receipts",
            VOIDED,
            user.id,
            "DOC_VOID",
            doc_no=receipt.gr_no,
        )
        db.session.commit()
    except StockError as e:
        db.session.rollback()
        return _bad(e.message, e.status)
    return ok({"ok": True, "id": receipt.id})


# --- 領用單 --------------------------------------------------------------
def issue_payload(row: IssueOrder) -> dict:
    return {
        "id": row.id,
        "issue_no": row.issue_no,
        "status": row.status,
        "purpose": row.purpose,
        "remark": row.remark,
        "operator": row.operator.display_name if row.operator else None,
        "occurred_at": dt(row.occurred_at),
        "lines": [
            {
                "id": line.id,
                "product_id": line.product_id,
                "product_code": line.product.product_code,
                "name": line.product.name,
                "batch_id": line.batch_id,
                "batch_no": line.batch.batch_no if line.batch else None,
                "qty": qty(line.qty),
                "location_id": line.location_id,
                "location_code": line.location.code if line.location else None,
            }
            for line in row.lines
        ],
    }


@bp.get("/issues")
@login_required
def list_issues():
    query = db.session.query(IssueOrder)
    date_from = request.args.get("from")
    date_to = request.args.get("to")
    if date_from:
        query = query.filter(IssueOrder.occurred_at >= f"{date_from} 00:00:00")
    if date_to:
        query = query.filter(IssueOrder.occurred_at <= f"{date_to} 23:59:59")
    rows = query.order_by(IssueOrder.id.desc()).all()
    return ok([issue_payload(r) for r in rows])


@bp.post("/issues")
@login_required
@roles_required(ROLE_WAREHOUSE, ROLE_ADMIN)
def create_issue():
    data = request.get_json(silent=True) or {}
    lines = data.get("lines") or []
    purpose = (data.get("purpose") or "").strip()
    if purpose == "SALE":
        return _bad("領用用途不可為「銷貨」，銷貨請使用銷貨單")
    if not purpose:
        return _bad("用途必填")
    if not lines:
        return _bad("至少需要一筆品項")

    user = current_user()
    issue = IssueOrder(
        issue_no=next_no("issue_orders"),
        status=SUBMITTED,
        purpose=purpose,
        remark=(data.get("remark") or "").strip() or None,
        operator_id=user.id,
    )
    db.session.add(issue)
    db.session.flush()

    try:
        for item in lines:
            product_id = _int(item.get("product_id"))
            location_id = _int(item.get("location_id"))
            batch_id = _int(item.get("batch_id"))
            qty_value = _dec(item.get("qty"), 0)
            if not product_id or not location_id:
                return _bad("商品與庫位必填")
            if not qty_value or qty_value <= 0:
                return _bad("數量必須大於 0")
            location = db.session.get(Location, location_id)
            if location is not None and location.is_frozen:
                return _bad(f"庫位 {location.code} 已凍結，不能出貨")
            StockService.issue(
                product_id=product_id,
                location_id=location_id,
                qty=qty_value,
                operator_id=user.id,
                batch_id=batch_id,
                purpose=purpose,
                source_doc_no=issue.issue_no,
            )
            db.session.add(
                IssueOrderLine(
                    issue_id=issue.id,
                    product_id=product_id,
                    batch_id=batch_id,
                    qty=qty_value,
                    location_id=location_id,
                )
            )
    except StockError as e:
        db.session.rollback()
        return _bad(e.message, e.status)

    db.session.commit()
    return ok(issue_payload(issue), 201)


@bp.post("/issues/<int:iid>/void")
@login_required
@roles_required(ROLE_ADMIN)
def void_issue(iid):
    issue = db.session.get(IssueOrder, iid)
    if issue is None:
        return _bad("找不到此領用單", 404)
    if issue.status == VOIDED:
        return _bad("此領用單已作廢")
    user = current_user()
    try:
        for line in issue.lines:
            ledgers = (
                db.session.query(StockLedger)
                .filter(
                    StockLedger.source_doc_no == issue.issue_no,
                    StockLedger.product_id == line.product_id,
                    StockLedger.location_id == line.location_id,
                    StockLedger.movement_type == MOVE_ISSUE,
                )
                .all()
            )
            for ledger in ledgers:
                StockService.reverse(ledger=ledger, operator_id=user.id, reason="領用單作廢")
        transition(issue, "issue_orders", VOIDED, user.id, "DOC_VOID", doc_no=issue.issue_no)
        db.session.commit()
    except StockError as e:
        db.session.rollback()
        return _bad(e.message, e.status)
    return ok({"ok": True, "id": issue.id})


# --- 移位 ----------------------------------------------------------------
@bp.post("/stock/moves")
@login_required
@roles_required(ROLE_WAREHOUSE, ROLE_ADMIN)
def create_move():
    data = request.get_json(silent=True) or {}
    product_id = _int(data.get("product_id"))
    from_location_id = _int(data.get("from_location_id"))
    to_location_id = _int(data.get("to_location_id"))
    batch_id = _int(data.get("batch_id"))
    qty_value = _dec(data.get("qty"), 0)
    if not product_id or not from_location_id or not to_location_id:
        return _bad("商品、來源庫位與目標庫位必填")
    if from_location_id == to_location_id:
        return _bad("來源庫位與目標庫位不可相同")
    if not qty_value or qty_value <= 0:
        return _bad("數量必須大於 0")
    target = db.session.get(Location, to_location_id)
    if target is not None and target.is_frozen:
        return _bad(f"庫位 {target.code} 已凍結，不能移入")

    user = current_user()
    try:
        ledger = StockService.move(
            product_id=product_id,
            from_location_id=from_location_id,
            to_location_id=to_location_id,
            qty=qty_value,
            operator_id=user.id,
            batch_id=batch_id,
        )
        db.session.commit()
    except StockError as e:
        db.session.rollback()
        return _bad(e.message, e.status)
    return ok({"id": ledger.id, "seq": ledger.seq}, 201)


# --- 庫存調整 ------------------------------------------------------------
def adjustment_payload(row: Adjustment) -> dict:
    return {
        "id": row.id,
        "adj_no": row.adj_no,
        "status": row.status,
        "reason_code": row.reason_code,
        "remark": row.remark,
        "requested_by": row.requested_by_user.display_name if row.requested_by_user else None,
        "approved_by": row.approved_by_user.display_name if row.approved_by_user else None,
        "created_at": dt(row.created_at),
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
                "qty_delta": qty(line.qty_delta),
            }
            for line in row.lines
        ],
    }


@bp.get("/adjustments")
@login_required
def list_adjustments():
    status = request.args.get("status")
    query = db.session.query(Adjustment)
    if status:
        query = query.filter(Adjustment.status == status)
    rows = query.order_by(Adjustment.id.desc()).all()
    return ok([adjustment_payload(a) for a in rows])


@bp.post("/adjustments")
@login_required
@roles_required(ROLE_WAREHOUSE, ROLE_ADMIN)
def create_adjustment():
    data = request.get_json(silent=True) or {}
    lines = data.get("lines") or []
    reason_code = (data.get("reason_code") or "").strip()
    if not reason_code:
        return _bad("原因代碼必填")
    if not lines:
        return _bad("至少需要一筆品項")
    user = current_user()
    row = Adjustment(
        adj_no=next_no("adjustments"),
        status=DRAFT,
        reason_code=reason_code,
        remark=(data.get("remark") or "").strip() or None,
        requested_by=user.id,
    )
    db.session.add(row)
    db.session.flush()
    for item in lines:
        product_id = _int(item.get("product_id"))
        location_id = _int(item.get("location_id"))
        qty_delta = _dec(item.get("qty_delta"))
        if not product_id or not location_id or qty_delta is None:
            return _bad("商品、庫位與異動數量必填")
        db.session.add(
            AdjustmentLine(
                adjustment_id=row.id,
                product_id=product_id,
                batch_id=_int(item.get("batch_id")),
                location_id=location_id,
                qty_delta=qty_delta,
                reason_code=reason_code,
            )
        )
    db.session.commit()
    return ok(adjustment_payload(row), 201)


@bp.post("/adjustments/<int:aid>/submit")
@login_required
@roles_required(ROLE_WAREHOUSE, ROLE_ADMIN)
def submit_adjustment(aid):
    row = db.session.get(Adjustment, aid)
    if row is None:
        return _bad("找不到此調整單", 404)
    user = current_user()
    try:
        transition(row, "adjustments", PENDING_APPROVAL, user.id, "ADJUSTMENT_SUBMIT", doc_no=row.adj_no)
        db.session.commit()
    except DocumentError as e:
        db.session.rollback()
        return _bad(e.message, e.status)
    return ok({"ok": True})


@bp.post("/adjustments/<int:aid>/approve")
@login_required
@roles_required(ROLE_ADMIN)
def approve_adjustment(aid):
    row = db.session.get(Adjustment, aid)
    if row is None:
        return _bad("找不到此調整單", 404)
    user = current_user()
    try:
        assert_second_person(row.requested_by, user.id)
        transition(row, "adjustments", APPROVED, user.id, "ADJUSTMENT_APPROVE", doc_no=row.adj_no)
        row.approved_by = user.id
        for line in row.lines:
            StockService.apply(
                product_id=line.product_id,
                location_id=line.location_id,
                qty_delta=line.qty_delta,
                movement_type=MOVE_ADJUSTMENT,
                operator_id=user.id,
                batch_id=line.batch_id,
                source_doc_type="ADJUSTMENT",
                source_doc_no=row.adj_no,
                allow_negative=True,
                override_reason=row.reason_code,
            )
        db.session.commit()
    except (StockError, DocumentError) as e:
        db.session.rollback()
        return _bad(e.message, e.status)
    return ok({"ok": True})
