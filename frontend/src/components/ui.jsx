import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'

/* ------------------------------------------------------------------ */
/* 格式化工具                                                            */
/* ------------------------------------------------------------------ */

export function dash(value) {
  return value === null || value === undefined || value === '' ? '—' : value
}

export function fmtMoney(value) {
  if (value === null || value === undefined || value === '') return '—'
  const num = Number(value)
  return Number.isFinite(num) ? num.toFixed(2) : String(value)
}

export function fmtQty(value) {
  if (value === null || value === undefined || value === '') return '—'
  const num = Number(value)
  return Number.isFinite(num) ? num.toFixed(3) : String(value)
}

export function fmtDateTime(value) {
  if (!value) return '—'
  return String(value).replace('T', ' ').slice(0, 19)
}

export function fmtDate(value) {
  if (!value) return '—'
  return String(value).slice(0, 10)
}

/* ------------------------------------------------------------------ */
/* 狀態 / 類型 對照表（依 api-contract.md 的狀態機）                      */
/* ------------------------------------------------------------------ */

export const STATUS_META = {
  DRAFT: { label: '草稿', tone: 'muted' },
  PENDING_APPROVAL: { label: '待核准', tone: 'warn' },
  APPROVED: { label: '已核准', tone: 'ok' },
  REJECTED: { label: '已駁回', tone: 'danger' },
  VOIDED: { label: '已作廢', tone: 'muted' },
  IN_PROGRESS: { label: '進行中', tone: 'info' },
  SUBMITTED: { label: '已提交', tone: 'info' },
  ABORTED: { label: '已中止', tone: 'danger' },
  ACTIVE: { label: '啟用', tone: 'ok' },
  DISABLED: { label: '停用', tone: 'muted' },
  FROZEN: { label: '凍結', tone: 'danger' },
}

export const MOVEMENT_META = {
  RECEIPT: { label: '進貨', tone: 'ok' },
  ISSUE: { label: '領用', tone: 'warn' },
  MOVE: { label: '移位', tone: 'info' },
  SALE: { label: '銷貨', tone: 'info' },
  ADJUST: { label: '調整', tone: 'warn' },
  STOCKTAKE: { label: '盤點', tone: 'muted' },
}

export function statusLabel(code) {
  const meta = STATUS_META[code]
  if (meta) return meta.label
  return code || '—'
}

export function movementLabel(code) {
  const meta = MOVEMENT_META[code]
  if (meta) return meta.label
  return code || '—'
}

/* ------------------------------------------------------------------ */
/* 基本表單元件                                                          */
/* ------------------------------------------------------------------ */

export function Field({ label, required, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {required ? <em className="field-required">＊</em> : null}
      </span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  )
}

export const Input = React.forwardRef(function Input(props, ref) {
  const { className = '', ...rest } = props
  return <input ref={ref} className={`input ${className}`.trim()} {...rest} />
})

export function Select({ options = [], placeholder, className = '', ...rest }) {
  return (
    <select className={`input ${className}`.trim()} {...rest}>
      {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
      {options.map((opt) => (
        <option key={String(opt.value)} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

export function Button({ variant = 'default', type = 'button', className = '', children, ...rest }) {
  return (
    <button type={type} className={`btn btn-${variant} ${className}`.trim()} {...rest}>
      {children}
    </button>
  )
}

export function Checkbox({ label, ...rest }) {
  return (
    <label className="checkbox">
      <input type="checkbox" {...rest} />
      <span>{label}</span>
    </label>
  )
}

/* ------------------------------------------------------------------ */
/* 表格 / 區塊 / 狀態提示                                                */
/* ------------------------------------------------------------------ */

export function Table({ columns, rows, loading, error, empty = '目前沒有資料', rowKey }) {
  if (loading) return <div className="state-box">載入中…</div>
  if (error) return <div className="state-box state-error">讀取失敗：{error}</div>
  if (!rows || rows.length === 0) return <div className="state-box state-empty">{empty}</div>

  const keyOf = rowKey || ((row, index) => row.id !== undefined ? row.id : index)

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={col.width ? { width: col.width } : undefined}>
                {col.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={keyOf(row, index)}>
              {columns.map((col) => (
                <td key={col.key} className={col.className || ''}>
                  {col.render ? col.render(row, index) : dash(row[col.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function PageHeader({ title, desc, actions }) {
  return (
    <div className="page-header">
      <div>
        <h2 className="page-title">{title}</h2>
        {desc ? <p className="page-desc">{desc}</p> : null}
      </div>
      <div className="page-actions">{actions}</div>
    </div>
  )
}

export function Card({ title, extra, children, className = '' }) {
  return (
    <section className={`card ${className}`.trim()}>
      {title ? (
        <div className="card-head">
          <h3 className="card-title">{title}</h3>
          {extra ? <div className="card-extra">{extra}</div> : null}
        </div>
      ) : null}
      <div className="card-body">{children}</div>
    </section>
  )
}

export function Loading({ text = '載入中…' }) {
  return <div className="state-box">{text}</div>
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null
  return (
    <div className="state-box state-error">
      <span>讀取失敗：{error}</span>
      {onRetry ? (
        <Button variant="ghost" onClick={onRetry}>
          重試
        </Button>
      ) : null}
    </div>
  )
}

export function StatCard({ label, value, unit, hint, tone = 'default' }) {
  return (
    <div className={`stat stat-${tone}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        {value}
        {unit ? <span className="stat-unit">{unit}</span> : null}
      </div>
      {hint ? <div className="stat-hint">{hint}</div> : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 徽章                                                                  */
/* ------------------------------------------------------------------ */

export function Badge({ status, label, tone }) {
  const meta = STATUS_META[status] || { label: status || '—', tone: 'muted' }
  return <span className={`badge badge-${tone || meta.tone}`}>{label || meta.label}</span>
}

export function MovementBadge({ code }) {
  const meta = MOVEMENT_META[code] || { label: code || '—', tone: 'muted' }
  return <span className={`badge badge-${meta.tone}`}>{meta.label}</span>
}

/* ------------------------------------------------------------------ */
/* Modal                                                                 */
/* ------------------------------------------------------------------ */

export function Modal({ open, title, onClose, children, footer, width = 680 }) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape' && onClose) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && onClose) onClose()
      }}
    >
      <div className="modal" style={{ maxWidth: width }} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="關閉">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Toast                                                                 */
/* ------------------------------------------------------------------ */

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const push = useCallback((message, type = 'success') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setToasts((prev) => [...prev, { id, message, type }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id))
    }, 3000)
  }, [])

  const value = {
    push,
    success: (message) => push(message, 'success'),
    error: (message) => push(message, 'error'),
    info: (message) => push(message, 'info'),
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast 必須在 ToastProvider 內使用')
  return ctx
}
