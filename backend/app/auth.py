"""認證、角色權限與價格遮蔽（PRD FR-1～FR-3）。"""

import hashlib
import secrets
from datetime import datetime, timedelta
from functools import wraps

from flask import current_app, g, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

from .extensions import db
from .models import AuthToken, Role, User

ROLE_WAREHOUSE = "WAREHOUSE"
ROLE_PURCHASE = "PURCHASE"
ROLE_ADMIN = "ADMIN"

# 價格遮蔽要移除的欄位（依角色判斷）
PRICE_FIELDS_HIDDEN = {
    "purchase_price",
    "unit_price",
    "amount",
}


def hash_password(raw: str) -> str:
    return generate_password_hash(raw)


def verify_password(stored_hash: str, raw: str) -> bool:
    return check_password_hash(stored_hash, raw)


def issue_token(user: User) -> str:
    ttl = current_app.config["TOKEN_TTL_MINUTES"]
    token = secrets.token_urlsafe(32)
    db.session.add(
        AuthToken(
            token=token,
            user_id=user.id,
            created_at=datetime.utcnow(),
            last_seen_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(minutes=ttl),
        )
    )
    db.session.commit()
    return token


def revoke_token(token: str) -> None:
    row = db.session.get(AuthToken, token)
    if row:
        db.session.delete(row)
        db.session.commit()


def _bearer_token() -> str | None:
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        return header[7:].strip()
    return None


def current_user():
    return getattr(g, "current_user", None)


def current_role() -> str | None:
    user = current_user()
    return user.role.code if user and user.role else None


def load_user():
    """解析 Bearer token → g.current_user。閒置逾時自動失效。"""
    token = _bearer_token()
    if not token:
        return None
    row = db.session.get(AuthToken, token)
    if row is None:
        return None
    if row.expires_at < datetime.utcnow():
        db.session.delete(row)
        db.session.commit()
        return None
    row.last_seen_at = datetime.utcnow()
    db.session.commit()
    return row.user


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = load_user()
        if user is None or not user.is_active:
            return jsonify({"error": "請先登入或權杖已過期"}), 401
        g.current_user = user
        return fn(*args, **kwargs)

    return wrapper


def roles_required(*allowed):
    """只有指定角色可呼叫。ADMIN 視為全權。"""

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = current_user()
            role = current_role()
            if role is None:
                return jsonify({"error": "請先登入"}), 401
            if role != ROLE_ADMIN and role not in allowed:
                return jsonify({"error": "沒有執行此操作的權限"}), 403
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def is_admin() -> bool:
    return current_role() == ROLE_ADMIN


def mask_prices(payload, role: str | None = None):
    """價格遮蔽在序列化層完成（PRD FR-3）。倉管看不到採購單價與進貨金額。"""
    role = role or current_role()
    if role != ROLE_WAREHOUSE:
        return payload
    if isinstance(payload, dict):
        return {
            k: mask_prices(v, role)
            for k, v in payload.items()
            if k not in PRICE_FIELDS_HIDDEN
        }
    if isinstance(payload, list):
        return [mask_prices(v, role) for v in payload]
    return payload


def user_payload(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "role": user.role.code if user.role else None,
        "role_name": user.role.name if user.role else None,
    }


def ensure_roles() -> None:
    """建立三種固定角色（PRD FR-2）。"""
    defaults = [
        (ROLE_WAREHOUSE, "倉管人員"),
        (ROLE_PURCHASE, "採購人員"),
        (ROLE_ADMIN, "主管"),
    ]
    for code, name in defaults:
        if db.session.query(Role).filter_by(code=code).first() is None:
            db.session.add(Role(code=code, name=name))
    db.session.commit()


def entry_hash(prev_hash: str | None, payload: str) -> str:
    """稽核軌跡的雜湊鏈（addendum §1.9）。"""
    return hashlib.sha256(f"{prev_hash or ''}|{payload}".encode("utf-8")).hexdigest()
