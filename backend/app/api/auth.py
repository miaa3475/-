"""認證端點（PRD FR-1）。"""

from flask import Blueprint, g, jsonify, request

from ..auth import (
    current_user,
    issue_token,
    login_required,
    revoke_token,
    user_payload,
    verify_password,
)
from ..extensions import db
from ..models import User
from ..services.audit import AuditService

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    user = db.session.query(User).filter(User.username == username).first()
    # 不透露帳號是否存在
    if user is None or not user.is_active or not verify_password(user.password_hash, password):
        return jsonify({"error": "帳號或密碼錯誤"}), 401

    token = issue_token(user)
    AuditService.record(
        actor_id=user.id,
        action="LOGIN",
        object_type="USER",
        object_id=user.id,
        doc_type="USER",
    )
    db.session.commit()
    return jsonify({"token": token, "user": user_payload(user)})


@bp.post("/logout")
@login_required
def logout():
    from ..auth import _bearer_token

    token = _bearer_token()
    AuditService.record(
        actor_id=g.current_user.id,
        action="LOGOUT",
        object_type="USER",
        object_id=g.current_user.id,
        doc_type="USER",
    )
    db.session.commit()
    if token:
        revoke_token(token)
    return jsonify({"ok": True})


@bp.get("/me")
@login_required
def me():
    return jsonify({"user": user_payload(current_user())})
