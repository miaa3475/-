"""序列化輔助：統一 JSON 形狀與數字格式。"""

from decimal import Decimal


def money(value) -> float:
    if value is None:
        return None
    return round(float(Decimal(str(value))), 2)


def qty(value) -> float:
    if value is None:
        return None
    return round(float(Decimal(str(value))), 3)


def dt(value) -> str | None:
    if value is None:
        return None
    return value.isoformat(sep=" ", timespec="seconds")


def d(value) -> str | None:
    if value is None:
        return None
    return value.isoformat()
