"""稽核軌跡查詢（PRD FR-22）。"""

from flask import Blueprint, jsonify, request

from ..auth import ROLE_ADMIN, login_required, mask_prices, roles_required
from ..extensions import db
from ..models import AuditLog
from ..serializers import dt

bp = Blueprint("audit", __name__, url_prefix="/api/audit")


def _int(value):
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


@bp.get("")
@login_required
@roles_required(ROLE_ADMIN)
def list_audit():
    page = max(1, _int(request.args.get("page")) or 1)
    page_size = min(200, max(1, _int(request.args.get("page_size")) or 50))
    actor_id = _int(request.args.get("actor_id"))
    object_type = request.args.get("object_type")
    date_from = request.args.get("from")
    date_to = request.args.get("to")

    query = db.session.query(AuditLog)
    if actor_id:
        query = query.filter(AuditLog.actor_id == actor_id)
    if object_type:
        query = query.filter(AuditLog.object_type == object_type)
    if date_from:
        query = query.filter(AuditLog.occurred_at >= f"{date_from} 00:00:00")
    if date_to:
        query = query.filter(AuditLog.occurred_at <= f"{date_to} 23:59:59")

    total = query.count()
    rows = (
        query.order_by(AuditLog.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    items = [
        {
            "id": row.id,
            "seq": row.seq,
            "occurred_at": dt(row.occurred_at),
            "actor_id": row.actor_id,
            "actor": row.actor.display_name if row.actor else None,
            "action": row.action,
            "object_type": row.object_type,
            "object_id": row.object_id,
            "field_name": row.field_name,
            "old_value": row.old_value,
            "new_value": row.new_value,
            "doc_type": row.doc_type,
            "doc_no": row.doc_no,
        }
        for row in rows
    ]
    return jsonify(mask_prices({"total": total, "items": items}))
