"""資料模型。

欄位名稱與語意對照 `_bmad-output/planning-artifacts/prds/prd-庫存管理系統-2026-10-21-r2/addendum.md` §2。
相對附錄的兩處補充（實作必要，已記錄於 spec Implementation Notes）：
  - `issue_orders` / `issue_order_lines`：領用單（附錄 §2.3 遺漏）。
  - `auth_tokens`：登入權杖（附錄 §2.4 遺漏）。
"""

from datetime import date, datetime

from .extensions import db

# --- 單據狀態列舉 -------------------------------------------------------
DRAFT = "DRAFT"
PENDING_APPROVAL = "PENDING_APPROVAL"
APPROVED = "APPROVED"
REJECTED = "REJECTED"
SUBMITTED = "SUBMITTED"
VOIDED = "VOIDED"
IN_PROGRESS = "IN_PROGRESS"
ABORTED = "ABORTED"

# --- 庫存異動類型 -------------------------------------------------------
MOVE_RECEIPT = "RECEIPT"
MOVE_ISSUE = "ISSUE"
MOVE_MOVE = "MOVE"
MOVE_SALE = "SALE"
MOVE_ADJUSTMENT = "ADJUSTMENT"
MOVE_OPENING = "OPENING"

# --- 領用用途（不含「銷貨」）-------------------------------------------
PURPOSE_CUSTOMER_HOLD = "CUSTOMER_HOLD"
PURPOSE_INTERNAL_LOSS = "INTERNAL_LOSS"
PURPOSE_OTHER = "OTHER"


class Role(db.Model):
    __tablename__ = "roles"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(32), unique=True, nullable=False)
    name = db.Column(db.String(64), nullable=False)

    permissions = db.relationship(
        "RolePermission", back_populates="role", cascade="all, delete-orphan"
    )


class RolePermission(db.Model):
    __tablename__ = "role_permissions"

    id = db.Column(db.Integer, primary_key=True)
    role_id = db.Column(db.Integer, db.ForeignKey("roles.id"), nullable=False)
    permission_code = db.Column(db.String(64), nullable=False)

    role = db.relationship("Role", back_populates="permissions")
    __table_args__ = (db.UniqueConstraint("role_id", "permission_code"),)


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    display_name = db.Column(db.String(64), nullable=False)
    role_id = db.Column(db.Integer, db.ForeignKey("roles.id"), nullable=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    must_change_password = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    role = db.relationship("Role")


class AuthToken(db.Model):
    """登入權杖。閒置逾 30 分鐘失效（與 PRD FR-1 一致）。"""

    __tablename__ = "auth_tokens"

    token = db.Column(db.String(64), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    last_seen_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime, nullable=False)

    user = db.relationship("User")


class ProductCategory(db.Model):
    __tablename__ = "product_categories"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(32), unique=True, nullable=False)
    name = db.Column(db.String(64), nullable=False)
    parent_id = db.Column(db.Integer, db.ForeignKey("product_categories.id"))
    safety_stock = db.Column(db.Numeric(12, 3))
    reorder_multiplier = db.Column(db.Numeric(12, 3), default=1)

    parent = db.relationship("ProductCategory", remote_side="ProductCategory.id")
    products = db.relationship("Product", back_populates="category")


class Product(db.Model):
    __tablename__ = "products"

    id = db.Column(db.Integer, primary_key=True)
    product_code = db.Column(db.String(32), unique=True, nullable=False)
    name = db.Column(db.String(128), nullable=False)
    barcode = db.Column(db.String(64), unique=True)
    category_id = db.Column(db.Integer, db.ForeignKey("product_categories.id"))
    unit = db.Column(db.String(16), nullable=False, default="件")
    pack_size = db.Column(db.Integer)
    conversion_factor = db.Column(db.Numeric(12, 3), default=1)
    purchase_price = db.Column(db.Numeric(12, 2))
    is_batch_tracked = db.Column(db.Boolean, nullable=False, default=False)
    status = db.Column(db.String(16), nullable=False, default="ACTIVE")
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    category = db.relationship("ProductCategory", back_populates="products")
    batches = db.relationship("ProductBatch", back_populates="product")


class ProductBatch(db.Model):
    __tablename__ = "product_batches"

    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)
    batch_no = db.Column(db.String(64), nullable=False)
    qty = db.Column(db.Numeric(12, 3), nullable=False, default=0)
    expiry_date = db.Column(db.Date)
    received_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    product = db.relationship("Product", back_populates="batches")
    __table_args__ = (db.UniqueConstraint("product_id", "batch_no"),)


