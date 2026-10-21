import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, qs } from '../api'
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
  batch_no: '',
  expiry_date: '',
  qty: '',
  location_id: '',
  unit_price: '',
})

export default function Receipts() {
  const { role } = useAuth()
  const toast = useToast()
  const canVoid = hasRole(role, 'ADMIN')

  const [receipts, setReceipts] = useState([])
  const [orders, setOrders] = useState([])
  const [products, setProducts] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const [poId, setPoId] = useState('')
  const [reason, setReason] = useState('')
  const [lines, setLines] = useState([])
  const [barcode, setBarcode] = useState('')
  const [scanError, setScanError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const barcodeRef = useRef(null)

  const [expanded, setExpanded] = useState(null)
  const [voidTarget, setVoidTarget] = useState(null)
  const [voidReason, setVoidReason] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.get('/receipts' + qs({ status }))
      setReceipts(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    let cancelled = false
    api
      .get('/purchase/orders' + qs({ status: 'APPROVED' }))
      .then((data) => {
        if (!cancelled) setOrders(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (!cancelled) setOrders([])
      })
    api
      .get('/products')
      .then((data) => {
        if (!cancelled) setProducts(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (!cancelled) setProducts([])
      })
    api
      .get('/locations')
      .then((data) => {
        if (!cancelled) setLocations(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (!cancelled) setLocations([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (barcodeRef.current) barcodeRef.current.focus()
  }, [])

  const defaultLocationId = useMemo(() => {
    const usable = locations.find((loc) => !loc.is_frozen)
    return usable ? String(usable.id) : ''
  }, [locations])

  // 價格欄位是否存在：由後端回應內容判斷（前端不依角色判斷）
  const priceVisible = useMemo(() => {
    const fromOrder = orders.some((po) => (po.lines || []).some((l) => l.unit_price !== undefined && l.unit_price !== null))
    const fromReceipt = receipts.some((r) => (r.lines || []).some((l) => l.unit_price !== undefined && l.unit_price !== null))
    if (orders.length === 0 && receipts.length === 0) return true
    return fromOrder || fromReceipt
  }, [orders, receipts])

  const locationOptions = useMemo(
    () =>
      locations.map((loc) => ({
        value: String(loc.id),
        label: `${loc.code || ''} ${loc.name || ''}`.trim(),
      })),
    [locations],
  )

  const orderOptions = useMemo(
    () =>
      orders.map((po) => ({
        value: String(po.id),
        label: `${po.po_no || ''} ${po.supplier_name || ''}`.trim(),
      })),
    [orders],
  )

  const productOptions = useMemo(
    () =>
      products.map((p) => ({
        value: `${p.product_code || ''} ${p.name || ''}`.trim(),
        label: `${p.product_code || ''} ${p.name || ''}`.trim(),
        product: p,
      })),
    [products],
  )

  const addProduct = useCallback(
    (product) => {
      if (!product) return
      setLines((prev) => {
        const exists = prev.find(
          (line) =>
            String(line.product_id) === String(product.id) &&
            (line.batch_no || '') === '' &&
            String(line.location_id) === String(defaultLocationId),
        )
        if (exists) {
          return prev.map((line) =>
            line.key === exists.key
              ? { ...line, qty: line.qty === '' ? 1 : Number(line.qty) + 1 }
              : line,
          )
        }
        return [
          ...prev,
          {
            ...emptyLine(),
            product_id: product.id,
            product_code: product.product_code || '',
            name: product.name || '',
            qty: 1,
            location_id: defaultLocationId,
            unit_price:
              product.purchase_price === undefined || product.purchase_price === null
                ? ''
                : String(product.purchase_price),
          },
        ]
      })
      toast.success(`已加入商品：${product.name}`)
    },
    [defaultLocationId, toast],
  )

  const handleBarcodeSubmit = async (event) => {
    event.preventDefault()
    const code = barcode.trim()
    if (!code) return
    setScanError('')
    try {
      let found = await api.get('/products' + qs({ barcode: code }))
      let list = Array.isArray(found) ? found : []
      if (list.length === 0) {
        found = await api.get('/products' + qs({ q: code }))
        list = Array.isArray(found) ? found : []
      }
      if (list.length === 0) {
        setScanError(`查無條碼「${code}」對應的商品`)
        setBarcode('')
        return
      }
      const exact =
        list.find((p) => p.barcode === code) ||
        list.find((p) => p.product_code === code) ||
        list[0]
      addProduct(exact)
      setBarcode('')
      if (barcodeRef.current) barcodeRef.current.focus()
    } catch (err) {
      setScanError(err.message)
    }
  }

  const handlePickProduct = (event) => {
    const value = event.target.value
    if (!value) return
    const matched = productOptions.find((opt) => opt.value === value)
    if (matched) addProduct(matched.product)
    event.target.value = ''
  }

  const loadPurchaseOrder = (id) => {
    setPoId(id)
    if (!id) {
      setLines([])
      return
    }
    const order = orders.find((po) => String(po.id) === String(id))
    if (!order) return
    const nextLines = (order.lines || []).map((line) => {
      const ordered = Number(line.qty_ordered || 0)
      const received = Number(line.qty_received || 0)
      return {
        ...emptyLine(),
        product_id: line.product_id,
        product_code: line.product_code || '',
        name: line.name || '',
        batch_no: line.batch_no || '',
        qty: ordered - received > 0 ? String(ordered - received) : String(ordered),
        location_id: defaultLocationId,
        unit_price: line.unit_price === undefined || line.unit_price === null ? '' : String(line.unit_price),
      }
    })
    setLines(nextLines)
    toast.info(`已帶入採購單 ${order.po_no} 的品項`)
  }

  const updateLine = (key, field, value) => {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, [field]: value } : line)))
  }

  const removeLine = (key) => {
    setLines((prev) => prev.filter((line) => line.key !== key))
  }

  const resetForm = () => {
    setPoId('')
    setReason('')
    setLines([])
    setScanError('')
    setBarcode('')
    if (barcodeRef.current) barcodeRef.current.focus()
  }

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
      po_id: poId ? Number(poId) : undefined,
      reason: reason.trim() || undefined,
      lines: lines.map((line) => ({
        product_id: Number(line.product_id),
        batch_no: line.batch_no.trim() || undefined,
        expiry_date: line.expiry_date || undefined,
        qty: Number(line.qty),
        location_id: Number(line.location_id),
        unit_price: line.unit_price === '' ? undefined : Number(line.unit_price),
      })),
    }

    setSubmitting(true)
    try {
      const result = await api.post('/receipts', payload)
      toast.success(`進貨單 ${result.gr_no || ''} 已建立`.trim())
      resetForm()
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
      const result = await api.post(`/receipts/${voidTarget.id}/void`, { reason: voidReason.trim() })
      toast.success(
        result && result.new_id
          ? `進貨單 ${voidTarget.gr_no} 已作廢，產生沖銷單 #${result.new_id}`
          : `進貨單 ${voidTarget.gr_no} 已作廢`,
      )
      setVoidTarget(null)
      setVoidReason('')
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const receiptColumns = [
    { key: 'gr_no', title: '進貨單號', render: (row) => dash(row.gr_no) },
    { key: 'po_no', title: '採購單號', render: (row) => dash(row.po_no) },
    { key: 'status', title: '狀態', render: (row) => <Badge status={row.status} /> },
    { key: 'received_at', title: '進貨時間', render: (row) => fmtDateTime(row.received_at) },
    { key: 'operator', title: '收貨人', render: (row) => dash(row.operator) },
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
  ]

  const detailColumns = [
    { key: 'product_code', title: '商品編號', render: (row) => dash(row.product_code) },
    { key: 'name', title: '商品名稱', render: (row) => dash(row.name) },
    { key: 'batch_no', title: '批號', render: (row) => dash(row.batch_no) },
    { key: 'qty', title: '數量', className: 'num', render: (row) => fmtQty(row.qty) },
    { key: 'location_code', title: '庫位', render: (row) => dash(row.location_code) },
  ]

  const expandedRow = receipts.find((row) => row.id === expanded)

  return (
    <div>
      <PageHeader title="進貨單" desc="掃條碼或挑選商品建立進貨單，可由已核准採購單帶入" />

      <Card title="建立進貨單">
        <div className="form-grid">
          <Field label="帶入採購單" hint="僅可帶入已核准（APPROVED）的採購單">
            <Select
              options={orderOptions}
              value={poId}
              placeholder="不帶入（手動建單）"
              onChange={(e) => loadPurchaseOrder(e.target.value)}
            />
          </Field>
          <Field label="進貨原因／備註">
            <Input
              value={reason}
              placeholder="例如：正常採購進貨"
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        </div>

        <div className="form-inline">
          <Field label="掃描條碼">
            <Input
              ref={barcodeRef}
              value={barcode}
              placeholder="輸入或掃描商品條碼後按 Enter"
              onChange={(e) => setBarcode(e.target.value)}
            />
          </Field>
          <Button variant="primary" onClick={handleBarcodeSubmit}>
            加入商品
          </Button>
          <Field label="挑選商品">
            <select className="input" value="" onChange={handlePickProduct}>
              <option value="">請選擇商品</option>
              {productOptions.map((opt) => (
                <option key={opt.product.id} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {scanError ? <div className="login-error">{scanError}</div> : null}

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>商品</th>
                <th>批號</th>
                <th>效期</th>
                <th style={{ width: 120 }}>數量</th>
                <th style={{ width: 190 }}>庫位</th>
                {priceVisible ? <th style={{ width: 120 }}>單價</th> : null}
                <th style={{ width: 80 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={priceVisible ? 7 : 6} className="muted" style={{ textAlign: 'center', padding: 20 }}>
                    尚未加入品項，請掃描條碼或挑選商品
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
                      <Input
                        className="line-editor"
                        value={line.batch_no}
                        onChange={(e) => updateLine(line.key, 'batch_no', e.target.value)}
                      />
                    </td>
                    <td>
                      <Input
                        type="date"
                        className="line-editor"
                        value={line.expiry_date}
                        onChange={(e) => updateLine(line.key, 'expiry_date', e.target.value)}
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
                      <Select
                        options={locationOptions}
                        value={line.location_id}
                        placeholder="請選擇庫位"
                        onChange={(e) => updateLine(line.key, 'location_id', e.target.value)}
                      />
                    </td>
                    {priceVisible ? (
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
                    ) : null}
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
          <Button variant="default" onClick={resetForm}>
            清空
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? '送出中…' : '送出進貨單'}
          </Button>
        </div>
      </Card>

      <Card
        title="進貨單列表"
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
          rows={receipts}
          empty="沒有符合條件的進貨單"
          columns={receiptColumns}
        />
        {expandedRow && (expandedRow.lines || []).length > 0 ? (
          <div className="table-wrap">
            <table className="sub-table">
              <thead>
                <tr>
                  {detailColumns.map((col) => (
                    <th key={col.key}>{col.title}</th>
                  ))}
                  {priceVisible ? <th>單價</th> : null}
                  <th>小計</th>
                </tr>
              </thead>
              <tbody>
                {(expandedRow.lines || []).map((line) => (
                  <tr key={line.id}>
                    {detailColumns.map((col) => (
                      <td key={col.key} className={col.className || ''}>
                        {col.render ? col.render(line) : dash(line[col.key])}
                      </td>
                    ))}
                    {priceVisible ? <td>{fmtMoney(line.unit_price)}</td> : null}
                    <td>
                      {priceVisible && line.unit_price !== undefined
                        ? fmtMoney(Number(line.unit_price) * Number(line.qty || 0))
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      <Modal
        open={!!voidTarget}
        title={`作廢進貨單：${voidTarget ? voidTarget.gr_no : ''}`}
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
