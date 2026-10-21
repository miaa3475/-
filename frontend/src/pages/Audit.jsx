import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { api, qs } from '../api'
import {
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
  Table,
  dash,
  fmtDateTime,
} from '../components/ui'

export default function Audit() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [actorId, setActorId] = useState('')
  const [objectType, setObjectType] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.get('/audit' + qs({ actor_id: actorId, object_type: objectType, from, to, page }))
      setItems(data && Array.isArray(data.items) ? data.items : [])
      setTotal(data && data.total ? data.total : 0)
    } catch (err) {
      setError(err.message)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [actorId, objectType, from, to, page])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    api
      .get('/users')
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch(() => setUsers([]))
  }, [])

  const actorOptions = useMemo(
    () => users.map((u) => ({ value: String(u.id), label: `${u.display_name || u.username}` })),
    [users],
  )

  const totalPages = Math.max(1, Math.ceil(total / 50))

  return (
    <div>
      <PageHeader title="稽核軌跡" desc="查詢所有欄位異動與單據操作紀錄" />

      <Card
        title="查詢條件"
        extra={
          <div className="toolbar">
            <Field label="操作人">
              <Select
                options={actorOptions}
                value={actorId}
                placeholder="全部操作人"
                onChange={(e) => {
                  setActorId(e.target.value)
                  setPage(1)
                }}
              />
            </Field>
            <Field label="物件類型">
              <Input
                value={objectType}
                placeholder="例如 PRODUCT / RECEIPT"
                onChange={(e) => {
                  setObjectType(e.target.value)
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
            <Button
              variant="ghost"
              onClick={() => {
                setActorId('')
                setObjectType('')
                setFrom('')
                setTo('')
                setPage(1)
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
          rows={items}
          empty="沒有符合條件的稽核紀錄"
          columns={[
            { key: 'seq', title: '序號', className: 'num', render: (row) => dash(row.seq) },
            { key: 'occurred_at', title: '時間', render: (row) => fmtDateTime(row.occurred_at) },
            { key: 'actor', title: '操作人', render: (row) => dash(row.actor) },
            { key: 'action', title: '動作', render: (row) => dash(row.action) },
            { key: 'object_type', title: '物件類型', render: (row) => dash(row.object_type) },
            { key: 'object_id', title: '物件 ID', render: (row) => dash(row.object_id) },
            { key: 'field_name', title: '欄位', render: (row) => dash(row.field_name) },
            { key: 'old_value', title: '舊值', render: (row) => dash(row.old_value) },
            { key: 'new_value', title: '新值', render: (row) => dash(row.new_value) },
            { key: 'doc_type', title: '單據類型', render: (row) => dash(row.doc_type) },
            { key: 'doc_no', title: '單據編號', render: (row) => dash(row.doc_no) },
          ]}
        />
        <div className="pager">
          <span>
            共 {total} 筆，第 {page} / {totalPages} 頁
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
