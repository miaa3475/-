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
  useToast,
} from '../components/ui'

const EMPTY_FORM = { warehouse_id: '', parent_id: '', code: '', name: '', is_aggregate: false }

export default function Locations() {
  const { role } = useAuth()
  const toast = useToast()
  const canEdit = hasRole(role, 'ADMIN', 'WAREHOUSE')

  const [warehouses, setWarehouses] = useState([])
  const [locations, setLocations] = useState([])
  const [tree, setTree] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [warehouseId, setWarehouseId] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [warehouseData, locationData, treeData] = await Promise.all([
        api.get('/warehouses'),
        api.get('/locations' + qs({ warehouse_id: warehouseId })),
        api.get('/locations/tree'),
      ])
      setWarehouses(Array.isArray(warehouseData) ? warehouseData : [])
      setLocations(Array.isArray(locationData) ? locationData : [])
      setTree(Array.isArray(treeData) ? treeData : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [warehouseId])

  useEffect(() => {
    load()
  }, [load])

  const warehouseOptions = useMemo(
    () => warehouses.map((w) => ({ value: String(w.id), label: `${w.code || ''} ${w.name || ''}`.trim() })),
    [warehouses],
  )

  const locationOptions = useMemo(
    () =>
      locations.map((loc) => ({
        value: String(loc.id),
        label: `${loc.code || ''} ${loc.name || ''}`.trim(),
      })),
    [locations],
  )

  const openCreate = () => {
    setEditing(null)
    setForm({
      ...EMPTY_FORM,
      warehouse_id: warehouseId || (warehouses.length ? String(warehouses[0].id) : ''),
    })
    setFormError('')
    setModalOpen(true)
  }

  const openEdit = (location) => {
    setEditing(location)
    setForm({
      warehouse_id: location.warehouse_id ? String(location.warehouse_id) : '',
      parent_id: location.parent_id ? String(location.parent_id) : '',
      code: location.code || '',
      name: location.name || '',
      is_aggregate: !!location.is_aggregate,
    })
    setFormError('')
    setModalOpen(true)
  }

  const handleSubmit = async (event) => {
    if (event) event.preventDefault()
    setFormError('')
    if (editing) {
      const payload = { name: form.name.trim() }
      try {
        await api.put(`/locations/${editing.id}`, payload)
        toast.success(`庫位「${payload.name}」已更新`)
        setModalOpen(false)
        load()
      } catch (err) {
        setFormError(err.message)
      }
      return
    }

    if (!form.warehouse_id) {
      setFormError('請選擇倉庫')
      return
    }
    if (!form.code.trim()) {
      setFormError('請填寫庫位代碼')
      return
    }
    if (!form.name.trim()) {
      setFormError('請填寫庫位名稱')
      return
    }
    const payload = {
      warehouse_id: Number(form.warehouse_id),
      parent_id: form.parent_id === '' ? undefined : Number(form.parent_id),
      code: form.code.trim(),
      name: form.name.trim(),
      is_aggregate: !!form.is_aggregate,
    }
    try {
      await api.post('/locations', payload)
      toast.success(`庫位「${payload.code}」已新增`)
      setModalOpen(false)
      load()
    } catch (err) {
      setFormError(err.message)
    }
  }

  const toggleFreeze = async (location) => {
    const next = !location.is_frozen
    try {
      await api.put(`/locations/${location.id}`, { is_frozen: next })
      toast.success(next ? `庫位「${location.code}」已凍結` : `庫位「${location.code}」已解除凍結`)
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const setFormValue = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const renderTree = (nodes, depth = 0) => {
    if (!nodes || nodes.length === 0) return null
    return (
      <ul className="tree-list" style={{ paddingLeft: depth === 0 ? 0 : 18 }}>
        {nodes.map((node) => (
          <li key={node.id}>
            <span className="tree-node">
              <span className="tree-code">{dash(node.code)}</span>
              <span className="tree-name">{dash(node.name)}</span>
            </span>
            {node.children && node.children.length > 0 ? renderTree(node.children, depth + 1) : null}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div>
      <PageHeader
        title="倉庫與庫位"
        desc="維護倉庫、庫位階層與凍結狀態"
        actions={
          canEdit ? (
            <Button variant="primary" onClick={openCreate}>
              新增庫位
            </Button>
          ) : null
        }
      />

      {!canEdit ? (
        <div className="hint-box" style={{ marginBottom: 14 }}>
          目前角色為唯讀檢視，庫位資料僅供查詢。
        </div>
      ) : null}

      <div className="grid-2">
        <Card title="庫位清單" extra={
          <div className="toolbar">
            <Field label="倉庫">
              <Select
                options={warehouseOptions}
                value={warehouseId}
                placeholder="全部倉庫"
                onChange={(e) => setWarehouseId(e.target.value)}
              />
            </Field>
          </div>
        }>
          <Table
            loading={loading}
            error={error}
            rows={locations}
            empty="此倉庫尚未建立庫位"
            columns={[
              { key: 'code', title: '代碼', render: (row) => dash(row.code) },
              { key: 'name', title: '名稱', render: (row) => dash(row.name) },
              {
                key: 'parent_id',
                title: '上層庫位',
                render: (row) => {
                  if (!row.parent_id) return '—'
                  const parent = locations.find((loc) => loc.id === row.parent_id)
                  return dash(parent ? parent.code : row.parent_id)
                },
              },
              {
                key: 'is_aggregate',
                title: '類型',
                render: (row) => (row.is_aggregate ? '彙總庫位' : '儲位'),
              },
              {
                key: 'is_frozen',
                title: '凍結',
                render: (row) => (row.is_frozen ? <Badge status="FROZEN" label="凍結" tone="danger" /> : '否'),
              },
              { key: 'status', title: '狀態', render: (row) => <Badge status={row.status} /> },
              ...(canEdit
                ? [
                    {
                      key: 'actions',
                      title: '操作',
                      render: (row) => (
                        <div className="row-actions">
                          <Button variant="default" className="btn-sm" onClick={() => openEdit(row)}>
                            編輯
                          </Button>
                          <Button
                            variant={row.is_frozen ? 'ok' : 'danger'}
                            className="btn-sm"
                            onClick={() => toggleFreeze(row)}
                          >
                            {row.is_frozen ? '解除凍結' : '凍結'}
                          </Button>
                        </div>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </Card>

        <Card title="庫位樹" extra={<span className="muted">GET /api/locations/tree</span>}>
          {loading ? (
            <div className="state-box">載入中…</div>
          ) : error ? (
            <div className="state-box state-error">讀取失敗：{error}</div>
          ) : tree.length === 0 ? (
            <div className="state-box state-empty">目前沒有庫位資料</div>
          ) : (
            renderTree(tree)
          )}
        </Card>
      </div>

      <Modal
        open={modalOpen}
        title={editing ? `編輯庫位：${editing.code}` : '新增庫位'}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <Button variant="default" onClick={() => setModalOpen(false)}>
              取消
            </Button>
            <Button variant="primary" onClick={handleSubmit}>
              儲存
            </Button>
          </>
        }
      >
        {formError ? <div className="login-error">{formError}</div> : null}
        {editing ? (
          <Field label="庫位名稱" required>
            <Input value={form.name} onChange={(e) => setFormValue('name', e.target.value)} />
          </Field>
        ) : (
          <div className="form-grid">
            <Field label="倉庫" required>
              <Select
                options={warehouseOptions}
                value={form.warehouse_id}
                placeholder="請選擇倉庫"
                onChange={(e) => setFormValue('warehouse_id', e.target.value)}
              />
            </Field>
            <Field label="上層庫位">
              <Select
                options={locationOptions}
                value={form.parent_id}
                placeholder="無（上層）"
                onChange={(e) => setFormValue('parent_id', e.target.value)}
              />
            </Field>
            <Field label="庫位代碼" required>
              <Input value={form.code} onChange={(e) => setFormValue('code', e.target.value)} />
            </Field>
            <Field label="庫位名稱" required>
              <Input value={form.name} onChange={(e) => setFormValue('name', e.target.value)} />
            </Field>
            <Field label="庫位類型">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={form.is_aggregate}
                  onChange={(e) => setFormValue('is_aggregate', e.target.checked)}
                />
                <span>彙總庫位（不可存放實物）</span>
              </label>
            </Field>
          </div>
        )}
      </Modal>
    </div>
  )
}
