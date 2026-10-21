"""API 藍圖註冊。"""

from .audit import bp as audit_bp
from .auth import bp as auth_bp
from .dev import bp as dev_bp
from .master import bp as master_bp
from .purchasing import bp as purchasing_bp
from .reports import bp as reports_bp
from .sales import bp as sales_bp
from .stock import bp as stock_bp
from .stocktakes import bp as stocktakes_bp
from .users import bp as users_bp


def register_blueprints(app) -> None:
    app.register_blueprint(auth_bp)
    app.register_blueprint(master_bp)
    app.register_blueprint(stock_bp)
    app.register_blueprint(stocktakes_bp)
    app.register_blueprint(purchasing_bp)
    app.register_blueprint(sales_bp)
    app.register_blueprint(audit_bp)
    app.register_blueprint(reports_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(dev_bp)
