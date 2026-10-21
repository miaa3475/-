"""開發用端點：重置種子資料（PRD SM-4）。"""

from flask import Blueprint, jsonify

from ..auth import ROLE_ADMIN, login_required, roles_required
from ..seed import seed_database

bp = Blueprint("dev", __name__, url_prefix="/api/dev")


@bp.post("/seed")
@login_required
@roles_required(ROLE_ADMIN)
def reset_seed():
    result = seed_database(reset=True)
    return jsonify({"ok": True, **result})
