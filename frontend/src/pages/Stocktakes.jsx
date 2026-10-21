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
  { value: 'IN_PROGRESS', label: '進行中' },
  { value: 'SUBMITTED', label: '已提交' },
  { value: 'APPROVED', label: '已核准' },
  { value: 'ABORTED', label: '已中止' },
  { value: 'VOIDED', label: '已作廢' },
]

const SCOPE_OPTIONS = [
  { value: 'LOCATION', label: '依庫位盤點' },
  { value: 'CATEGORY', label: '依商品類別盤點' },
  { value: 'PRODUCT', label: '依商品盤點' },
]

export default function Stocktakes() {
  const { role } = useAuth()
  const toast = useToast()
  const canCreate = hasRole(role, 'WAREHOUSE', 'ADMIN')
  const canSubmit = hasRole(role, 'WAREHOUSE', 'ADMIN')
  const canApprove = hasRole(role, 'ADMIN')

  const [stocktakes, setStocktakes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const [locations, setLocations] = useState([])
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])

  const [createOpen, setCreateOpen] = useState(false)
  const [scopeType, setScopeType] = useState('LOCATION')
  const [scopeId, setScopeId] = useState('')
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)

  // 快取建立當下取得的明細（契約未提供單張盤點明細查詢端點）
  const [lineCache, setLineCache] = useState({})
  const [activeId, setActiveId] = useState(null)
  const [actualMap, setActualMap] = useState({})
  const [savingLines, setSavingLines] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.get('/stocktakes' + qs({ status }))
      setStocktakes(Array.isArray(data) ? data : [])
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
      .get('/locations')
      .then((data) => !cancelled && setLocations(Array.isArray(data) ? data : []))
      .catch(() => !cancelled && setLocations([]))
    api
      .get('/categories')
      .then((data) => !cancelled && setCategories(Array.isArray(data) ? data : []))
      .catch(() => !cancelled && setCategories([]))
    api
      .get('/products')
      .then((data) => !cancelled && setProducts(Array.isArray(data) ? data : []))
      .catch(() => !cancelled && setProducts([]))
    return () => {
      cancelled = true
    }
  }, [])

  const scopeOptions = useMemo(() => {
    if (scopeType === 'LOCATION') {
      return locations.map((loc) => ({
        value: String(loc.id),
        label: `${loc.code || ''} ${loc.name || ''}`.trim(),
      }))
    }
    if (scopeType === 'CATEGORY') {
      return categories.map((cat) => ({ value: String(cat.id), label: cat.name }))
    }
    return products.map((p) => ({
      value: String(p.id),
      label: `${p.product_code || ''} ${p.name || ''}`.trim(),
    }))
  }, [scopeType, locations, categories, products])

  const handleCreate = async () => {
    setCreateError('')
    if (!scopeId) {
      setCreateError('請選擇盤點目標')
      return
    }
    setCreating(true)
    try {
      const result = await api.post('/stocktakes', {
        scope_type: scopeType,
        scope_id: Number(scopeId),
      })
      const lines = Array.isArray(result.lines) ? result.lines : []
      setLineCache((prev) => ({ ...prev, [result.id]: lines }))
      const initial = {}
      lines.forEach((line) => {
        initial[line.id] = line.actual_qty === undefined || line.actual_qty === null ? '' : String(line.actual_qty)
      })
      setActualMap(initial)
      setActiveId(result.id)
      setCreateOpen(false)
      setScopeId('')
      toast.success(`盤點單 ${result.st_no || ''} 已建立`.trim())
      load()
    } catch (err) {
      setCreateError(err.message)
    } finally {
      setCreating(false)
    }
  }

  const openStocktake = (stocktake) => {
    setActiveId(stocktake.id)
    const lines = stocktake.lines || lineCache[stocktake.id] || []
    const initial = {}
    lines.forEach((line) => {
      initial[line.id] = line.actual_qty === undefined || line.actual_qty === null ? '' : String(line.actual_qty)
    })
    setActualMap(initial)
  }

  const activeStocktake = stocktakes.find((item) => item.id === activeId)
  const activeLines = (activeStocktake && activeStocktake.lines) || lineCache[activeId] || []

  const handleSaveLines = async () => {
    if (!activeId) return
    const payload = {
      lines: Object.keys(actualMap).map((id) => ({
        id: Number(id),
        actual_qty: actualMap[id] === '' ? null : Number(actualMap[id]),
      })),
    }
    setSavingLines(true)
    try {
      await api.put(`/stocktakes/${activeId}/lines`, payload)
      toast.success('盤點明細已儲存')
      load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSavingLines(false)
    }
  }

  const handleSubmit = async (stocktake) => {
    try {
      const result = await api.post(`/stocktakes/${stocktake.id}/submit`)
      const rate = result && result.total_diff_rate !== undefined ? result.total_diff_rate : '—'
      toast.success(`盤點單 ${stocktake.st_no} 已提交，差異率 ${rate}`)
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleApprove = async (stocktake) => {
    try {
      await api.post(`/stocktakes/${stocktake.id}/approve`)
      toast.success(`盤點單 ${stocktake.st_no} 已核准`)
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleAbort = async (stocktake) => {
    if (!window.confirm(`確定要中止盤點單「${stocktake.st_no}」嗎？`)) return
    try {
      await api.post(`/stocktakes/${stocktake.id}/abort`)
      toast.success(`盤點單 ${stocktake.st_no} 已中止`)
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div>
      <PageHeader
        title="盤點作業"
        desc="依庫位／類別／商品建立盤點單，填寫實盤數量後送單與核准"
        actions={
          canCreate ? (
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              建立盤點單
            </Button>
          ) : null
        }
      />

      <Card
        title="盤點單列表"
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
          rows={stocktakes}
          empty="沒有符合條件的盤點單"
          columns={[
            { key: 'st_no', title: '盤點單號', render: (row) => dash(row.st_no) },
            { key: 'status', title: '狀態', render: (row) => <Badge status={row.status} /> },
            { key: 'scope_type', title: '範圍類型', render: (row) => dash(row.scope_type) },
            { key: 'scope_id', title: '範圍目標', render: (row) => dash(row.scope_id) },
            {
              key: 'total_diff_rate',
              title: '差異率',
              className: 'num',
              render: (row) => (row.total_diff_rate === undefined || row.total_diff_rate === null ? '—' : fmtQty(row.total_diff_rate)),
            },
            { key: 'created_at', title: '建立時間', render: (row) => fmtDateTime(row.created_at) },
            { key: 'submitted_at', title: '提交時間', render: (row) => fmtDateTime(row.submitted_at) },
            {
              key: 'actions',
              title: '操作',
              render: (row) => (
                <div className="row-actions">
                  <Button variant="default" className="btn-sm" onClick={() => openStocktake(row)}>
                    明細
                  </Button>
                  {canSubmit && row.status === 'IN_PROGRESS' ? (
                    <Button variant="primary" className="btn-sm" onClick={() => handleSubmit(row)}>
                      提交
                    </Button>
                  ) : null}
                  {canApprove && row.status === 'SUBMITTED' ? (
                    <Button variant="ok" className="btn-sm" onClick={() => handleApprove(row)}>
                      核准
                    </Button>
                  ) : null}
                  {canSubmit && row.status === 'IN_PROGRESS' ? (
                    <Button variant="danger" className="btn-sm" onClick={() => handleAbort(row)}>
                      中止
                    </Button>
                  ) : null}
                </div>
              ),
            },
          ]}
        />
      </Card>

      {activeStocktake ? (
        <Card
          title={`盤點明細：${activeStocktake.st_no || ''}`}
          extra={
            <div className="row-actions">
              <Button variant="default" onClick={() => setActiveId(null)}>
                關閉
              </Button>
              {canSubmit && activeStocktake.status === 'IN_PROGRESS' ? (
                <Button variant="primary" onClick={handleSaveLines} disabled={savingLines}>
                  {savingLines ? '儲存中…' : '儲存實盤數量'}
                </Button>
              ) : null}
            </div>
          }
        >
          {activeLines.length === 0 ? (
            <div className="state-box state-empty">
              契約未提供單張盤點明細查詢端點（GET /api/stocktakes/{id}），故僅能顯示建立當下取得的明細。
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>商品編號</th>
                    <th>商品名稱</th>
                    <th>批號</th>
                    <th>庫位</th>
                    <th>帳面數量</th>
                    <th style={{ width: 140 }}>實盤數量</th>
                    <th>差異</th>
                  </tr>
                </thead>
                <tbody>
                  {activeLines.map((line) => {
                    const actual = actualMap[line.id]
                    const diff =
                      actual === '' || actual === undefined
                        ? dash(line.diff_qty)
                        : fmtQty(Number(actual) - Number(line.book_qty || 0))
                    return (
                      <tr key={line.id}>
                        <td>{dash(line.product_code)}</td>
                        <td>{dash(line.name)}</td>
                        <td>{dash(line.batch_no)}</td>
                        <td>{dash(line.location_code)}</td>
                        <td className="num">{fmtQty(line.book_qty)}</td>
                        <td>
                          <Input
                            type="number"
                            step="0.001"
                            className="line-editor"
                            value={actual === undefined ? '' : actual}
                            disabled={activeStocktake.status !== 'IN_PROGRESS'}
                            onChange={(e) =>
                              setActualMap((prev) => ({ ...prev, [line.id]: e.target.value }))
                            }
                          />
                        </td>
                        <td className="num">{diff}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      <Modal
        open={createOpen}
        title="建立盤點單"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button variant="default" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button variant="primary" onClick={handleCreate} disabled={creating}>
              {creating ? '建立中…' : '建立'}
            </Button>
          </>
        }
      >
        {createError ? <div className="login-error">{createError}</div> : null}
        <div className="form-grid">
          <Field label="盤點範圍" required>
            <Select
              options={SCOPE_OPTIONS}
              value={scopeType}
              onChange={(e) => {
                setScopeType(e.target.value)
                setScopeId('')
              }}
            />
          </Field>
          <Field label="盤點目標" required>
            <Select
              options={scopeOptions}
              value={scopeId}
              placeholder="請選擇目標"
              onChange={(e) => setScopeId(e.target.value)}
            />
          </Field>
        </div>
        <div className="hint-box">建立盤點單期間，該範圍內的庫存異動將被凍結阻擋。</div>
      </Modal>
    </div>
  )
}
