"""共用擴充點實例 — 獨立模組以避免 models 與 app 的循環 import。"""

from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()
migrate = Migrate()
