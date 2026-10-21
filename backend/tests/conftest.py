"""pytest 設定。

測試使用獨立的 `Ailearn_test` 資料庫，不碰正式的 `Ailearn`。
"""

import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://postgres:12345678@localhost:5432/ailearn_test",
)
os.environ["TOKEN_TTL_MINUTES"] = "30"

import pytest  # noqa: E402

from app import create_app  # noqa: E402
from app.auth import hash_password  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models import (  # noqa: E402
    Location,
    Product,
    ProductCategory,
    Role,
    Supplier,
    User,
    Warehouse,
)


@pytest.fixture()
def app():
    application = create_app()
    with application.app_context():
        db.drop_all()
        db.create_all()
        _seed_minimal()
        yield application
        db.session.remove()
        db.drop_all()


def _seed_minimal():
    warehouse = Warehouse(code="WH-T", name="測試倉")
    db.session.add(warehouse)
    db.session.flush()

    zone = Location(
        warehouse_id=warehouse.id, code="A", name="A 區", is_aggregate=True, status="ACTIVE"
    )
    db.session.add(zone)
    db.session.flush()
    for code in ("A-01-01", "A-01-02", "B-01-01"):
        db.session.add(
            Location(
                warehouse_id=warehouse.id,
                parent_id=zone.id,
                code=code,
                name=code,
                status="ACTIVE",
            )
        )
    db.session.flush()

    category = ProductCategory(code="DRINK", name="飲料", safety_stock=10, reorder_multiplier=2)
    db.session.add(category)
    db.session.flush()

    db.session.add(
        Product(
            product_code="P-000001",
            name="飲料-001",
            barcode="47100000001",
            category_id=category.id,
            unit="箱",
            purchase_price=100,
            is_batch_tracked=False,
            status="ACTIVE",
        )
    )
    db.session.add(
        Product(
            product_code="P-000002",
            name="飲料-002",
            barcode="47100000002",
            category_id=category.id,
            unit="箱",
            purchase_price=200,
            is_batch_tracked=True,
            status="ACTIVE",
        )
    )
    db.session.flush()

    db.session.add(
        Supplier(
            tax_id="12345678",
            company_name="測試供應商",
            contact_name="王大明",
            phone="02-12345678",
            status="ACTIVE",
        )
    )
    db.session.flush()

    roles = {}
    for code, name in [("WAREHOUSE", "倉管"), ("PURCHASE", "採購"), ("ADMIN", "主管")]:
        role = Role(code=code, name=name)
        db.session.add(role)
        roles[code] = role
    db.session.flush()

    for username, code in [
        ("wh", "WAREHOUSE"),
        ("pc", "PURCHASE"),
        ("ad1", "ADMIN"),
        ("ad2", "ADMIN"),
    ]:
        db.session.add(
            User(
                username=username,
                password_hash=hash_password("demo1234"),
                display_name=username,
                role_id=roles[code].id,
                is_active=True,
            )
        )
    db.session.commit()


@pytest.fixture()
def client(app):
    return app.test_client()


def login(client, username="wh"):
    response = client.post(
        "/api/auth/login", json={"username": username, "password": "demo1234"}
    )
    assert response.status_code == 200, response.get_json()
    return response.get_json()["token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def location_id(client, token, code="A-01-01"):
    locations = client.get("/api/locations", headers=auth(token)).get_json()
    for loc in locations:
        if loc["code"] == code:
            return loc["id"]
    raise AssertionError(f"找不到庫位 {code}")
