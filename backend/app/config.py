"""應用程式設定。連線字串來自專案根目錄的 .env。"""

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent          # backend/
PROJECT_ROOT = BASE_DIR.parent                              # 專案根目錄

load_dotenv(PROJECT_ROOT / ".env")


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-only-change-me")
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL", "postgresql+psycopg://postgres:12345678@localhost:5432/Ailearn"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_recycle": 300,
    }
    JSON_AS_ASCII = False
    TOKEN_TTL_MINUTES = int(os.environ.get("TOKEN_TTL_MINUTES", "30"))
    SERVE_FRONTEND = os.environ.get("SERVE_FRONTEND", "0") == "1"
