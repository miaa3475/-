"""StockService — 庫存數量的唯一寫入入口（PRD §6 單一寫入入口）。

任何路由都不得直接修改 `stock_balances.on_hand`；所有數量變動一律經過這裡，
並在同一次交易中寫入不可變的結存明細（stock_ledger）。
"""

from decimal import Decimal

from sqlalchemy import and_

from ..extensions import db
from ..models import (
    MOVE_ADJUSTMENT,
    MOVE_ISSUE,
    MOVE_MOVE,
    MOVE_OPENING,
    MOVE_RECEIPT,
    MOVE_SALE,
    ProductBatch,
    StockBalance,
    StockLedger,
    Stocktake,
)


class StockError(Exception):
    """業務規則違反。`status` 決定 HTTP 回應碼。"""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


class StocktakeFrozen(StockError):
    pass


def _dec(value) -> Decimal:
    return Decimal(str(value if value is not None else 0))


class StockService:
    # --- 查詢 ---------------------------------------------------------
    @staticmethod
    def on_hand(product_id: int, batch_id: int | None, location_id: int) -> Decimal:
        row = db.session.query(StockBalance).filter(
            and_(
                StockBalance.product_id == product_id,
                StockBalance.batch_id == batch_id,
                StockBalance.location_id == location_id,
            )
        ).first()
        return _dec(row.on_hand) if row else Decimal("0")

    @staticmethod
    def product_on_hand(product_id: int) -> Decimal:
        total = db.session.query(db.func.coalesce(db.func.sum(StockBalance.on_hand), 0)).filter(
            StockBalance.product_id == product_id
        ).scalar()
        return _dec(total)

    # --- 批次 ---------------------------------------------------------
    @staticmethod
    def get_or_create_batch(product_id: int, batch_no: str, expiry_date=None, qty=0) -> ProductBatch:
        batch = (
            db.session.query(ProductBatch)
            .filter(ProductBatch.product_id == product_id, ProductBatch.batch_no == batch_no)
            .first()
        )
        if batch is None:
            batch = ProductBatch(
                product_id=product_id,
                batch_no=batch_no,
                qty=0,
                expiry_date=expiry_date,
            )
            db.session.add(batch)
            db.session.flush()
        elif expiry_date is not None and batch.expiry_date is None:
            batch.expiry_date = expiry_date
        return batch

    # --- 盤點凍結 -----------------------------------------------------
    @staticmethod
    def assert_not_frozen(product_id: int, location_id: int) -> None:
        """盤點期間，範圍內的異動一律阻擋（PRD FR-15）。"""
        from ..models import Product

        product = db.session.get(Product, product_id)
        if product is None:
            return
        active = (
            db.session.query(Stocktake)
            .filter(Stocktake.status.in_(["IN_PROGRESS", "SUBMITTED"]))
            .all()
        )
        for st in active:
            hit = False
            if st.scope_type == "LOCATION" and st.scope_id == location_id:
                hit = True
            elif st.scope_type == "PRODUCT" and st.scope_id == product_id:
                hit = True
            elif st.scope_type == "CATEGORY" and st.scope_id == product.category_id:
                hit = True
            if hit:
                raise StocktakeFrozen(
                    f"盤點單 {st.st_no} 進行中，範圍內商品不可異動", status=400
                )

    # --- 寫入 ---------------------------------------------------------
    @staticmethod
    def _balance_row(product_id, batch_id, location_id) -> StockBalance | None:
        return db.session.query(StockBalance).filter(
            and_(
                StockBalance.product_id == product_id,
                StockBalance.batch_id == batch_id,
                StockBalance.location_id == location_id,
            )
        ).first()

    @staticmethod
    def _apply_balance(product_id, batch_id, location_id, delta: Decimal) -> StockBalance:
        """以樂觀鎖更新彙總表；版本衝突拋 409。"""
        row = StockService._balance_row(product_id, batch_id, location_id)
        if row is None:
            if delta < 0:
                raise StockError("可用庫存不足")
            row = StockBalance(
                product_id=product_id,
                batch_id=batch_id,
                location_id=location_id,
                on_hand=0,
                version=1,
            )
            db.session.add(row)
            db.session.flush()
        new_value = _dec(row.on_hand) + delta
        if new_value < 0:
            raise StockError("可用庫存不足")
        updated = (
            db.session.query(StockBalance)
            .filter(
                StockBalance.id == row.id,
                StockBalance.version == row.version,
            )
            .update({"on_hand": new_value, "version": row.version + 1}, synchronize_session=False)
        )
        if updated != 1:
            raise StockError("資料已被其他使用者修改，請重試", status=409)
        db.session.refresh(row)
        return row

    @staticmethod
    def write_ledger(
        *,
        product_id: int,
        location_id: int,
        qty_delta: Decimal,
        movement_type: str,
        operator_id: int,
        batch_id: int | None = None,
        from_location_id: int | None = None,
        to_location_id: int | None = None,
        source_doc_type: str | None = None,
        source_doc_no: str | None = None,
        purpose: str | None = None,
        override_by: int | None = None,
        override_reason: str | None = None,
    ) -> StockLedger:
        row = StockLedger(
            product_id=product_id,
            batch_id=batch_id,
            location_id=location_id,
            from_location_id=from_location_id,
            to_location_id=to_location_id,
            qty_delta=qty_delta,
            movement_type=movement_type,
            source_doc_type=source_doc_type,
            source_doc_no=source_doc_no,
            purpose=purpose,
            operator_id=operator_id,
            override_by=override_by,
            override_reason=override_reason,
        )
        db.session.add(row)
        return row

    @classmethod
    def apply(
        cls,
        *,
        product_id: int,
        location_id: int,
        qty_delta: Decimal,
        movement_type: str,
        operator_id: int,
        batch_id: int | None = None,
        allow_negative: bool = False,
        override_reason: str | None = None,
        source_doc_type: str | None = None,
        source_doc_no: str | None = None,
        purpose: str | None = None,
        check_freeze: bool = True,
    ) -> StockLedger:
        """單一寫入入口：檢查凍結 → 檢查負庫存 → 更新彙總 → 寫結存明細。"""
        if check_freeze:
            cls.assert_not_frozen(product_id, location_id)

        override_by = None
        if qty_delta < 0:
            current = cls.on_hand(product_id, batch_id, location_id)
            if current + qty_delta < 0:
                if not allow_negative:
                    raise StockError(
                        f"可用庫存不足（目前 {current}）", status=400
                    )
                if not override_reason:
                    raise StockError("放行負庫存必須填寫原因", status=400)
                override_by = operator_id

        cls._apply_balance(product_id, batch_id, location_id, qty_delta)

        if batch_id:
            batch = db.session.get(ProductBatch, batch_id)
            if batch is not None:
                batch.qty = _dec(batch.qty) + qty_delta

        return cls.write_ledger(
            product_id=product_id,
            location_id=location_id,
            qty_delta=qty_delta,
            movement_type=movement_type,
            operator_id=operator_id,
            batch_id=batch_id,
            source_doc_type=source_doc_type,
            source_doc_no=source_doc_no,
            purpose=purpose,
            override_by=override_by,
            override_reason=override_reason if override_by else None,
        )

    @classmethod
    def receive(
        cls,
        *,
        product_id: int,
        location_id: int,
        qty: Decimal,
        operator_id: int,
        batch_no: str | None = None,
        expiry_date=None,
        source_doc_type: str = "GOODS_RECEIPT",
        source_doc_no: str | None = None,
    ):
        """進貨：建立或累加批次後入庫。"""
        from ..models import Product

        product = db.session.get(Product, product_id)
        batch_id = None
        if product is not None and product.is_batch_tracked:
            if not batch_no:
                raise StockError("此商品啟用批次管理，進貨必須輸入批號")
            batch = cls.get_or_create_batch(product_id, batch_no, expiry_date)
            batch_id = batch.id
        return cls.apply(
            product_id=product_id,
            location_id=location_id,
            qty_delta=_dec(qty),
            movement_type=MOVE_RECEIPT,
            operator_id=operator_id,
            batch_id=batch_id,
            source_doc_type=source_doc_type,
            source_doc_no=source_doc_no,
        )

    @classmethod
    def issue(
        cls,
        *,
        product_id: int,
        location_id: int,
        qty: Decimal,
        operator_id: int,
        batch_id: int | None = None,
        purpose: str,
        movement_type: str = MOVE_ISSUE,
        source_doc_type: str = "ISSUE",
        source_doc_no: str | None = None,
        allow_negative: bool = False,
        override_reason: str | None = None,
    ):
        return cls.apply(
            product_id=product_id,
            location_id=location_id,
            qty_delta=-_dec(qty),
            movement_type=movement_type,
            operator_id=operator_id,
            batch_id=batch_id,
            purpose=purpose,
            source_doc_type=source_doc_type,
            source_doc_no=source_doc_no,
            allow_negative=allow_negative,
            override_reason=override_reason,
        )

    @classmethod
    def move(
        cls,
        *,
        product_id: int,
        from_location_id: int,
        to_location_id: int,
        qty: Decimal,
        operator_id: int,
        batch_id: int | None = None,
        source_doc_no: str | None = None,
    ):
        """移位：寫兩筆結存明細（一減一增），使各庫位加總皆可還原。"""
        qty = _dec(qty)
        cls.assert_not_frozen(product_id, from_location_id)
        cls.assert_not_frozen(product_id, to_location_id)
        cls._apply_balance(product_id, batch_id, from_location_id, -qty)
        cls._apply_balance(product_id, batch_id, to_location_id, qty)
        out = cls.write_ledger(
            product_id=product_id,
            location_id=from_location_id,
            from_location_id=from_location_id,
            to_location_id=to_location_id,
            qty_delta=-qty,
            movement_type=MOVE_MOVE,
            operator_id=operator_id,
            batch_id=batch_id,
            source_doc_type="STOCK_MOVE",
            source_doc_no=source_doc_no,
        )
        cls.write_ledger(
            product_id=product_id,
            location_id=to_location_id,
            from_location_id=from_location_id,
            to_location_id=to_location_id,
            qty_delta=qty,
            movement_type=MOVE_MOVE,
            operator_id=operator_id,
            batch_id=batch_id,
            source_doc_type="STOCK_MOVE",
            source_doc_no=source_doc_no,
        )
        return out

    @classmethod
    def opening(cls, *, product_id: int, location_id: int, qty: Decimal, operator_id: int, batch_id=None):
        """期初建帳：同樣寫入結存明細，確保 SM-3 的逐筆還原成立。"""
        return cls.apply(
            product_id=product_id,
            location_id=location_id,
            qty_delta=_dec(qty),
            movement_type=MOVE_OPENING,
            operator_id=operator_id,
            batch_id=batch_id,
            source_doc_type="OPENING",
            check_freeze=False,
        )

    @classmethod
    def reverse(cls, *, ledger: StockLedger, operator_id: int, reason: str | None = None):
        """作廢時以反向明細沖銷（PRD FR-20：不刪不改既有明細）。"""
        if ledger.movement_type == MOVE_MOVE:
            # 移位由兩筆組成，需同時沖銷
            sibling = (
                db.session.query(StockLedger)
                .filter(
                    StockLedger.source_doc_no == ledger.source_doc_no,
                    StockLedger.movement_type == MOVE_MOVE,
                    StockLedger.id != ledger.id,
                )
                .first()
            )
            if sibling is not None:
                cls._apply_balance(
                    sibling.product_id, sibling.batch_id, sibling.location_id, -_dec(sibling.qty_delta)
                )
                cls.write_ledger(
                    product_id=sibling.product_id,
                    location_id=sibling.location_id,
                    qty_delta=-_dec(sibling.qty_delta),
                    movement_type="REVERSAL",
                    operator_id=operator_id,
                    batch_id=sibling.batch_id,
                    source_doc_type="REVERSAL",
                    source_doc_no=sibling.source_doc_no,
                )
            cls._apply_balance(
                ledger.product_id, ledger.batch_id, ledger.location_id, -_dec(ledger.qty_delta)
            )
            return cls.write_ledger(
                product_id=ledger.product_id,
                location_id=ledger.location_id,
                qty_delta=-_dec(ledger.qty_delta),
                movement_type="REVERSAL",
                operator_id=operator_id,
                batch_id=ledger.batch_id,
                source_doc_type="REVERSAL",
                source_doc_no=ledger.source_doc_no,
                purpose=reason,
            )
        cls._apply_balance(
            ledger.product_id, ledger.batch_id, ledger.location_id, -_dec(ledger.qty_delta)
        )
        return cls.write_ledger(
            product_id=ledger.product_id,
            location_id=ledger.location_id,
            qty_delta=-_dec(ledger.qty_delta),
            movement_type="REVERSAL",
            operator_id=operator_id,
            batch_id=ledger.batch_id,
            source_doc_type="REVERSAL",
            source_doc_no=ledger.source_doc_no,
            purpose=reason,
        )


__all__ = [
    "StockService",
    "StockError",
    "StocktakeFrozen",
    "MOVE_ADJUSTMENT",
    "MOVE_ISSUE",
    "MOVE_MOVE",
    "MOVE_OPENING",
    "MOVE_RECEIPT",
    "MOVE_SALE",
]