class Supplier(db.Model):
    __tablename__ = "suppliers"

    id = db.Column(db.Integer, primary_key=True)
    tax_id = db.Column(db.String(16), unique=True)
    company_name = db.Column(db.String(128), nullable=False)
    contact_name = db.Column(db.String(64))
    phone = db.Column(db.String(32))
    status = db.Column(db.String(16), nullable=False, default="ACTIVE")
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)


class ProductSupplier(db.Model):
    """商品 × 供應商報價。"""

    __tablename__ = "product_suppliers"

    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)
    supplier_id = db.Column(db.Integer, db.ForeignKey("suppliers.id"), nullable=False)
    unit_price = db.Column(db.Numeric(12, 2), nullable=False)
    moq = db.Column(db.Integer)
    lead_time_days = db.Column(db.Integer)
    valid_until = db.Column(db.Date)

    product = db.relationship("Product")
    supplier = db.relationship("Supplier")


class Warehouse(db.Model):
    __tablename__ = "warehouses"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(32), unique=True, nullable=False)
    name = db.Column(db.String(64), nullable=False)


class Location(db.Model):
    __tablename__ = "locations"

    id = db.Column(db.Integer, primary_key=True)
    warehouse_id = db.Column(db.Integer, db.ForeignKey("warehouses.id"), nullable=False)
    parent_id = db.Column(db.Integer, db.ForeignKey("locations.id"))
    code = db.Column(db.String(32), nullable=False)
    name = db.Column(db.String(64), nullable=False)
    is_frozen = db.Column(db.Boolean, nullable=False, default=False)
    is_aggregate = db.Column(db.Boolean, nullable=False, default=False)
    status = db.Column(db.String(16), nullable=False, default="ACTIVE")

    warehouse = db.relationship("Warehouse")
    parent = db.relationship("Location", remote_side="Location.id")
    __table_args__ = (db.UniqueConstraint("warehouse_id", "code"),)


class StockLedger(db.Model):
    """結存明細 — 僅追加，禁止 UPDATE / DELETE（PRD §6）。"""

    __tablename__ = "stock_ledger"

    id = db.Column(db.Integer, primary_key=True)          # 同時作為單調遞增序號
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)
    batch_id = db.Column(db.Integer, db.ForeignKey("product_batches.id"))
    location_id = db.Column(db.Integer, db.ForeignKey("locations.id"), nullable=False)
    from_location_id = db.Column(db.Integer, db.ForeignKey("locations.id"))
    to_location_id = db.Column(db.Integer, db.ForeignKey("locations.id"))
    qty_delta = db.Column(db.Numeric(12, 3), nullable=False)
    movement_type = db.Column(db.String(16), nullable=False)
    source_doc_type = db.Column(db.String(24))
    source_doc_no = db.Column(db.String(32))
    purpose = db.Column(db.String(24))
    operator_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    override_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    override_reason = db.Column(db.String(255))
    occurred_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    product = db.relationship("Product")
    batch = db.relationship("ProductBatch")
    location = db.relationship("Location", foreign_keys=[location_id])
    operator = db.relationship("User", foreign_keys=[operator_id])

    @property
    def seq(self):
        return self.id


class StockBalance(db.Model):
    """庫存彙總表。可用庫存 = on_hand（v1 無預留機制）。"""

    __tablename__ = "stock_balances"

    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)
    batch_id = db.Column(db.Integer, db.ForeignKey("product_batches.id"))
    location_id = db.Column(db.Integer, db.ForeignKey("locations.id"), nullable=False)
    on_hand = db.Column(db.Numeric(12, 3), nullable=False, default=0)
    version = db.Column(db.Integer, nullable=False, default=1)

    product = db.relationship("Product")
    batch = db.relationship("ProductBatch")
    location = db.relationship("Location")
    __table_args__ = (
        db.UniqueConstraint("product_id", "batch_id", "location_id", name="uq_balance"),
    )


class PurchaseOrder(db.Model):
    __tablename__ = "purchase_orders"

    id = db.Column(db.Integer, primary_key=True)
    po_no = db.Column(db.String(32), unique=True)
    supplier_id = db.Column(db.Integer, db.ForeignKey("suppliers.id"), nullable=False)
    status = db.Column(db.String(24), nullable=False, default=DRAFT)
    expected_date = db.Column(db.Date)
    total_amount = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    sent_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    sent_at = db.Column(db.DateTime)
    approved_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    approved_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    reason = db.Column(db.String(255))
    reopened_from_id = db.Column(db.Integer, db.ForeignKey("purchase_orders.id"))

    supplier = db.relationship("Supplier")
    lines = db.relationship(
        "PurchaseOrderLine", back_populates="order", cascade="all, delete-orphan"
    )
    sent_by_user = db.relationship("User", foreign_keys=[sent_by])
    approved_by_user = db.relationship("User", foreign_keys=[approved_by])


