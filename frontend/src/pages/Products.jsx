import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { api, qs } from '../api'
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

const UNIT_OPTIONS = [
  { value: '個', label: '個' },
  { value: '盒', label: '盒' },
  { value: '箱', label: '箱' },
  { value: '包', label: '包' },
  { value: '組', label: '組' },
  { value: '公斤', label: '公斤' },
  { value: '公升', label: '公升' },
  { value: '瓶', label: '瓶' },
  { value: '袋', label: '袋' },
]

const STATUS_OPTIONS = [
  { value: '', label: '全部狀態' },
  { value: 'ACTIVE', label: '啟用' },
  { value: 'DISABLED', label: '停用' },
]

const EMPTY_FORM = {
  name: '',
  barcode: '',
  category_id: '',
  unit: '個',
  pack_size: '',
  conversion_factor: '',
  purchase_price: '',
  is_batch_tracked: false,
}

export default function Products() {
  const toast = useToast()
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [keyword, setKeyword] = useState('')
  const [q, setQ] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [status, setStatus] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.get('/products' + qs({ q, category_id: categoryId, status }))
      setProducts(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [q, categoryId, status])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    api
      .get('/categories')
      .then((data) => setCategories(Array.isArray(data) ? data : []))
      .catch(() => setCategories([]))
  }, [])

  const categoryOptions = useMemo(
    () => [{ value: '', label: '全部類別' }].concat(categories.map((c) => ({ value: String(c.id), label: c.name }))),
    [categories],
  )

  const openCreate = () => {
    setEditing(null)
    setForm({ ...EMPTY_FORM, category_id: categories.length ? String(categories[0].id) : '' })
    setFormError('')
    setModalOpen(true)
  }

  const openEdit = (product) => {
    setEditing(product)
    setForm({
      name: product.name || '',
      barcode: product.barcode || '',
      category_id: product.category_id ? String(product.category_id) : '',
      unit: product.unit || '',
      pack_size: product.pack_size === undefined || product.pack_size === null ? '' : String(product.pack_size),
      conversion_factor:
        product.conversion_factor === undefined || product.conversion_factor === null
          ? ''
          : String(product.conversion_factor),
      // 價格由後端遮蔽時為 undefined，編輯時留空代表不變更
      purchase_price:
        product.purchase_price === undefined || product.purchase_price === null ? '' : String(product.purchase_price),
      is_batch_tracked: !!product.is_batch_tracked,
    })
    setFormError('')
    setModalOpen(true)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setFormError('')
    if (!form.name.trim()) {
      setFormError('請填寫商品名稱')
      return
    }
    if (!form.category_id) {
      setFormError('請選擇商品類別')
      return
    }
    if (!form.unit.trim()) {
      setFormError('請填寫單位')
      return
    }

    const payload = {
      name: form.name.trim(),
      barcode: form.barcode.trim() || undefined,
      category_id: Number(form.category_id),
      unit: form.unit.trim(),
      pack_size: form.pack_size === '' ? undefined : Number(form.pack_size),
      conversion_factor: form.conversion_factor === '' ? undefined : Number(form.conversion_factor),
      purchase_price: form.purchase_price === '' ? undefined : Number(form.purchase_price),
      is_batch_tracked: !!form.is_batch_tracked,
    }

    setSaving(true)
    try {
      if (editing) {
        await api.put(`/products/${editing.id}`, payload)
        toast.success(`商品「${payload.name}」已更新`)
      } else {
        await api.post('/products', payload)
        toast.success(`商品「${payload.name}」已新增`)
      }
      setModalOpen(false)
      load()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDisable = async (product) => {
    if (!window.confirm(`確定要停用商品「${product.name}」嗎？`)) return
    try {
      await api.post(`/products/${product.id}/disable`)
      toast.success(`商品「${product.name}」已停用`)
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const setFormValue = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  return (
    <div>
      <PageHeader
        title="商品主檔"
        desc="維護商品基本資料、單位、換算倍率與採購單價"
        actions={
          <Button variant="primary" onClick={openCreate}>
            新增商品
          </Button>
        }
      />

      <Card
        title="查詢條件"
        extra={
          <div className="toolbar">
            <Field label="關鍵字">
              <Input
                value={keyword}
                placeholder="商品名稱／編號／條碼"
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setQ(keyword)
                }}
              />
            </Field>
            <Field label="類別">
              <Select
                options={categoryOptions}
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              />
            </Field>
            <Field label="狀態">
              <Select options={STATUS_OPTIONS} value={status} onChange={(e) => setStatus(e.target.value)} />
            </Field>
            <Button variant="primary" onClick={() => setQ(keyword)}>
              查詢
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setKeyword('')
                setQ('')
                setCategoryId('')
                setStatus('')
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
          rows={products}
          empty="沒有符合條件的商品"
          columns={[
            { key: 'product_code', title: '商品編號', render: (row) => dash(row.product_code) },
            { key: 'name', title: '商品名稱', render: (row) => dash(row.name) },
            { key: 'barcode', title: '條碼', render: (row) => dash(row.barcode) },
            { key: 'category_name', title: '類別', render: (row) => dash(row.category_name) },
            { key: 'unit', title: '單位', render: (row) => dash(row.unit) },
            { key: 'pack_size', title: '包裝數量', className: 'num', render: (row) => fmtQty(row.pack_size) },
            {
              key: 'conversion_factor',
              title: '換算倍率',
              className: 'num',
              render: (row) => fmtQty(row.conversion_factor),
            },
            {
              key: 'purchase_price',
              title: '採購單價',
              className: 'num',
              render: (row) => fmtMoney(row.purchase_price),
            },
            {
              key: 'is_batch_tracked',
              title: '批次管理',
              render: (row) => (row.is_batch_tracked ? '是' : '否'),
            },
            { key: 'status', title: '狀態', render: (row) => <Badge status={row.status} /> },
            {
              key: 'actions',
              title: '操作',
              render: (row) => (
                <div className="row-actions">
                  <Button variant="default" className="btn-sm" onClick={() => openEdit(row)}>
                    編輯
                  </Button>
                  <Button variant="danger" className="btn-sm" onClick={() => handleDisable(row)}>
                    停用
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={modalOpen}
        title={editing ? `編輯商品：${editing.name}` : '新增商品'}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <Button variant="default" onClick={() => setModalOpen(false)}>
              取消
            </Button>
            <Button variant="primary" onClick={handleSubmit} disabled={saving}>
              {saving ? '儲存中…' : '儲存'}
            </Button>
          </>
        }
      >
        {formError ? <div className="login-error">{formError}</div> : null}
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <Field label="商品名稱" required>
              <Input value={form.name} onChange={(e) => setFormValue('name', e.target.value)} />
            </Field>
            <Field label="條碼" hint="可留空，進貨時以條碼掃描帶入商品">
              <Input value={form.barcode} onChange={(e) => setFormValue('barcode', e.target.value)} />
            </Field>
            <Field label="商品類別" required>
              <Select
                options={categoryOptions.slice(1)}
                value={form.category_id}
                onChange={(e) => setFormValue('category_id', e.target.value)}
                placeholder="請選擇類別"
              />
            </Field>
            <Field label="單位" required>
              <Input
                value={form.unit}
                list="unit-options"
                onChange={(e) => setFormValue('unit', e.target.value)}
              />
              <datalist id="unit-options">
                {UNIT_OPTIONS.map((u) => (
                  <option key={u.value} value={u.value} />
                ))}
              </datalist>
            </Field>
            <Field label="包裝數量">
              <Input
                type="number"
                step="0.001"
                min="0"
                value={form.pack_size}
                onChange={(e) => setFormValue('pack_size', e.target.value)}
              />
            </Field>
            <Field label="換算倍率">
              <Input
                type="number"
                step="0.001"
                min="0"
                value={form.conversion_factor}
                onChange={(e) => setFormValue('conversion_factor', e.target.value)}
              />
            </Field>
            <Field label="採購單價" hint="無權限查看價格時留空即不變更">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.purchase_price}
                onChange={(e) => setFormValue('purchase_price', e.target.value)}
              />
            </Field>
            <Field label="批次管理">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={form.is_batch_tracked}
                  onChange={(e) => setFormValue('is_batch_tracked', e.target.checked)}
                />
                <span>需管理批號與效期</span>
              </label>
            </Field>
          </div>
        </form>
      </Modal>
    </div>
  )
}
