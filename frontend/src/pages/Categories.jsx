import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import {
  Button,
  Card,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Table,
  dash,
  fmtQty,
  useToast,
} from '../components/ui'

const EMPTY_FORM = {
  code: '',
  name: '',
  parent_id: '',
  safety_stock: '',
  reorder_multiplier: '',
}

export default function Categories() {
  const toast = useToast()
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.get('/categories')
      setCategories(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const nameOf = useMemo(() => {
    const map = new Map()
    categories.forEach((c) => map.set(c.id, c.name))
    return map
  }, [categories])

  const parentOptions = useMemo(
    () => [{ value: '', label: '無（最上層）' }].concat(categories.map((c) => ({ value: String(c.id), label: c.name }))),
    [categories],
  )

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setModalOpen(true)
  }

  const openEdit = (category) => {
    setEditing(category)
    setForm({
      code: category.code || '',
      name: category.name || '',
      parent_id: category.parent_id ? String(category.parent_id) : '',
      safety_stock:
        category.safety_stock === undefined || category.safety_stock === null ? '' : String(category.safety_stock),
      reorder_multiplier:
        category.reorder_multiplier === undefined || category.reorder_multiplier === null
          ? ''
          : String(category.reorder_multiplier),
    })
    setFormError('')
    setModalOpen(true)
  }

  const handleSubmit = async (event) => {
    if (event) event.preventDefault()
    setFormError('')
    if (!form.code.trim()) {
      setFormError('請填寫類別代碼')
      return
    }
    if (!form.name.trim()) {
      setFormError('請填寫類別名稱')
      return
    }
    if (editing && String(editing.parent_id || '') === form.parent_id) {
      setFormError('上層類別不可為自身')
      return
    }

    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      parent_id: form.parent_id === '' ? undefined : Number(form.parent_id),
      safety_stock: form.safety_stock === '' ? undefined : Number(form.safety_stock),
      reorder_multiplier: form.reorder_multiplier === '' ? undefined : Number(form.reorder_multiplier),
    }

    setSaving(true)
    try {
      if (editing) {
        await api.put(`/categories/${editing.id}`, payload)
        toast.success(`類別「${payload.name}」已更新`)
      } else {
        await api.post('/categories', payload)
        toast.success(`類別「${payload.name}」已新增`)
      }
      setModalOpen(false)
      load()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const setFormValue = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  return (
    <div>
      <PageHeader
        title="商品類別"
        desc="維護類別階層，並設定安全水位與補貨倍數"
        actions={
          <Button variant="primary" onClick={openCreate}>
            新增類別
          </Button>
        }
      />

      <Card title="類別清單">
        <Table
          loading={loading}
          error={error}
          rows={categories}
          empty="尚未建立任何商品類別"
          columns={[
            { key: 'code', title: '類別代碼', render: (row) => dash(row.code) },
            { key: 'name', title: '類別名稱', render: (row) => dash(row.name) },
            {
              key: 'parent_id',
              title: '上層類別',
              render: (row) => (row.parent_id ? dash(nameOf.get(row.parent_id)) : '—'),
            },
            {
              key: 'safety_stock',
              title: '安全水位',
              className: 'num',
              render: (row) => fmtQty(row.safety_stock),
            },
            {
              key: 'reorder_multiplier',
              title: '補貨倍數',
              className: 'num',
              render: (row) => fmtQty(row.reorder_multiplier),
            },
            {
              key: 'actions',
              title: '操作',
              render: (row) => (
                <Button variant="default" className="btn-sm" onClick={() => openEdit(row)}>
                  編輯
                </Button>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={modalOpen}
        title={editing ? `編輯類別：${editing.name}` : '新增商品類別'}
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
        <div className="form-grid">
          <Field label="類別代碼" required>
            <Input value={form.code} onChange={(e) => setFormValue('code', e.target.value)} />
          </Field>
          <Field label="類別名稱" required>
            <Input value={form.name} onChange={(e) => setFormValue('name', e.target.value)} />
          </Field>
          <Field label="上層類別">
            <Select
              options={parentOptions}
              value={form.parent_id}
              onChange={(e) => setFormValue('parent_id', e.target.value)}
            />
          </Field>
          <Field label="安全水位" hint="低於此數量將列入低於水位清單">
            <Input
              type="number"
              step="0.001"
              min="0"
              value={form.safety_stock}
              onChange={(e) => setFormValue('safety_stock', e.target.value)}
            />
          </Field>
          <Field label="補貨倍數" hint="建議補貨量 = 缺口 × 補貨倍數">
            <Input
              type="number"
              step="0.001"
              min="0"
              value={form.reorder_multiplier}
              onChange={(e) => setFormValue('reorder_multiplier', e.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
