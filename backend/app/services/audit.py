"""AuditService — 稽核軌跡唯一寫入點（PRD FR-22）。"""

from ..auth import entry_hash
from ..extensions import db
from ..models import AuditLog


class AuditService:
    SENSITIVE_ACTIONS = {
        "ROLE_ASSIGN",
        "SAFETY_STOCK_UPDATE",
        "ADJUSTMENT_CREATE",
        "ADJUSTMENT_SUBMIT",
        "ADJUSTMENT_APPROVE",
        "STOCKTAKE_CREATE",
        "STOCKTAKE_SUBMIT",
        "STOCKTAKE_APPROVE",
        "STOCKTAKE_ABORT",
        "STOCKTAKE_FREEZE_RELEASE",
        "DOC_SUBMIT",
        "DOC_APPROVE",
        "DOC_REJECT",
        "DOC_VOID",
        "NEGATIVE_STOCK_OVERRIDE",
        "LOGIN",
        "LOGOUT",
    }

    @staticmethod
    def record(
        actor_id,
        action: str,
        object_type: str,
        object_id=None,
        field_name: str | None = None,
        old_value=None,
        new_value=None,
        doc_type: str | None = None,
        doc_no: str | None = None,
    ) -> AuditLog:
        """寫入一筆稽核紀錄（同一交易內）。"""
        if action not in AuditService.SENSITIVE_ACTIONS:
            raise ValueError(f"非敏感操作不得寫入稽核軌跡: {action}")

        prev = (
            db.session.query(AuditLog)
            .order_by(AuditLog.id.desc())
            .limit(1)
            .first()
        )
        prev_hash = prev.entry_hash if prev else None

        payload = "|".join(
            str(x)
            for x in [
                actor_id,
                action,
                object_type,
                object_id,
                field_name,
                old_value,
                new_value,
                doc_type,
                doc_no,
            ]
        )
        row = AuditLog(
            actor_id=actor_id,
            action=action,
            object_type=object_type,
            object_id=str(object_id) if object_id is not None else None,
            field_name=field_name,
            old_value=None if old_value is None else str(old_value)[:255],
            new_value=None if new_value is None else str(new_value)[:255],
            doc_type=doc_type,
            doc_no=doc_no,
            prev_hash=prev_hash,
            entry_hash=entry_hash(prev_hash, payload),
        )
        db.session.add(row)
        return row
