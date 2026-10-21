import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { api, qs } from '../api'
import {
  Button,
  Card,
  Field,
  Input,
  MovementBadge,
  PageHeader,
  Select,
  Table,
  dash,
  fmtDateTime,
  fmtQty,
  useToast,
} from '../components/ui'

export default function Moves() {
  const toast = useToast()
  const [products, setProducts] = useState([])
  const [stock, setStock] = useState([])
  const [locations, setLocations] = useState([])
  const [ledger, setLedger] = useState([])
  const [ledgerTotal, setLedgerTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [productId, setProductId] = useState('')
  const [batchId, setBatchId] = useState('')
  const [fromLocationId, setFromLocationId] = useState('')
  const [toLocationId, setToLocationId] = useState('')
  const [qty, setQty] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [movementType, setMovementType] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [productData, stockData, locationData, ledgerData] = await Promise.all([
        api.get('/products'),
        api.get('/stock'),
        api.get('/locations'),
        api.get('/stock/ledger' + qs({ movement_type: movementType, page: 1 })),
      ])
      setProducts(Array.isArray(productData) ? productData : [])
      setStock(Array.isArray(stockData) ? stockData : [])
      setLocations(Array.isArray(locationData) ? locationData : [])
      setLedger(ledgerData && Array.isArray(ledgerData.items) ? ledgerData.items : [])
      setLedgerTotal(ledgerData && ledgerData.total ? ledgerData.total : 0)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [movementType])

  useEffect(() => {
    load()
  }, [load])

  const productOptions = useMemo(
    () =>
      products.map((p) => ({
        value: String(p.id),
        label: `${p.product_code || ''} ${p.name || ''}`.trim(),
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

  const batchesOf = useMemo(
    () =>
      stock
        .filter((row) => String(row.product_id) === String(productId) && Number(row.on_hand || 0) > 0)
        .map((row) => ({
          value: String(row.batch_id),
          label: `${row.batch_no || '無批號'}（庫位 ${row.location_code || '—'}，可用 ${fmtQty(row.on_hand)}）`,
        })),
    [stock, productId],
  )

  const handleSubmit = async (event) => {
    if (event) event.preventDefault()
    if (!productId) {
      toast.error('請選擇商品')
      return
    }
    if (!fromLocationId || !toLocationId) {
      toast.error('請選擇來源庫位與目標庫位')
      return
    }
    if (fromLocationId === toLocationId) {
      toast.error('來源庫位與目標庫位不可相同')
      return
    }
    if (qty === '' || Number(qty) <= 0) {
      toast.error('移位數量必須大於 0')
      return
    }

    const payload = {
      product_id: Number(productId),
      batch_id: batchId === '' ? undefined : Number(batchId),
      from_location_id: Number(fromLocationId),
      to_location_id: Number(toLocationId),
      qty: Number(qty),
    }

    setSubmitting(true)
    try {
      const result = await api.post('/stock/moves', payload)
      toast.success(`移位完成（流水序號 ${result.seq !== undefined ? result.seq : '—'}）`)
      setQty('')
      load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <PageHeader title="移位作業" desc="於同一倉庫內將庫存由來源庫位移至目標庫位" />

      <Card title="新增移位">
        <div className="form-grid">
          <Field label="商品" required>
            <Select
              options={productOptions}
              value={productId}
              placeholder="請選擇商品"
              onChange={(e) => {
                setProductId(e.target.value)
                setBatchId('')
                setFromLocationId('')
              }}
            />
          </Field>
          <Field label="批號" hint="未啟用批次管理時可不選">
            <Select
              options={batchesOf}
              value={batchId}
              placeholder="無批號"
              onChange={(e) => setBatchId(e.target.value)}
            />
          </Field>
          <Field label="來源庫位" required>
            <Select
              options={locationOptions}
              value={fromLocationId}
              placeholder="請選擇庫位"
              onChange={(e) => setFromLocationId(e.target.value)}
            />
          </Field>
          <Field label="目標庫位" required>
            <Select
              options={locationOptions}
              value={toLocationId}
              placeholder="請選擇庫位"
              onChange={(e) => setToLocationId(e.target.value)}
            />
          </Field>
          <Field label="數量" required>
            <Input type="number" step="0.001" min="0" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
        </div>
        <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
          <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? '處理中…' : '執行移位'}
          </Button>
        </div>
      </Card>

      <Card
        title="結存明細（最近異動）"
        extra={
          <div className="toolbar">
            <Field label="異動類型代碼">
              <Input
                value={movementType}
                placeholder="例如 MOVE"
                onChange={(e) => setMovementType(e.target.value)}
              />
            </Field>
          </div>
        }
      >
        <Table
          loading={loading}
          error={error}
          rows={ledger}
          empty="沒有符合條件的結存明細"
          columns={[
            { key: 'seq', title: '序號', className: 'num', render: (row) => dash(row.seq) },
            { key: 'occurred_at', title: '時間', render: (row) => fmtDateTime(row.occurred_at) },
            { key: 'product_code', title: '商品編號', render: (row) => dash(row.product_code) },
            { key: 'name', title: '商品名稱', render: (row) => dash(row.name) },
            { key: 'batch_no', title: '批號', render: (row) => dash(row.batch_no) },
            { key: 'location_code', title: '庫位', render: (row) => dash(row.location_code) },
            { key: 'movement_type', title: '異動類型', render: (row) => <MovementBadge code={row.movement_type} /> },
            {
              key: 'qty_delta',
              title: '數量變動',
              className: 'num',
              render: (row) => {
                const value = Number(row.qty_delta || 0)
                return <span style={{ color: value < 0 ? '#a32121' : '#15803d' }}>{fmtQty(value)}</span>
              },
            },
            { key: 'source_doc_no', title: '來源單號', render: (row) => dash(row.source_doc_no) },
            { key: 'operator', title: '操作人', render: (row) => dash(row.operator) },
          ]}
        />
        <div className="pager">
          <span>共 {ledgerTotal} 筆</span>
        </div>
      </Card>
    </div>
  )
}
