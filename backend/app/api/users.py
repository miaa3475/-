"""使用者與角色（PRD FR-2）。"""

from flask import Blueprint, jsonify, request

from ..auth import ROLE_ADMIN, hash_password, login_required, roles_required
from ..extensions import db
from ..models import Role, User
from ..services.audit import AuditService

bp = Blueprint("users", __name__, url_prefix="/api/users")


def _bad(msg, status=400):
    return jsonify({"error": msg}), status


def _payload(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "role_id": user.role_id,
        "role_code": user.role.code if user.role else None,
        "role_name": user.role.name if user.role else None,
        "is_active": user.is_active,
    }


@bp.get("")
@login_required
@roles_required(ROLE_ADMIN)
def list_users():
    rows = db.session.query(User).order_by(User.username).all()
    return jsonify([_payload(u) for u in rows])


@bp.post("")
@login_required
@roles_required(ROLE_ADMIN)
def create_user():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    display_name = (data.get("display_name") or "").strip()
    role_id = data.get("role_id")
    if not username or not password or not display_name or not role_id:
        return _bad("帳號、密碼、顯示名稱與角色必填")
    if db.session.query(User).filter(User.username == username).first():
        return _bad(f"帳號 {username} 已存在")
    role = db.session.get(Role, role_id)
    if role is None:
        return _bad("找不到此角色", 404)
    user = User(
        username=username,
        password_hash=hash_password(password),
        display_name=display_name,
        role_id=role.id,
        is_active=True,
        must_change_password=False,
    )
    db.session.add(user)
    db.session.flush()
    AuditService.record(
        actor_id=None,
        action="ROLE_ASSIGN",
        object_type="USER",
        object_id=user.id,
        field_name="role_id",
        new_value=role.code,
        doc_type="USER",
    )
    db.session.commit()
    return jsonify(_payload(user)), 201


@bp.put("/<int:uid>/role")
@login_required
@roles_required(ROLE_ADMIN)
def set_role(uid):
    user = db.session.get(User, uid)
    if user is None:
        return _bad("找不到此使用者", 404)
    role_id = request.get_json(silent=True) or {}
    role = db.session.get(Role, role_id.get("role_id"))
    if role is None:
        return _bad("找不到此角色", 404)
    old = user.role.code if user.role else None
    user.role_id = role.id
    AuditService.record(
        actor_id=user.id,
        action="ROLE_ASSIGN",
        object_type="USER",
        object_id=user.id,
        field_name="role_id",
        old_value=old,
        new_value=role.code,
        doc_type="USER",
    )
    db.session.commit()
    return jsonify(_payload(user))


@bp.get("/roles")
@login_required
def list_roles():
    rows = db.session.query(Role).order_by(Role.id).all()
    return jsonify([{"id": r.id, "code": r.code, "name": r.name} for r in rows])