class PurchaseOrderLine(db.Model):
    __tablename__ = "purchase_order_lines"

    id = db.Column(db.Integer, primary_key=True)
    po_id = db.Column(db.Integer, db.ForeignKey("purchase_orders.id"), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)
    qty_ordered = db.Column(db.Numeric(12, 3), nullable=False)
    qty_received = db.Column(db.Numeric(12, 3), nullable=False, default=0)
    unit_price = db.Column(db.Numeric(12, 2), nullable=False)
    batch_no = db.Column(db.String(64))

    order = db.relationship("PurchaseOrder", back_populates="lines")
    product = db.relationship("Product")


class GoodsReceipt(db.Model):
    __tablename__ = "goods_receipts"

    id = db.Column(db.Integer, primary_key=True)
    gr_no = db.Column(db.String(32), unique=True, nullable=False)
    po_id = db.Column(db.Integer, db.ForeignKey("purchase_orders.id"))
    status = db.Column(db.String(24), nullable=False, default=SUBMITTED)
    received_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    operator_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    reason = db.Column(db.String(255))
    reopened_from_id = db.Column(db.Integer, db.ForeignKey("goods_receipts.id"))

    order = db.relationship("PurchaseOrder")
    operator = db.relationship("User")
    lines = db.relationship(
        "GoodsReceiptLine", back_populates="receipt", cascade="all, delete-orphan"
    )


class GoodsReceiptLine(db.Model):
    __tablename__ = "goods_receipt_lines"

    id = db.Column(db.Integer, primary_key=True)
    gr_id = db.Column(db.Integer, db.ForeignKey("goods_receipts.id"), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)
    batch_id = db.Column(db.Integer, db.ForeignKey("product_batches.id"))
    qty = db.Column(db.Numeric(12, 3), nullable=False)
    batch_no = db.Column(db.String(64))
    expiry_date = db.Column(db.Date)
    location_id = db.Column(db.Integer, db.ForeignKey("locations.id"), nullable=False)
    unit_price = db.Column(db.Numeric(12, 2))

    receipt = db.relationship("GoodsReceipt", back_populates="lines")
    product = db.relationship("Product")
    batch = db.relationship("ProductBatch")
    location = db.relationship("Location")


class IssueOrder(db.Model):
    """領用單。"""

    __tablename__ = "issue_orders"

    id = db.Column(db.Integer, primary_key=True)
    issue_no = db.Column(db.String(32), unique=True, nullable=False)
    status = db.Column(db.String(24), nullable=False, default=SUBMITTED)
    purpose = db.Column(db.String(24), nullable=False)
    remark = db.Column(db.String(255))
    operator_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    occurred_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    reopened_from_id = db.Column(db.Integer, db.ForeignKey("issue_orders.id"))

    operator = db.relationship("User")
    lines = db.relationship(
        "IssueOrderLine", back_populates="issue", cascade="all, delete-orphan"
    )


class IssueOrderLine(db.Model):
    __tablename__ = "issue_order_lines"

    id = db.Column(db.Integer, primary_key=True)
    issue_id = db.Column(db.Integer, db.ForeignKey("issue_orders.id"), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)
    batch_id = db.Column(db.Integer, db.ForeignKey("product_batches.id"))
    qty = db.Column(db.Numeric(12, 3), nullable=False)
    location_id = db.Column(db.Integer, db.ForeignKey("locations.id"), nullable=False)

    issue = db.relationship("IssueOrder", back_populates="lines")
    product = db.relationship("Product")
    batch = db.relationship("ProductBatch")
    location = db.relationship("Location")


class SalesOrder(db.Model):
    __tablename__ = "sales_orders"

    id = db.Column(db.Integer, primary_key=True)
    so_no = db.Column(db.String(32), unique=True, nullable=False)
    customer_text = db.Column(db.String(128))
    status = db.Column(db.String(24), nullable=False, default=SUBMITTED)
    sold_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    sold_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    total_amount = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    reason = db.Column(db.String(255))
    reopened_from_id = db.Column(db.Integer, db.ForeignKey("sales_orders.id"))

    sold_by_user = db.relationship("User")
    lines = db.relationship(
        "SalesOrderLine", back_populates="order", cascade="all, delete-orphan"
    )


