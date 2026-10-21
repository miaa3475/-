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
  fmtDate,
  fmtDateTime,
  fmtMoney,
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

const emptyLine = () => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  product_id: '',
  product_code: '',
  name: '',
  qty: '',
  unit_price: '',
  batch_no: '',
})

export default function Purchases() {
  const { role } = useAuth()
  const toast = useToast()
  const canSubmit = hasRole(role, 'PURCHASE')
  const canApprove = hasRole(role, 'ADMIN')

  const [replenishment, setReplenishment] = useState([])
  const [orders, setOrders] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const [supplierFilter, setSupplierFilter] = useState('')
  const [checked, setChecked] = useState({})

  const [createOpen, setCreateOpen] = useState(false)
  const [supplierId, setSupplierId] = useState('')
  const [expectedDate, setExpectedDate] = useState('')
  const [lines, setLines] = useState([])
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)

  const [expanded, setExpanded] = useState(null)
  const [reasonTarget, setReasonTarget] = useState(null)
  const [reasonType, setReasonType] = useState('reject')
  const [reason, setReason] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [orderData, replenishData, supplierData, productData] = await Promise.all([
        api.get('/purchase/orders' + qs({ status })),
        api.get('/purchase/replenishment'),
        api.get('/suppliers'),
        api.get('/products'),
      ])
      setOrders(Array.isArray(orderData) ? orderData : [])
      setReplenishment(Array.isArray(replenishData) ? replenishData : [])
      setSuppliers(Array.isArray(supplierData) ? supplierData : [])
      setProducts(Array.isArray(productData) ? productData : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => {
    load()
  }, [load])

  const supplierOptions = useMemo(
    () => suppliers.map((s) => ({ value: String(s.id), label: s.company_name })),
    [suppliers],
  )

  const productOptions = useMemo(
    () =>
      products.map((p) => ({
        value: String(p.id),
        label: `${p.product_code || ''} ${p.name || ''}`.trim(),
        product: p,
      })),
    [products],
  )

  const filteredReplenishment = useMemo(() => {
    if (!supplierFilter) return replenishment
    return replenishment.filter(
      (row) => String(row.best_supplier_id || '') === String(supplierFilter),
    )
  }, [replenishment, supplierFilter])

  const checkedRows = useMemo(
    () => filteredReplenishment.filter((row) => checked[row.product_id]),
    [filteredReplenishment, checked],
  )

  const toggleChecked = (productId) => {
    setChecked((prev) => ({ ...prev, [productId]: !prev[productId] }))
  }

  const openCreateWithSuggestion = () => {
    if (checkedRows.length === 0) {
      toast.error('請先勾選要採購的商品')
      return
    }
    if (!supplierFilter) {
      toast.error('請先選擇供應商')
      return
    }
    setCreateError('')
    setSupplierId(supplierFilter)
    setExpectedDate('')
    setLines(
      checkedRows.map((row) => ({
        ...emptyLine(),
        product_id: row.product_id,
        product_code: row.product_code || '',
        name: row.name || '',
        qty: row.suggested_qty === undefined || row.suggested_qty === null ? '' : String(row.suggested_qty),
        unit_price:
          row.best_price === undefined || row.best_price === null ? '' : String(row.best_price),
      })),
    )
    setCreateOpen(true)
  }

  const openCreateManual = () => {
    setCreateError('')
    setSupplierId(supplierFilter || (suppliers.length ? String(suppliers[0].id) : ''))
    setExpectedDate('')
    setLines([])
    setCreateOpen(true)
  }

  const updateLine = (key, field, value) => {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, [field]: value } : line)))
  }

  const removeLine = (key) => setLines((prev) => prev.filter((line) => line.key !== key))

  const addProduct = (product) => {
    if (!product) return
    setLines((prev) => [
      ...prev,
      {
        ...emptyLine(),
        product_id: product.id,
        product_code: product.product_code || '',
        name: product.name || '',
        unit_price:
          product.purchase_price === undefined || product.purchase_price === null
            ? ''
            : String(product.purchase_price),
      },
    ])
  }

  const handleCreate = async () => {
    setCreateError('')
    if (!supplierId) {
      setCreateError('請選擇供應商')
      return
    }
    if (lines.length === 0) {
      setCreateError('請至少加入一項商品')
      return
    }
    for (const line of lines) {
      if (!line.product_id) {
        setCreateError('有品項尚未指定商品')
        return
      }
      if (line.qty === '' || Number(line.qty) <= 0) {
        setCreateError(`「${line.name || '品項'}」的數量必須大於 0`)
        return
      }
    }

    const payload = {
      supplier_id: Number(supplierId),
      expected_date: expectedDate || undefined,
      lines: lines.map((line) => ({
        product_id: Number(line.product_id),
        qty: Number(line.qty),
        unit_price: line.unit_price === '' ? undefined : Number(line.unit_price),
        batch_no: line.batch_no.trim() || undefined,
      })),
    }

    setCreating(true)
    try {
      const result = await api.post('/purchase/orders', payload)
      toast.success(`採購單 ${result.po_no || ''} 已建立`.trim())
      setCreateOpen(false)
      setChecked({})
      load()
    } catch (err) {
      setCreateError(err.message)
    } finally {
      setCreating(false)
    }
  }

  const handleSubmitOrder = async (order) => {
    try {
      await api.post(`/purchase/orders/${order.id}/submit`)
      toast.success(`採購單 ${order.po_no} 已送單`)
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleApprove = async (order) => {
    try {
      const result = await api.post(`/purchase/orders/${order.id}/approve`)
      toast.success(`採購單 ${result.po_no || order.po_no} 已核准`)
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleReject = async () => {
    if (!reasonTarget) return
    if (!reason.trim()) {
      toast.error('請填寫原因')
      return
    }
    try {
      if (reasonType === 'reject') {
        await api.post(`/purchase/orders/${reasonTarget.id}/reject`, { reason: reason.trim() })
        toast.success(`採購單 ${reasonTarget.po_no} 已駁回`)
      } else {
        const result = await api.post(`/purchase/orders/${reasonTarget.id}/void`, { reason: reason.trim() })
        toast.success(
          result && result.new_id
            ? `採購單 ${reasonTarget.po_no} 已作廢，產生新單 #${result.new_id}`
            : `採購單 ${reasonTarget.po_no} 已作廢`,
        )
      }
      setReasonTarget(null)
      setReason('')
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const expandedRow = orders.find((row) => row.id === expanded)

  return (
    <div>
      <PageHeader
        title="採購作業"
        desc="依補貨建議建立採購單，送單後由主管核准"
        actions={
          <Button variant="primary" onClick={openCreateManual}>
            新建採購單
          </Button>
        }
      />

      <Card
        title="補貨建議"
        extra={
          <div className="toolbar">
            <Field label="供應商">
              <Select
                options={supplierOptions}
                value={supplierFilter}
                placeholder="全部供應商"
                onChange={(e) => {
                  setSupplierFilter(e.target.value)
                  setChecked({})
                }}
              />
            </Field>
            <Button variant="primary" onClick={openCreateWithSuggestion} disabled={checkedRows.length === 0}>
              帶入採購單（{checkedRows.length}）
            </Button>
          </div>
        }
      >
        <Table
          loading={loading}
          error={error}
          rows={filteredReplenishment}
          empty="目前沒有補貨建議"
          columns={[
            {
              key: 'check',
              title: '選取',
              render: (row) => (
                <input
                  type="checkbox"
                  checked={!!checked[row.product_id]}
                  onChange={() => toggleChecked(row.product_id)}
                />
              ),
            },
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
              title: '建議數量',
              className: 'num',
              render: (row) => fmtQty(row.suggested_qty),
            },
            {
              key: 'best_supplier_name',
              title: '建議供應商',
              render: (row) => dash(row.best_supplier_name),
            },
            { key: 'best_price', title: '建議單價', className: 'num', render: (row) => fmtMoney(row.best_price) },
          ]}
        />
      </Card>

      <Card
        title="採購單列表"
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
          rows={orders}
          empty="沒有符合條件的採購單"
          columns={[
            { key: 'po_no', title: '採購單號', render: (row) => dash(row.po_no) },
            { key: 'status', title: '狀態', render: (row) => <Badge status={row.status} /> },
            { key: 'supplier_name', title: '供應商', render: (row) => dash(row.supplier_name) },
            { key: 'expected_date', title: '預計到貨日', render: (row) => fmtDate(row.expected_date) },
            {
              key: 'total_amount',
              title: '總金額',
              className: 'num',
              render: (row) => fmtMoney(row.total_amount),
            },
            { key: 'sent_at', title: '送單時間', render: (row) => fmtDateTime(row.sent_at) },
            { key: 'approved_at', title: '核准時間', render: (row) => fmtDateTime(row.approved_at) },
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
                    <Button variant="primary" className="btn-sm" onClick={() => handleSubmitOrder(row)}>
                      送單
                    </Button>
                  ) : null}
                  {canApprove && row.status === 'PENDING_APPROVAL' ? (
                    <Button variant="ok" className="btn-sm" onClick={() => handleApprove(row)}>
                      核准
                    </Button>
                  ) : null}
                  {canApprove && row.status === 'PENDING_APPROVAL' ? (
                    <Button
                      variant="danger"
                      className="btn-sm"
                      onClick={() => {
                        setReasonType('reject')
                        setReasonTarget(row)
                      }}
                    >
                      駁回
                    </Button>
                  ) : null}
                  {canApprove && row.status === 'APPROVED' ? (
                    <Button
                      variant="danger"
                      className="btn-sm"
                      onClick={() => {
                        setReasonType('void')
                        setReasonTarget(row)
                      }}
                    >
                      作廢
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
                  <th>訂購量</th>
                  <th>已收量</th>
                  <th>單價</th>
                </tr>
              </thead>
              <tbody>
                {(expandedRow.lines || []).map((line) => (
                  <tr key={line.id}>
                    <td>{dash(line.product_code)}</td>
                    <td>{dash(line.name)}</td>
                    <td>{dash(line.batch_no)}</td>
                    <td>{fmtQty(line.qty_ordered)}</td>
                    <td>{fmtQty(line.qty_received)}</td>
                    <td>{fmtMoney(line.unit_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      <Modal
        open={createOpen}
        title="建立採購單"
        onClose={() => setCreateOpen(false)}
        width={760}
        footer={
          <>
            <Button variant="default" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button variant="primary" onClick={handleCreate} disabled={creating}>
              {creating ? '建立中…' : '建立採購單'}
            </Button>
          </>
        }
      >
        {createError ? <div className="login-error">{createError}</div> : null}
        <div className="form-grid">
          <Field label="供應商" required>
            <Select
              options={supplierOptions}
              value={supplierId}
              placeholder="請選擇供應商"
              onChange={(e) => setSupplierId(e.target.value)}
            />
          </Field>
          <Field label="預計到貨日">
            <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
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
                <th style={{ width: 130 }}>數量</th>
                <th style={{ width: 130 }}>單價</th>
                <th style={{ width: 140 }}>批號</th>
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
                      <Input
                        className="line-editor"
                        value={line.batch_no}
                        onChange={(e) => updateLine(line.key, 'batch_no', e.target.value)}
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
      </Modal>

      <Modal
        open={!!reasonTarget}
        title={reasonType === 'reject' ? '駁回採購單' : '作廢採購單'}
        onClose={() => setReasonTarget(null)}
        footer={
          <>
            <Button variant="default" onClick={() => setReasonTarget(null)}>
              取消
            </Button>
            <Button variant="danger" onClick={handleReject}>
              確認
            </Button>
          </>
        }
      >
        <Field label="原因" required>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Modal>
    </div>
  )
}
