import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { roleLabel } from '../auth'
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

const EMPTY_FORM = { username: '', password: '', display_name: '', role_id: '' }

export default function Users() {
  const toast = useToast()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.get('/users')
      setUsers(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  /**
   * 契約未提供角色清單端點（GET /api/roles），
   * 故由既有使用者的 role_id / role_code 推導可指派的角色。
   */
  const roleOptions = useMemo(() => {
    const map = new Map()
    users.forEach((user) => {
      if (user.role_id !== undefined && user.role_id !== null) {
        map.set(String(user.role_id), user.role_code)
      }
    })
    return Array.from(map.entries()).map(([value, code]) => ({
      value,
      label: `${roleLabel(code)}（${code || '—'}）`,
    }))
  }, [users])

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, role_id: roleOptions.length ? roleOptions[0].value : '' })
    setFormError('')
    setCreateOpen(true)
  }

  const handleCreate = async (event) => {
    if (event) event.preventDefault()
    setFormError('')
    if (!form.username.trim()) {
      setFormError('請填寫帳號')
      return
    }
    if (!form.password) {
      setFormError('請填寫密碼')
      return
    }
    if (!form.display_name.trim()) {
      setFormError('請填寫顯示名稱')
      return
    }
    if (!form.role_id) {
      setFormError('請選擇角色')
      return
    }

    const payload = {
      username: form.username.trim(),
      password: form.password,
      display_name: form.display_name.trim(),
      role_id: Number(form.role_id),
    }

    setSaving(true)
    try {
      await api.post('/users', payload)
      toast.success(`使用者「${payload.username}」已新增`)
      setCreateOpen(false)
      load()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleRoleChange = async (user, roleId) => {
    if (!roleId) return
    try {
      await api.put(`/users/${user.id}/role`, { role_id: Number(roleId) })
      toast.success(`使用者「${user.username}」的角色已更新`)
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const setFormValue = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  return (
    <div>
      <PageHeader
        title="使用者與角色"
        desc="維護系統帳號與角色指派"
        actions={
          <Button variant="primary" onClick={openCreate}>
            新增使用者
          </Button>
        }
      />

      <Card title="使用者清單">
        <Table
          loading={loading}
          error={error}
          rows={users}
          empty="尚未建立任何使用者"
          columns={[
            { key: 'id', title: 'ID', className: 'num', render: (row) => dash(row.id) },
            { key: 'username', title: '帳號', render: (row) => dash(row.username) },
            { key: 'display_name', title: '顯示名稱', render: (row) => dash(row.display_name) },
            {
              key: 'role_code',
              title: '角色',
              render: (row) => <Badge label={`${roleLabel(row.role_code)}（${dash(row.role_code)}）`} tone="info" />,
            },
            {
              key: 'role_select',
              title: '變更角色',
              render: (row) => (
                <Select
                  options={roleOptions}
                  value={row.role_id === undefined || row.role_id === null ? '' : String(row.role_id)}
                  placeholder="請選擇角色"
                  onChange={(e) => handleRoleChange(row, e.target.value)}
                />
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={createOpen}
        title="新增使用者"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button variant="default" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button variant="primary" onClick={handleCreate} disabled={saving}>
              {saving ? '建立中…' : '建立'}
            </Button>
          </>
        }
      >
        {formError ? <div className="login-error">{formError}</div> : null}
        {roleOptions.length === 0 ? (
          <div className="hint-box">
            契約未提供角色清單端點，無法取得可指派角色。請先由後端建立具角色的使用者後再行新增。
          </div>
        ) : null}
        <div className="form-grid">
          <Field label="帳號" required>
            <Input value={form.username} onChange={(e) => setFormValue('username', e.target.value)} />
          </Field>
          <Field label="密碼" required>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setFormValue('password', e.target.value)}
            />
          </Field>
          <Field label="顯示名稱" required>
            <Input value={form.display_name} onChange={(e) => setFormValue('display_name', e.target.value)} />
          </Field>
          <Field label="角色" required>
            <Select
              options={roleOptions}
              value={form.role_id}
              placeholder="請選擇角色"
              onChange={(e) => setFormValue('role_id', e.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