class SalesOrderLine(db.Model):
    __tablename__ = "sales_order_lines"

    id = db.Column(db.Integer, primary_key=True)
    so_id = db.Column(db.Integer, db.ForeignKey("sales_orders.id"), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)
    batch_id = db.Column(db.Integer, db.ForeignKey("product_batches.id"))
    qty = db.Column(db.Numeric(12, 3), nullable=False)
    unit_price = db.Column(db.Numeric(12, 2), nullable=False)
    amount = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    location_id = db.Column(db.Integer, db.ForeignKey("locations.id"), nullable=False)

    order = db.relationship("SalesOrder", back_populates="lines")
    product = db.relationship("Product")
    batch = db.relationship("ProductBatch")
    location = db.relationship("Location")


class Stocktake(db.Model):
    __tablename__ = "stocktakes"

    id = db.Column(db.Integer, primary_key=True)
    st_no = db.Column(db.String(32), unique=True, nullable=False)
    scope_type = db.Column(db.String(16), nullable=False)
    scope_id = db.Column(db.Integer, nullable=False)
    status = db.Column(db.String(24), nullable=False, default=IN_PROGRESS)
    freeze_mode = db.Column(db.String(16), nullable=False, default="FREEZE")
    total_diff_rate = db.Column(db.Numeric(12, 4))
    submitted_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    submitted_at = db.Column(db.DateTime)
    approved_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    reopened_from_id = db.Column(db.Integer, db.ForeignKey("stocktakes.id"))

    submitted_by_user = db.relationship("User", foreign_keys=[submitted_by])
    approved_by_user = db.relationship("User", foreign_keys=[approved_by])
    lines = db.relationship(
        "StocktakeLine", back_populates="stocktake", cascade="all, delete-orphan"
    )


class StocktakeLine(db.Model):
    __tablename__ = "stocktake_lines"

    id = db.Column(db.Integer, primary_key=True)
    stocktake_id = db.Column(db.Integer, db.ForeignKey("stocktakes.id"), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)
    batch_id = db.Column(db.Integer, db.ForeignKey("product_batches.id"))
    location_id = db.Column(db.Integer, db.ForeignKey("locations.id"), nullable=False)
    book_qty = db.Column(db.Numeric(12, 3), nullable=False, default=0)
    actual_qty = db.Column(db.Numeric(12, 3))
    diff_qty = db.Column(db.Numeric(12, 3))
    reason_code = db.Column(db.String(24))

    stocktake = db.relationship("Stocktake", back_populates="lines")
    product = db.relationship("Product")
    batch = db.relationship("ProductBatch")
    location = db.relationship("Location")


class Adjustment(db.Model):
    __tablename__ = "adjustments"

    id = db.Column(db.Integer, primary_key=True)
    adj_no = db.Column(db.String(32), unique=True, nullable=False)
    status = db.Column(db.String(24), nullable=False, default=DRAFT)
    reason_code = db.Column(db.String(24), nullable=False)
    remark = db.Column(db.String(255))
    requested_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    approved_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    reopened_from_id = db.Column(db.Integer, db.ForeignKey("adjustments.id"))

    requested_by_user = db.relationship("User", foreign_keys=[requested_by])
    approved_by_user = db.relationship("User", foreign_keys=[approved_by])
    lines = db.relationship(
        "AdjustmentLine", back_populates="adjustment", cascade="all, delete-orphan"
    )


class AdjustmentLine(db.Model):
    __tablename__ = "adjustment_lines"

    id = db.Column(db.Integer, primary_key=True)
    adjustment_id = db.Column(db.Integer, db.ForeignKey("adjustments.id"), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)
    batch_id = db.Column(db.Integer, db.ForeignKey("product_batches.id"))
    location_id = db.Column(db.Integer, db.ForeignKey("locations.id"), nullable=False)
    qty_delta = db.Column(db.Numeric(12, 3), nullable=False)
    reason_code = db.Column(db.String(24))

    adjustment = db.relationship("Adjustment", back_populates="lines")
    product = db.relationship("Product")
    batch = db.relationship("ProductBatch")
    location = db.relationship("Location")


class AuditLog(db.Model):
    """稽核軌跡 — 僅追加。"""

    __tablename__ = "audit_log"

    id = db.Column(db.Integer, primary_key=True)
    actor_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    action = db.Column(db.String(48), nullable=False)
    object_type = db.Column(db.String(32), nullable=False)
    object_id = db.Column(db.String(64))
    field_name = db.Column(db.String(48))
    old_value = db.Column(db.String(255))
    new_value = db.Column(db.String(255))
    doc_type = db.Column(db.String(24))
    doc_no = db.Column(db.String(32))
    occurred_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    prev_hash = db.Column(db.String(64))
    entry_hash = db.Column(db.String(64))

    actor = db.relationship("User")

    @property
    def seq(self):
        return self.id


class Settings(db.Model):
    __tablename__ = "settings"

    key = db.Column(db.String(64), primary_key=True)
    value_json = db.Column(db.Text)
