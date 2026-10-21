import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { Button, Field, Input } from '../components/ui'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    if (!username.trim() || !password) {
      setError('請輸入帳號與密碼')
      return
    }
    setSubmitting(true)
    try {
      await login(username.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || '登入失敗')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">庫存管理系統</h1>
        <p className="login-sub">請使用公司帳號登入後台</p>

        {error ? <div className="login-error">{error}</div> : null}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            <Field label="帳號" required>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="請輸入帳號"
                autoComplete="username"
                autoFocus
              />
            </Field>
            <Field label="密碼" required>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="請輸入密碼"
                autoComplete="current-password"
              />
            </Field>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? '登入中…' : '登入'}
            </Button>
          </div>
        </form>

        <div className="login-seed">
          種子帳號（密碼皆為 <code>demo1234</code>）：
          <br />
          <code>warehouse1</code> 倉管 ・ <code>purchase1</code> 採購 ・ <code>admin1</code> 主管
        </div>
      </div>
    </div>
  )
}
