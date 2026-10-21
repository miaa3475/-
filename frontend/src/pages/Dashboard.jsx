import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { api, qs } from '../api'
import { hasRole, useAuth } from '../auth'
import {
  Card,
  MovementBadge,
  PageHeader,
  StatCard,
  Table,
  dash,
  fmtDateTime,
  fmtMoney,
  fmtQty,
} from '../components/ui'

export default function Dashboard() {
  const { role } = useAuth()
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [stock, setStock] = useState([])
  const [ledger, setLedger] = useState([])
  const [replenishment, setReplenishment] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [productData, categoryData, stockData, ledgerData] = await Promise.all([
        api.get('/products' + qs({ status: 'ACTIVE' })),
        api.get('/categories'),
        api.get('/stock'),
        api.get('/stock/ledger' + qs({ page: 1 })),
      ])
      setProducts(Array.isArray(productData) ? productData : [])
      setCategories(Array.isArray(categoryData) ? categoryData : [])
      setStock(Array.isArray(stockData) ? stockData : [])
      setLedger(ledgerData && Array.isArray(ledgerData.items) ? ledgerData.items : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // 補貨建議僅供採購／主管檢視
  useEffect(() => {
    if (!hasRole(role, 'PURCHASE', 'ADMIN')) return
    let cancelled = false
    api
      .get('/purchase/replenishment')
      .then((data) => {
        if (!cancelled) setReplenishment(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (!cancelled) setReplenishment([])
      })
    return () => {
      cancelled = true
    }
  }, [role])

  const onHandMap = useMemo(() => {
    const map = new Map()
    stock.forEach((row) => {
      const current = map.get(row.product_id) || 0
      map.set(row.product_id, current + Number(row.on_hand || 0))
    })
    return map
  }, [stock])

  const categoryMap = useMemo(() => {
    const map = new Map()
    categories.forEach((cat) => map.set(cat.id, cat))
    return map
  }, [categories])

  // 低於水位清單：現存量 < 類別安全水位
  const lowStock = useMemo(() => {
    return products
      .map((product) => {
        const category = categoryMap.get(product.category_id)
        const safety = category ? Number(category.safety_stock || 0) : 0
        const onHand = onHandMap.get(product.id) || 0
        return { product, category, safety, onHand }
      })
      .filter((row) => row.safety > 0 && row.onHand < row.safety)
      .sort((a, b) => a.onHand - a.safety - (b.onHand - b.safety))
  }, [products, categoryMap, onHandMap])

  const stockItemCount = onHandMap.size

  return (
    <div>
      <PageHeader title="總覽" desc="庫存現況、低於安全水位品項與最近異動紀錄" />

      <div className="grid-4" style={{ marginBottom: 18 }}>
        <StatCard label="商品總數" value={loading ? '…' : products.length} unit="項" />
        <StatCard label="有庫存品項" value={loading ? '…' : stockItemCount} unit="項" tone="info" />
        <StatCard
          label="低於安全水位"
          value={loading ? '…' : lowStock.length}
          unit="項"
          tone={lowStock.length > 0 ? 'warn' : 'ok'}
        />
        <StatCard
          label="補貨建議"
          value={hasRole(role, 'PURCHASE', 'ADMIN') ? (loading ? '…' : replenishment.length) : '—'}
          unit="項"
          tone="danger"
        />
      </div>

      <Card title="低於安全水位清單" extra={<span className="muted">安全水位依商品類別設定</span>}>
        <Table
          loading={loading}
          error={error}
          rows={lowStock}
          empty="目前沒有低於安全水位的商品"
          columns={[
            {
              key: 'code',
              title: '商品編號',
              render: (row) => dash(row.product.product_code),
            },
            {
              key: 'name',
              title: '商品名稱',
              render: (row) => (
                <span>
                  {dash(row.product.name)}
                  <span className="muted"> （{dash(row.product.unit)}）</span>
                </span>
              ),
            },
            {
              key: 'category',
              title: '類別',
              render: (row) => dash(row.category ? row.category.name : row.product.category_name),
            },
            {
              key: 'onHand',
              title: '現存量',
              className: 'num',
              render: (row) => fmtQty(row.onHand),
            },
            {
              key: 'safety',
              title: '安全水位',
              className: 'num',
              render: (row) => fmtQty(row.safety),
            },
            {
              key: 'diff',
              title: '差距',
              className: 'num',
              render: (row) => fmtQty(row.safety - row.onHand),
            },
          ]}
        />
      </Card>

      {hasRole(role, 'PURCHASE', 'ADMIN') ? (
        <Card title="補貨建議" extra={<span className="muted">來源：採購模組</span>}>
          <Table
            rows={replenishment}
            empty="目前沒有需要補貨的商品"
            columns={[
              { key: 'product_code', title: '商品編號', render: (row) => dash(row.product_code) },
              { key: 'name', title: '商品名稱', render: (row) => dash(row.name) },
              { key: 'on_hand', title: '現存量', className: 'num', render: (row) => fmtQty(row.on_hand) },
              {
                key: 'safety_stock',
                title: '安全水位',
                className: 'num',
                render: (row) => fmtQty(row.safety_stock),
              },
              {
                key: 'suggested_qty',
                title: '建議補貨量',
                className: 'num',
                render: (row) => fmtQty(row.suggested_qty),
              },
              {
                key: 'best_supplier_name',
                title: '建議供應商',
                render: (row) => dash(row.best_supplier_name),
              },
              {
                key: 'best_price',
                title: '建議單價',
                className: 'num',
                render: (row) => fmtMoney(row.best_price),
              },
            ]}
          />
        </Card>
      ) : null}

      <Card title="最近異動" extra={<span className="muted">最新 20 筆結存明細</span>}>
        <Table
          loading={loading}
          error={error}
          rows={ledger.slice(0, 20)}
          empty="目前沒有異動紀錄"
          columns={[
            {
              key: 'occurred_at',
              title: '時間',
              render: (row) => fmtDateTime(row.occurred_at),
            },
            { key: 'product_code', title: '商品編號', render: (row) => dash(row.product_code) },
            { key: 'name', title: '商品名稱', render: (row) => dash(row.name) },
            {
              key: 'batch_no',
              title: '批號',
              render: (row) => dash(row.batch_no),
            },
            {
              key: 'location_code',
              title: '庫位',
              render: (row) => dash(row.location_code),
            },
            {
              key: 'movement_type',
              title: '異動類型',
              render: (row) => <MovementBadge code={row.movement_type} />,
            },
            {
              key: 'qty_delta',
              title: '數量變動',
              className: 'num',
              render: (row) => {
                const value = Number(row.qty_delta || 0)
                return <span style={{ color: value < 0 ? '#a32121' : '#15803d' }}>{fmtQty(value)}</span>
              },
            },
            {
              key: 'source_doc_no',
              title: '來源單號',
              render: (row) => dash(row.source_doc_no),
            },
            { key: 'operator', title: '操作人', render: (row) => dash(row.operator) },
          ]}
        />
      </Card>

      <p className="muted" style={{ fontSize: 12 }}>
        異動類型代碼對照：{Object.entries({ RECEIPT: '進貨', ISSUE: '領用', MOVE: '移位', SALE: '銷貨', ADJUST: '調整', STOCKTAKE: '盤點' })
          .map(([code, label]) => `${code}（${label}）`)
          .join('、')}；未列出的代碼依後端原值顯示。
      </p>
    </div>
  )
}
