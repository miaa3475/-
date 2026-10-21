import React, { useCallback, useEffect, useMemo, useState } from 'react'
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
  fmtQty,
  useToast,
} from '../components/ui'

const STATUS_OPTIONS = [
  { value: '', label: '全部狀態' },
  { value: 'DRAFT', label: '草稿' },
  { value: 'PENDING_APPROVAL', label: '待核准' },
  { value: 'APPROVED', label: '已核准' },
  { value: 'REJECTED', label: '已駁回' },
  { value: 'VOIDED', label: '已作廢' },
]

const REASON_OPTIONS = [
  { value: '盤盈', label: '盤盈' },
  { value: '盤虧', label: '盤虧' },
  { value: '損壞', label: '損壞報廢' },
  { value: '校正', label: '系統校正' },
  { value: '其他', label: '其他' },
]

const emptyLine = () => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  product_id: '',
  product_code: '',
  name: '',
  batch_id: '',
  batch_no: '',
  location_id: '',
  qty_delta: '',
})

export default function Adjustments() {
  const { role } = useAuth()
  const toast = useToast()
  const canSubmit = hasRole(role, 'WAREHOUSE', 'ADMIN')
  const canApprove = hasRole(role, 'ADMIN')

  const [adjustments, setAdjustments] = useState([])
  const [products, setProducts] = useState([])
  const [stock, setStock] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const [reasonCode, setReasonCode] = useState(REASON_OPTIONS[0].value)
  const [remark, setRemark] = useState('')
  const [lines, setLines] = useState([])
  const [submitting, setSubmitting] = useState(false)

  const [expanded, setExpanded] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.get('/adjustments' + qs({ status }))
      setAdjustments(Array.isArray(data) ? data : [])
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
        .filter((row) => String(row.product_id) === String(productId))
        .map((row) => ({
          value: String(row.batch_id),
          label: `${row.batch_no || '無批號'}（庫位 ${row.location_code || '—'}，現存 ${fmtQty(row.on_hand)}）`,
        })),
    [stock],
  )

  const addProduct = (product) => {
    if (!product) return
    setLines((prev) => [
      ...prev,
      {
        ...emptyLine(),
        product_id: product.id,
        product_code: product.product_code || '',
        name: product.name || '',
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
          next.batch_no = matched ? matched.label.split('（')[0] : ''
        }
        return next
      }),
    )
  }

  const removeLine = (key) => setLines((prev) => prev.filter((line) => line.key !== key))

  const handleSubmit = async (event) => {
    if (event) event.preventDefault()
    if (!reasonCode) {
      toast.error('請選擇調整原因代碼')
      return
    }
    if (lines.length === 0) {
      toast.error('請至少加入一項調整品項')
      return
    }
    for (const line of lines) {
      if (!line.product_id) {
        toast.error('有品項尚未指定商品')
        return
      }
      if (line.qty_delta === '' || Number(line.qty_delta) === 0) {
        toast.error(`「${line.name || '品項'}」的調整數量不可為 0`)
        return
      }
      if (!line.location_id) {
        toast.error(`「${line.name || '品項'}」尚未選擇庫位`)
        return
      }
    }

    const payload = {
      reason_code: reasonCode,
      remark: remark.trim() || undefined,
      lines: lines.map((line) => ({
        product_id: Number(line.product_id),
        batch_id: line.batch_id === '' ? undefined : Number(line.batch_id),
        location_id: Number(line.location_id),
        qty_delta: Number(line.qty_delta),
      })),
    }

    setSubmitting(true)
    try {
      const result = await api.post('/adjustments', payload)
      toast.success(`庫存調整單 ${result.adj_no || ''} 已建立`.trim())
      setLines([])
      setRemark('')
      load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSend = async (adjustment) => {
    try {
      await api.post(`/adjustments/${adjustment.id}/submit`)
      toast.success(`庫存調整單 ${adjustment.adj_no} 已送單`)
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleApprove = async (adjustment) => {
    try {
      await api.post(`/adjustments/${adjustment.id}/approve`, { approved: true })
      toast.success(`庫存調整單 ${adjustment.adj_no} 已核准`)
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const expandedRow = adjustments.find((row) => row.id === expanded)

  return (
    <div>
      <PageHeader title="庫存調整" desc="申請庫存數量差異調整，送單後由主管核准" />

      <Card title="申請庫存調整">
        <div className="form-grid">
          <Field label="原因代碼" required>
            <Select options={REASON_OPTIONS} value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} />
          </Field>
          <Field label="說明">
            <Input value={remark} onChange={(e) => setRemark(e.target.value)} />
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
                <th style={{ width: 130 }}>調整數量</th>
                <th style={{ width: 80 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 20 }}>
                    尚未加入調整品項
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
                        className="line-editor"
                        value={line.qty_delta}
                        onChange={(e) => updateLine(line.key, 'qty_delta', e.target.value)}
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
            {submitting ? '送出中…' : '送出調整申請'}
          </Button>
        </div>
      </Card>

      <Card
        title="庫存調整單列表"
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
          rows={adjustments}
          empty="沒有符合條件的庫存調整單"
          columns={[
            { key: 'adj_no', title: '調整單號', render: (row) => dash(row.adj_no) },
            { key: 'status', title: '狀態', render: (row) => <Badge status={row.status} /> },
            { key: 'reason_code', title: '原因代碼', render: (row) => dash(row.reason_code) },
            { key: 'remark', title: '說明', render: (row) => dash(row.remark) },
            { key: 'requested_by', title: '申請人', render: (row) => dash(row.requested_by) },
            { key: 'approved_by', title: '核准人', render: (row) => dash(row.approved_by) },
            { key: 'created_at', title: '建立時間', render: (row) => fmtDateTime(row.created_at) },
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
              render: (row) => (
                <div className="row-actions">
                  {canSubmit && row.status === 'DRAFT' ? (
                    <Button variant="primary" className="btn-sm" onClick={() => handleSend(row)}>
                      送單
                    </Button>
                  ) : null}
                  {canApprove && row.status === 'PENDING_APPROVAL' ? (
                    <Button variant="ok" className="btn-sm" onClick={() => handleApprove(row)}>
                      核准
                    </Button>
                  ) : null}
                </div>
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
                  <th>調整數量</th>
                </tr>
              </thead>
              <tbody>
                {(expandedRow.lines || []).map((line) => (
                  <tr key={line.id}>
                    <td>{dash(line.product_code)}</td>
                    <td>{dash(line.name)}</td>
                    <td>{dash(line.batch_no)}</td>
                    <td>{dash(line.location_code)}</td>
                    <td>{fmtQty(line.qty_delta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
    </div>
  )
}
