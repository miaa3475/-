"""單據狀態機與單號產生（PRD FR-18、FR-20）。"""

from datetime import datetime

from ..extensions import db
from ..models import (
    ABORTED,
    APPROVED,
    DRAFT,
    IN_PROGRESS,
    PENDING_APPROVAL,
    REJECTED,
    SUBMITTED,
    VOIDED,
    Adjustment,
    GoodsReceipt,
    IssueOrder,
    PurchaseOrder,
    SalesOrder,
    Stocktake,
)
from .audit import AuditService

# 各單據的合法狀態流轉（不可跳階、不可逆向）
STATE_MACHINES = {
    "purchase_orders": {
        DRAFT: [PENDING_APPROVAL],
        PENDING_APPROVAL: [APPROVED, REJECTED],
        APPROVED: [VOIDED],
        REJECTED: [],
        VOIDED: [],
    },
    "goods_receipts": {
        DRAFT: [SUBMITTED],
        SUBMITTED: [VOIDED],
        VOIDED: [],
    },
    "issue_orders": {
        DRAFT: [SUBMITTED],
        SUBMITTED: [VOIDED],
        VOIDED: [],
    },
    "sales_orders": {
        DRAFT: [SUBMITTED],
        SUBMITTED: [VOIDED],
        VOIDED: [],
    },
    "stocktakes": {
        IN_PROGRESS: [SUBMITTED, ABORTED],
        SUBMITTED: [APPROVED, VOIDED],
        APPROVED: [VOIDED],
        ABORTED: [],
        VOIDED: [],
    },
    "adjustments": {
        DRAFT: [PENDING_APPROVAL],
        PENDING_APPROVAL: [APPROVED, REJECTED],
        APPROVED: [VOIDED],
        REJECTED: [],
        VOIDED: [],
    },
}

DOC_MODELS = {
    "purchase_orders": PurchaseOrder,
    "goods_receipts": GoodsReceipt,
    "issue_orders": IssueOrder,
    "sales_orders": SalesOrder,
    "stocktakes": Stocktake,
    "adjustments": Adjustment,
}

PREFIXES = {
    "purchase_orders": "PO",
    "goods_receipts": "GR",
    "issue_orders": "IS",
    "sales_orders": "SO",
    "stocktakes": "ST",
    "adjustments": "AD",
}

NO_COLUMNS = {
    "purchase_orders": PurchaseOrder.po_no,
    "goods_receipts": GoodsReceipt.gr_no,
    "issue_orders": IssueOrder.issue_no,
    "sales_orders": SalesOrder.so_no,
    "stocktakes": Stocktake.st_no,
    "adjustments": Adjustment.adj_no,
}


class DocumentError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


def next_no(doc_type: str) -> str:
    """產生 `PREFIX-YYYYMMDD-NNNN` 格式單號，序號於當日遞增。"""
    today = datetime.utcnow().strftime("%Y%m%d")
    prefix = PREFIXES[doc_type]
    like = f"{prefix}-{today}-%"
    column = NO_COLUMNS[doc_type]
    count = db.session.query(column).filter(column.like(like)).count()
    return f"{prefix}-{today}-{count + 1:04d}"


def can_transition(doc_type: str, current: str, target: str) -> bool:
    return target in STATE_MACHINES.get(doc_type, {}).get(current, [])


def transition(doc, doc_type: str, target: str, user_id: int, action: str, doc_no: str | None = None):
    """套用狀態轉移並寫入稽核軌跡。"""
    if not can_transition(doc_type, doc.status, target):
        raise DocumentError(
            f"不允許的狀態轉移：{doc.status} → {target}", status=400
        )
    old = doc.status
    doc.status = target
    AuditService.record(
        actor_id=user_id,
        action=action,
        object_type=doc_type,
        object_id=getattr(doc, "id"),
        field_name="status",
        old_value=old,
        new_value=target,
        doc_type=doc_type,
        doc_no=doc_no,
    )
    return doc


def assert_second_person(requester_id: int, approver_id: int | None) -> None:
    """第二人覆核：送單者不可為核准者本人（PRD §6）。"""
    if approver_id is not None and approver_id == requester_id:
        raise DocumentError("送單者與核准者不得為同一人（需第二人覆核）", status=400)
