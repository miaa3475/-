import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { hasRole, useAuth } from '../auth'
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Table,
  dash,
  fmtDateTime,
  fmtMoney,
  fmtQty,
  useToast,
} from '../components/ui'

const STATUS_OPTIONS = [
  { value: '', label: '全部狀態' },
  { value: 'DRAFT', label: '草稿' },
  { value: 'SUBMITTED', label: '已提交' },
  { value: 'VOIDED', label: '已作廢' },
]

const emptyLine = () => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  product_id: '',
  product_code: '',
  name: '',
  batch_id: '',
  batch_no: '',
  qty: '',
  unit_price: '',
  location_id: '',
})

export default function Sales() {
  const { role } = useAuth()
  const toast = useToast()
  const canVoid = hasRole(role, 'ADMIN')

  const [orders, setOrders] = useState([])
  const [products, setProducts] = useState([])
  const [stock, setStock] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const [customerText, setCustomerText] = useState('')
  const [lines, setLines] = useState([])
  const [submitting, setSubmitting] = useState(false)

  const [expanded, setExpanded] = useState(null)
  const [voidTarget, setVoidTarget] = useState(null)
  const [voidReason, setVoidReason] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.get('/sales/orders')
      setOrders(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    let cancelled = false
    api
      .get('/products')
      .then((data) => !cancelled && setProducts(Array.isArray(data) ? data : []))
      .catch(() => !cancelled && setProducts([]))
    api
      .get('/locations')
      .then((data) => !cancelled && setLocations(Array.isArray(data) ? data : []))
      .catch(() => !cancelled && setLocations([]))
    api
      .get('/stock')
      .then((data) => !cancelled && setStock(Array.isArray(data) ? data : []))
      .catch(() => !cancelled && setStock([]))
    return () => {
      cancelled = true
    }
  }, [])

  const filteredOrders = useMemo(() => {
    if (!status) return orders
    return orders.filter((order) => order.status === status)
  }, [orders, status])

  const productOptions = useMemo(
    () =>
      products.map((p) => ({
        value: String(p.id),
        label: `${p.product_code || ''} ${p.name || ''}`.trim(),
        product: p,
      })),
    [products],
  )

  const locationOptions = useMemo(
    () =>
      locations.map((loc) => ({
        value: String(loc.id),
        label: `${loc.code || ''} ${loc.name || ''}`.trim(),
      })),
    [locations],
  )

  const batchesOf = useCallback(
    (productId) =>
      stock
        .filter((row) => String(row.product_id) === String(productId) && Number(row.on_hand || 0) > 0)
        .map((row) => ({
          value: String(row.batch_id),
          label: `${row.batch_no || '無批號'}（庫位 ${row.location_code || '—'}，可用 ${fmtQty(row.on_hand)}）`,
          batch: row,
        })),
    [stock],
  )

  const addProduct = (product) => {
    if (!product) return
    const batches = batchesOf(product.id)
    setLines((prev) => [
      ...prev,
      {
        ...emptyLine(),
        product_id: product.id,
        product_code: product.product_code || '',
        name: product.name || '',
        location_id: batches.length ? String(batches[0].batch.location_id) : '',
      },
    ])
  }

  const updateLine = (key, field, value) => {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line
        const next = { ...line, [field]: value }
        if (field === 'batch_id') {
          const matched = batchesOf(line.product_id).find((b) => String(b.value) === String(value))
          next.batch_no = matched ? matched.batch.batch_no || '' : ''
          if (matched) next.location_id = String(matched.batch.location_id)
        }
        return next
      }),
    )
  }

  const removeLine = (key) => setLines((prev) => prev.filter((line) => line.key !== key))

  const handleSubmit = async (event) => {
    if (event) event.preventDefault()
    if (lines.length === 0) {
      toast.error('請至少加入一項商品')
      return
    }
    for (const line of lines) {
      if (!line.product_id) {
        toast.error('有品項尚未指定商品')
        return
      }
      if (line.qty === '' || Number(line.qty) <= 0) {
        toast.error(`「${line.name || '品項'}」的數量必須大於 0`)
        return
      }
      if (!line.location_id) {
        toast.error(`「${line.name || '品項'}」尚未選擇庫位`)
        return
      }
    }

    const payload = {
      customer_text: customerText.trim() || undefined,
      lines: lines.map((line) => ({
        product_id: Number(line.product_id),
        batch_id: line.batch_id === '' ? undefined : Number(line.batch_id),
        qty: Number(line.qty),
        unit_price: line.unit_price === '' ? undefined : Number(line.unit_price),
        location_id: Number(line.location_id),
      })),
    }

    setSubmitting(true)
    try {
      const result = await api.post('/sales/orders', payload)
      toast.success(`銷貨單 ${result.so_no || ''} 已建立`.trim())
      setLines([])
      setCustomerText('')
      load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleVoid = async () => {
    if (!voidTarget) return
    if (!voidReason.trim()) {
      toast.error('請填寫作廢原因')
      return
    }
    try {
      const result = await api.post(`/sales/orders/${voidTarget.id}/void`, { reason: voidReason.trim() })
      toast.success(
        result && result.new_id
          ? `銷貨單 ${voidTarget.so_no} 已作廢，產生沖銷單 #${result.new_id}`
          : `銷貨單 ${voidTarget.so_no} 已作廢`,
      )
      setVoidTarget(null)
      setVoidReason('')
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const expandedRow = orders.find((row) => row.id === expanded)

  return (
    <div>
      <PageHeader title="銷貨單" desc="登錄對外銷售，扣減庫存並保留結存明細" />

      <Card title="建立銷貨單">
        <div className="form-grid">
          <Field label="客戶／買受人">
            <Input
              value={customerText}
              placeholder="客戶名稱或說明"
              onChange={(e) => setCustomerText(e.target.value)}
            />
          </Field>
          <Field label="加入商品">
            <select
              className="input"
              value=""
              onChange={(e) => {
                const value = e.target.value
                const matched = productOptions.find((opt) => opt.value === value)
                if (matched) addProduct(matched.product)
                e.target.value = ''
              }}
            >
              <option value="">請選擇商品</option>
              {productOptions.map((opt) => (
                <option key={opt.product.id} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>商品</th>
                <th style={{ width: 220 }}>批號</th>
                <th style={{ width: 190 }}>庫位</th>
                <th style={{ width: 120 }}>數量</th>
                <th style={{ width: 130 }}>單價</th>
                <th style={{ width: 80 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 20 }}>
                    尚未加入品項
                  </td>
                </tr>
              ) : (
                lines.map((line) => (
                  <tr key={line.key}>
                    <td>
                      <div>{dash(line.name)}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {dash(line.product_code)}
                      </div>
                    </td>
                    <td>
                      <Select
                        options={batchesOf(line.product_id)}
                        value={line.batch_id}
                        placeholder="無批號"
                        onChange={(e) => updateLine(line.key, 'batch_id', e.target.value)}
                      />
                    </td>
                    <td>
                      <Select
                        options={locationOptions}
                        value={line.location_id}
                        placeholder="請選擇庫位"
                        onChange={(e) => updateLine(line.key, 'location_id', e.target.value)}
                      />
                    </td>
                    <td>
                      <Input
                        type="number"
                        step="0.001"
                        min="0"
                        className="line-editor"
                        value={line.qty}
                        onChange={(e) => updateLine(line.key, 'qty', e.target.value)}
                      />
                    </td>
                    <td>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        className="line-editor"
                        value={line.unit_price}
                        onChange={(e) => updateLine(line.key, 'unit_price', e.target.value)}
                      />
                    </td>
                    <td>
                      <Button variant="danger" className="btn-sm" onClick={() => removeLine(line.key)}>
                        移除
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
          <Button variant="default" onClick={() => setLines([])}>
            清空
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? '送出中…' : '送出銷貨單'}
          </Button>
        </div>
      </Card>

      <Card
        title="銷貨單列表"
        extra={
          <div className="toolbar">
            <Field label="狀態">
              <Select options={STATUS_OPTIONS} value={status} onChange={(e) => setStatus(e.target.value)} />
            </Field>
          </div>
        }
      >
        <Table
          loading={loading}
          error={error}
          rows={filteredOrders}
          empty="沒有符合條件的銷貨單"
          columns={[
            { key: 'so_no', title: '銷貨單號', render: (row) => dash(row.so_no) },
            { key: 'status', title: '狀態', render: (row) => <Badge status={row.status} /> },
            { key: 'customer_text', title: '客戶', render: (row) => dash(row.customer_text) },
            { key: 'sold_by', title: '銷售人', render: (row) => dash(row.sold_by) },
            { key: 'sold_at', title: '銷售時間', render: (row) => fmtDateTime(row.sold_at) },
            {
              key: 'total_amount',
              title: '總金額',
              className: 'num',
              render: (row) => fmtMoney(row.total_amount),
            },
            {
              key: 'lines',
              title: '品項',
              render: (row) => (
                <Button
                  variant="ghost"
                  className="btn-sm"
                  onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                >
                  {expanded === row.id ? '收合' : `明細（${(row.lines || []).length}）`}
                </Button>
              ),
            },
            {
              key: 'actions',
              title: '操作',
              render: (row) =>
                canVoid ? (
                  <Button variant="danger" className="btn-sm" onClick={() => setVoidTarget(row)}>
                    作廢
                  </Button>
                ) : (
                  <span className="muted">—</span>
                ),
            },
          ]}
        />
        {expandedRow && (expandedRow.lines || []).length > 0 ? (
          <div className="table-wrap">
            <table className="sub-table">
              <thead>
                <tr>
                  <th>商品編號</th>
                  <th>商品名稱</th>
                  <th>批號</th>
                  <th>庫位</th>
                  <th>數量</th>
                  <th>單價</th>
                  <th>金額</th>
                </tr>
              </thead>
              <tbody>
                {(expandedRow.lines || []).map((line) => (
                  <tr key={line.id}>
                    <td>{dash(line.product_code)}</td>
                    <td>{dash(line.name)}</td>
                    <td>{dash(line.batch_no)}</td>
                    <td>{dash(line.location_code)}</td>
                    <td>{fmtQty(line.qty)}</td>
                    <td>{fmtMoney(line.unit_price)}</td>
                    <td>{fmtMoney(line.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      <Modal
        open={!!voidTarget}
        title={`作廢銷貨單：${voidTarget ? voidTarget.so_no : ''}`}
        onClose={() => setVoidTarget(null)}
        footer={
          <>
            <Button variant="default" onClick={() => setVoidTarget(null)}>
              取消
            </Button>
            <Button variant="danger" onClick={handleVoid}>
              確認作廢
            </Button>
          </>
        }
      >
        <div className="hint-box">作廢後系統將以反向結存明細沖銷庫存，並保留原明細。</div>
        <Field label="作廢原因" required>
          <Input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
        </Field>
      </Modal>
    </div>
  )
}
