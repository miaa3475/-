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
} from '../components/ui'

export default function StockQuery() {
  const [stock, setStock] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [keyword, setKeyword] = useState('')
  const [q, setQ] = useState('')
  const [barcode, setBarcode] = useState('')
  const [locationId, setLocationId] = useState('')

  const [ledger, setLedger] = useState([])
  const [ledgerTotal, setLedgerTotal] = useState(0)
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [ledgerError, setLedgerError] = useState('')
  const [page, setPage] = useState(1)
  const [productId, setProductId] = useState('')
  const [batchId, setBatchId] = useState('')
  const [movementType, setMovementType] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const loadStock = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.get('/stock' + qs({ q, barcode, location_id: locationId }))
      setStock(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [q, barcode, locationId])

  useEffect(() => {
    loadStock()
  }, [loadStock])

  useEffect(() => {
    api
      .get('/locations')
      .then((data) => setLocations(Array.isArray(data) ? data : []))
      .catch(() => setLocations([]))
  }, [])

  const loadLedger = useCallback(async () => {
    setLedgerLoading(true)
    setLedgerError('')
    try {
      const data = await api.get(
        '/stock/ledger' + qs({
          product_id: productId,
          batch_id: batchId,
          movement_type: movementType,
          from,
          to,
          page,
        }),
      )
      setLedger(data && Array.isArray(data.items) ? data.items : [])
      setLedgerTotal(data && data.total ? data.total : 0)
    } catch (err) {
      setLedgerError(err.message)
      setLedger([])
    } finally {
      setLedgerLoading(false)
    }
  }, [productId, batchId, movementType, from, to, page])

  useEffect(() => {
    loadLedger()
  }, [loadLedger])

  const locationOptions = useMemo(
    () =>
      locations.map((loc) => ({
        value: String(loc.id),
        label: `${loc.code || ''} ${loc.name || ''}`.trim(),
      })),
    [locations],
  )

  const totalPages = Math.max(1, Math.ceil(ledgerTotal / 50))

  return (
    <div>
      <PageHeader title="庫存查詢" desc="查詢各商品於各庫位之現存數量與結存明細" />

      <Card
        title="現存庫存"
        extra={
          <div className="toolbar">
            <Field label="關鍵字">
              <Input
                value={keyword}
                placeholder="商品名稱／編號"
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setQ(keyword)
                }}
              />
            </Field>
            <Field label="條碼">
              <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} />
            </Field>
            <Field label="庫位">
              <Select
                options={locationOptions}
                value={locationId}
                placeholder="全部庫位"
                onChange={(e) => setLocationId(e.target.value)}
              />
            </Field>
            <Button variant="primary" onClick={() => setQ(keyword)}>
              查詢
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setKeyword('')
                setQ('')
                setBarcode('')
                setLocationId('')
              }}
            >
              重設
            </Button>
          </div>
        }
      >
        <Table
          loading={loading}
          error={error}
          rows={stock}
          empty="沒有符合條件的庫存資料"
          columns={[
            { key: 'product_code', title: '商品編號', render: (row) => dash(row.product_code) },
            { key: 'name', title: '商品名稱', render: (row) => dash(row.name) },
            { key: 'barcode', title: '條碼', render: (row) => dash(row.barcode) },
            { key: 'batch_no', title: '批號', render: (row) => dash(row.batch_no) },
            { key: 'location_code', title: '庫位', render: (row) => dash(row.location_code) },
            { key: 'on_hand', title: '現存量', className: 'num', render: (row) => fmtQty(row.on_hand) },
            {
              key: 'is_batch_tracked',
              title: '批次管理',
              render: (row) => (row.is_batch_tracked ? '是' : '否'),
            },
            {
              key: 'ops',
              title: '操作',
              render: (row) => (
                <Button
                  variant="ghost"
                  className="btn-sm"
                  onClick={() => {
                    setProductId(String(row.product_id))
                    setBatchId(row.batch_id ? String(row.batch_id) : '')
                    setPage(1)
                  }}
                >
                  查看結存明細
                </Button>
              ),
            },
          ]}
        />
      </Card>

      <Card
        title="結存明細"
        extra={
          <div className="toolbar">
            <Field label="商品 ID">
              <Input
                value={productId}
                placeholder="商品編號"
                onChange={(e) => {
                  setProductId(e.target.value)
                  setPage(1)
                }}
              />
            </Field>
            <Field label="批號 ID">
              <Input
                value={batchId}
                placeholder="批次 ID"
                onChange={(e) => {
                  setBatchId(e.target.value)
                  setPage(1)
                }}
              />
            </Field>
            <Field label="異動類型">
              <Input
                value={movementType}
                placeholder="例如 RECEIPT"
                onChange={(e) => {
                  setMovementType(e.target.value)
                  setPage(1)
                }}
              />
            </Field>
            <Field label="起始日期">
              <Input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value)
                  setPage(1)
                }}
              />
            </Field>
            <Field label="結束日期">
              <Input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value)
                  setPage(1)
                }}
              />
            </Field>
          </div>
        }
      >
        <Table
          loading={ledgerLoading}
          error={ledgerError}
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
            { key: 'source_doc_type', title: '來源類型', render: (row) => dash(row.source_doc_type) },
            { key: 'source_doc_no', title: '來源單號', render: (row) => dash(row.source_doc_no) },
            { key: 'purpose', title: '用途', render: (row) => dash(row.purpose) },
            { key: 'operator', title: '操作人', render: (row) => dash(row.operator) },
            { key: 'override_by', title: '覆核人', render: (row) => dash(row.override_by) },
            { key: 'override_reason', title: '覆核原因', render: (row) => dash(row.override_reason) },
          ]}
        />
        <div className="pager">
          <span>
            共 {ledgerTotal} 筆，第 {page} / {totalPages} 頁
          </span>
          <Button variant="default" className="btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            上一頁
          </Button>
          <Button
            variant="default"
            className="btn-sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            下一頁
          </Button>
        </div>
      </Card>
    </div>
  )
}
