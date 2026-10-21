"""應用程式工廠。"""

import os
from pathlib import Path

from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

from .config import Config, PROJECT_ROOT
from .extensions import db, migrate


def create_app(config_object=Config) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config_object)

    CORS(app, resources={r"/api/*": {"origins": "*"}})

    db.init_app(app)
    migrate.init_app(app, db)

    from . import models  # noqa: F401  — 註冊模型

    from .api import register_blueprints

    register_blueprints(app)

    from .seed import seed_command

    app.cli.add_command(seed_command)

    @app.errorhandler(HTTPException)
    def handle_http_error(e):
        return jsonify({"error": e.description}), e.code

    @app.errorhandler(Exception)
    def handle_unexpected(e):
        from .services.documents import DocumentError
        from .services.stock import StockError

        if isinstance(e, (StockError, DocumentError)):
            return jsonify({"error": e.message}), e.status
        app.logger.exception("未預期的錯誤")
        return jsonify({"error": f"伺服器錯誤：{e}"}), 500

    if app.config.get("SERVE_FRONTEND"):
        _mount_frontend(app)

    return app


def _mount_frontend(app: Flask) -> None:
    """單一 port 模式：直接由 Flask 提供 React 建置產物。"""
    dist = PROJECT_ROOT / "frontend" / "dist"

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def spa(path):
        if path.startswith("api/"):
            return jsonify({"error": "找不到此 API"}), 404
        candidate = dist / path
        if path and candidate.is_file():
            return send_from_directory(dist, path)
        return send_from_directory(dist, "index.html")
