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
  fmtMoney,
  fmtQty,
  useToast,
} from '../components/ui'

const EMPTY_SUPPLIER = { tax_id: '', company_name: '', contact_name: '', phone: '' }
const EMPTY_QUOTE = {
  product_id: '',
  supplier_id: '',
  unit_price: '',
  moq: '',
  lead_time_days: '',
  valid_until: '',
}

export default function Suppliers() {
  const { role } = useAuth()
  const toast = useToast()
  const canEdit = hasRole(role, 'ADMIN', 'PURCHASE')

  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [q, setQ] = useState('')

  const [supplierOpen, setSupplierOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState(null)
  const [supplierForm, setSupplierForm] = useState(EMPTY_SUPPLIER)
  const [supplierError, setSupplierError] = useState('')

  const [quoteProductId, setQuoteProductId] = useState('')
  const [quotes, setQuotes] = useState([])
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteListError, setQuoteListError] = useState('')
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [quoteForm, setQuoteForm] = useState(EMPTY_QUOTE)
  const [quoteError, setQuoteError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.get('/suppliers' + qs({ q }))
      setSuppliers(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [q])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    api
      .get('/products')
      .then((data) => setProducts(Array.isArray(data) ? data : []))
      .catch(() => setProducts([]))
  }, [])

  const loadQuotes = useCallback(async () => {
    if (!quoteProductId) {
      setQuotes([])
      return
    }
    setQuoteLoading(true)
    setQuoteListError('')
    try {
      const data = await api.get('/quotes' + qs({ product_id: quoteProductId }))
      setQuotes(Array.isArray(data) ? data : [])
    } catch (err) {
      setQuoteListError(err.message)
      setQuotes([])
    } finally {
      setQuoteLoading(false)
    }
  }, [quoteProductId])

  useEffect(() => {
    loadQuotes()
  }, [loadQuotes])

  const productOptions = useMemo(
    () =>
      products.map((p) => ({
        value: String(p.id),
        label: `${p.product_code || ''} ${p.name || ''}`.trim(),
      })),
    [products],
  )

  const supplierOptions = useMemo(
    () => suppliers.map((s) => ({ value: String(s.id), label: s.company_name })),
    [suppliers],
  )

  const openCreateSupplier = () => {
    setEditingSupplier(null)
    setSupplierForm(EMPTY_SUPPLIER)
    setSupplierError('')
    setSupplierOpen(true)
  }

  const openEditSupplier = (supplier) => {
    setEditingSupplier(supplier)
    setSupplierForm({
      tax_id: supplier.tax_id || '',
      company_name: supplier.company_name || '',
      contact_name: supplier.contact_name || '',
      phone: supplier.phone || '',
    })
    setSupplierError('')
    setSupplierOpen(true)
  }

  const handleSupplierSubmit = async (event) => {
    if (event) event.preventDefault()
    setSupplierError('')
    if (!supplierForm.tax_id.trim()) {
      setSupplierError('請填寫統一編號')
      return
    }
    if (!supplierForm.company_name.trim()) {
      setSupplierError('請填寫公司名稱')
      return
    }
    const payload = {
      tax_id: supplierForm.tax_id.trim(),
      company_name: supplierForm.company_name.trim(),
      contact_name: supplierForm.contact_name.trim() || undefined,
      phone: supplierForm.phone.trim() || undefined,
    }
    try {
      if (editingSupplier) {
        await api.put(`/suppliers/${editingSupplier.id}`, payload)
        toast.success(`供應商「${payload.company_name}」已更新`)
      } else {
        await api.post('/suppliers', payload)
        toast.success(`供應商「${payload.company_name}」已新增`)
      }
      setSupplierOpen(false)
      load()
    } catch (err) {
      setSupplierError(err.message)
    }
  }

  const openCreateQuote = () => {
    setQuoteForm({ ...EMPTY_QUOTE, product_id: quoteProductId })
    setQuoteError('')
    setQuoteOpen(true)
  }

  const handleQuoteSubmit = async (event) => {
    if (event) event.preventDefault()
    setQuoteError('')
    if (!quoteForm.product_id) {
      setQuoteError('請選擇商品')
      return
    }
    if (!quoteForm.supplier_id) {
      setQuoteError('請選擇供應商')
      return
    }
    if (quoteForm.unit_price === '') {
      setQuoteError('請填寫單價')
      return
    }
    const payload = {
      product_id: Number(quoteForm.product_id),
      supplier_id: Number(quoteForm.supplier_id),
      unit_price: Number(quoteForm.unit_price),
      moq: quoteForm.moq === '' ? undefined : Number(quoteForm.moq),
      lead_time_days: quoteForm.lead_time_days === '' ? undefined : Number(quoteForm.lead_time_days),
      valid_until: quoteForm.valid_until === '' ? undefined : quoteForm.valid_until,
    }
    try {
      await api.post('/quotes', payload)
      toast.success('商品報價已新增')
      setQuoteOpen(false)
      loadQuotes()
    } catch (err) {
      setQuoteError(err.message)
    }
  }

  const setSupplierValue = (key, value) => setSupplierForm((prev) => ({ ...prev, [key]: value }))
  const setQuoteValue = (key, value) => setQuoteForm((prev) => ({ ...prev, [key]: value }))

  return (
    <div>
      <PageHeader
        title="供應商與商品報價"
        desc="維護供應商基本資料，以及各商品之供應商報價"
        actions={
          canEdit ? (
            <Button variant="primary" onClick={openCreateSupplier}>
              新增供應商
            </Button>
          ) : null
        }
      />

      {!canEdit ? (
        <div className="hint-box" style={{ marginBottom: 14 }}>
          目前角色為唯讀檢視，供應商資料僅供查詢。
        </div>
      ) : null}

      <Card
        title="供應商清單"
        extra={
          <div className="toolbar">
            <Field label="關鍵字">
              <Input
                value={keyword}
                placeholder="公司名稱／統編"
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setQ(keyword)
                }}
              />
            </Field>
            <Button variant="primary" onClick={() => setQ(keyword)}>
              查詢
            </Button>
          </div>
        }
      >
        <Table
          loading={loading}
          error={error}
          rows={suppliers}
          empty="沒有符合條件的供應商"
          columns={[
            { key: 'tax_id', title: '統一編號', render: (row) => dash(row.tax_id) },
            { key: 'company_name', title: '公司名稱', render: (row) => dash(row.company_name) },
            { key: 'contact_name', title: '聯絡人', render: (row) => dash(row.contact_name) },
            { key: 'phone', title: '電話', render: (row) => dash(row.phone) },
            { key: 'status', title: '狀態', render: (row) => <Badge status={row.status} /> },
            ...(canEdit
              ? [
                  {
                    key: 'actions',
                    title: '操作',
                    render: (row) => (
                      <Button variant="default" className="btn-sm" onClick={() => openEditSupplier(row)}>
                        編輯
                      </Button>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Card>

      <Card
        title="商品報價"
        extra={
          <div className="toolbar">
            <Field label="商品">
              <Select
                options={productOptions}
                value={quoteProductId}
                placeholder="請選擇商品"
                onChange={(e) => setQuoteProductId(e.target.value)}
              />
            </Field>
            {canEdit ? (
              <Button variant="primary" onClick={openCreateQuote} disabled={!quoteProductId}>
                新增報價
              </Button>
            ) : null}
          </div>
        }
      >
        <Table
          loading={quoteLoading}
          error={quoteListError}
          rows={quotes}
          empty={quoteProductId ? '此商品尚未建立報價' : '請先選擇商品'}
          columns={[
            { key: 'supplier_name', title: '供應商', render: (row) => dash(row.supplier_name) },
            { key: 'unit_price', title: '單價', className: 'num', render: (row) => fmtMoney(row.unit_price) },
            { key: 'moq', title: '最小訂量', className: 'num', render: (row) => fmtQty(row.moq) },
            {
              key: 'lead_time_days',
              title: '交期（天）',
              className: 'num',
              render: (row) => (row.lead_time_days === undefined ? '—' : String(row.lead_time_days)),
            },
            { key: 'valid_until', title: '有效期限', render: (row) => dash(row.valid_until) },
          ]}
        />
      </Card>

      <Modal
        open={supplierOpen}
        title={editingSupplier ? `編輯供應商：${editingSupplier.company_name}` : '新增供應商'}
        onClose={() => setSupplierOpen(false)}
        footer={
          <>
            <Button variant="default" onClick={() => setSupplierOpen(false)}>
              取消
            </Button>
            <Button variant="primary" onClick={handleSupplierSubmit}>
              儲存
            </Button>
          </>
        }
      >
        {supplierError ? <div className="login-error">{supplierError}</div> : null}
        <div className="form-grid">
          <Field label="統一編號" required>
            <Input value={supplierForm.tax_id} onChange={(e) => setSupplierValue('tax_id', e.target.value)} />
          </Field>
          <Field label="公司名稱" required>
            <Input
              value={supplierForm.company_name}
              onChange={(e) => setSupplierValue('company_name', e.target.value)}
            />
          </Field>
          <Field label="聯絡人">
            <Input
              value={supplierForm.contact_name}
              onChange={(e) => setSupplierValue('contact_name', e.target.value)}
            />
          </Field>
          <Field label="電話">
            <Input value={supplierForm.phone} onChange={(e) => setSupplierValue('phone', e.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={quoteOpen}
        title="新增商品報價"
        onClose={() => setQuoteOpen(false)}
        footer={
          <>
            <Button variant="default" onClick={() => setQuoteOpen(false)}>
              取消
            </Button>
            <Button variant="primary" onClick={handleQuoteSubmit}>
              儲存
            </Button>
          </>
        }
      >
        {quoteError ? <div className="login-error">{quoteError}</div> : null}
        <div className="form-grid">
          <Field label="商品" required>
            <Select
              options={productOptions}
              value={quoteForm.product_id}
              placeholder="請選擇商品"
              onChange={(e) => setQuoteValue('product_id', e.target.value)}
            />
          </Field>
          <Field label="供應商" required>
            <Select
              options={supplierOptions}
              value={quoteForm.supplier_id}
              placeholder="請選擇供應商"
              onChange={(e) => setQuoteValue('supplier_id', e.target.value)}
            />
          </Field>
          <Field label="單價" required>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={quoteForm.unit_price}
              onChange={(e) => setQuoteValue('unit_price', e.target.value)}
            />
          </Field>
          <Field label="最小訂量">
            <Input
              type="number"
              step="0.001"
              min="0"
              value={quoteForm.moq}
              onChange={(e) => setQuoteValue('moq', e.target.value)}
            />
          </Field>
          <Field label="交期（天）">
            <Input
              type="number"
              step="1"
              min="0"
              value={quoteForm.lead_time_days}
              onChange={(e) => setQuoteValue('lead_time_days', e.target.value)}
            />
          </Field>
          <Field label="有效期限">
            <Input
              type="date"
              value={quoteForm.valid_until}
              onChange={(e) => setQuoteValue('valid_until', e.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
