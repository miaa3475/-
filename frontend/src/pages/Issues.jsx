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

/** 領用用途：依需求不得提供「銷貨」用途（銷貨請至銷貨單作業） */
const PURPOSE_OPTIONS = [
  { value: '生產領用', label: '生產領用' },
  { value: '內部消耗', label: '內部消耗' },
  { value: '樣品試用', label: '樣品試用' },
  { value: '展覽活動', label: '展覽活動' },
  { value: '維修保養', label: '維修保養' },
  { value: '報廢處理', label: '報廢處理' },
  { value: '其他', label: '其他' },
]

const STATUS_OPTIONS = [
  { value: '', label: '全部狀態' },
  { value: 'DRAFT', label: '草稿' },
  { value: 'SUBMITTED', label: '已提交' },
  { value: 'VOIDED', label: '已作廢' },
]

const emptyLine = () => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2,  8)}`,
  product_id: '',
  product_code: '',
  name: '',
  batch_id: '',
  batch_no: '',
  qty: '',
  location_id: '',
})

export default function Issues() {
  const { role } = useAuth()
  const toast = useToast()
  const canVoid = hasRole(role, 'ADMIN')

  const [issues, setIssues] = useState([])
  const [products, setProducts] = useState([])
  const [stock, setStock] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const [purpose, setPurpose] = useState(PURPOSE_OPTIONS[0].value)
  const [remark, setRemark] = useState('')
  const [lines, setLines] = useState([])
  const [submitting, setSubmitting] = useState(false)

  const [expanded, setExpanded] = useState(null)
  const [voidTarget, setVoidTarget] = useState(null)
  const [voidReason, setVoidReason] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.get('/issues' + qs({ from, to }))
      setIssues(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [from, to])

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
        if (field === 'product_id') {
          const batches = batchesOf(value)
          next.batch_id = ''
          next.batch_no = ''
          next.location_id = batches.length ? String(batches[0].batch.location_id) : ''
        }
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
    if (!purpose) {
      toast.error('請選擇領用用途')
      return
    }
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
      purpose,
      remark: remark.trim() || undefined,
      lines: lines.map((line) => ({
        product_id: Number(line.product_id),
        batch_id: line.batch_id === '' ? undefined : Number(line.batch_id),
        qty: Number(line.qty),
        location_id: Number(line.location_id),
      })),
    }

    setSubmitting(true)
    try {
      const result = await api.post('/issues', payload)
      toast.success(`領用單 ${result.issue_no || ''} 已建立`.trim())
      setLines([])
      setRemark('')
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
      await api.post(`/issues/${voidTarget.id}/void`, { reason: voidReason.trim() })
      toast.success(`領用單 ${voidTarget.issue_no} 已作廢`)
      setVoidTarget(null)
      setVoidReason('')
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const expandedRow = issues.find((row) => row.id === expanded)

  return (
    <div>
      <PageHeader title="領用單" desc="登記內部領用與消耗，領用用途不得為銷貨" />

      <Card title="建立領用單">
        <div className="form-grid">
          <Field label="領用用途" required hint="銷貨請至「銷貨單」作業建立">
            <Select
              options={PURPOSE_OPTIONS}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
            />
          </Field>
          <Field label="備註">
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
                <th style={{ width: 120 }}>數量</th>
                <th style={{ width: 80 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 20 }}>
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
            {submitting ? '送出中…' : '送出領用單'}
          </Button>
        </div>
      </Card>

      <Card
        title="領用單列表"
        extra={
          <div className="toolbar">
            <Field label="起始日期">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="結束日期">
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
        }
      >
        <Table
          loading={loading}
          error={error}
          rows={issues}
          empty="沒有符合條件的領用單"
          columns={[
            { key: 'issue_no', title: '領用單號', render: (row) => dash(row.issue_no) },
            { key: 'status', title: '狀態', render: (row) => <Badge status={row.status} /> },
            { key: 'purpose', title: '用途', render: (row) => dash(row.purpose) },
            { key: 'remark', title: '備註', render: (row) => dash(row.remark) },
            { key: 'operator', title: '經手人', render: (row) => dash(row.operator) },
            { key: 'occurred_at', title: '領用時間', render: (row) => fmtDateTime(row.occurred_at) },
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      <Modal
        open={!!voidTarget}
        title={`作廢領用單：${voidTarget ? voidTarget.issue_no : ''}`}
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
