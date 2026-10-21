import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from './api'

const AuthContext = createContext(null)

export const ROLE_LABELS = {
  WAREHOUSE: '倉管',
  PURCHASE: '採購',
  ADMIN: '主管',
}

export function roleLabel(role) {
  return ROLE_LABELS[role] || role || '—'
}

/** 判斷目前角色是否在允許清單內 */
export function hasRole(role, ...allowed) {
  if (!role) return false
  return allowed.indexOf(role) >= 0
}

export function AuthProvider({ children }) {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // 啟動時以既有 token 還原登入狀態
  useEffect(() => {
    let cancelled = false
    if (!api.getToken()) {
      setLoading(false)
      return undefined
    }
    api
      .me()
      .then((data) => {
        if (!cancelled) setUser(data && data.user ? data.user : null)
      })
      .catch(() => {
        api.clearToken()
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // API 收到 401 時的處理
  useEffect(() => {
    const onUnauthorized = () => {
      setUser(null)
      navigate('/login', { replace: true })
    }
    window.addEventListener('ims:unauthorized', onUnauthorized)
    return () => window.removeEventListener('ims:unauthorized', onUnauthorized)
  }, [navigate])

  const login = useCallback(async (username, password) => {
    const data = await api.login(username, password)
    if (data && data.token) api.setToken(data.token)
    const nextUser = data && data.user ? data.user : null
    setUser(nextUser)
    return nextUser
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } catch (e) {
      /* 忽略登出失敗 */
    }
    api.clearToken()
    setUser(null)
    navigate('/login', { replace: true })
  }, [navigate])

  const value = useMemo(
    () => ({
      user,
      role: user ? user.role : null,
      loading,
      login,
      logout,
      setUser,
    }),
    [user, loading, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth 必須在 AuthProvider 內使用')
  return ctx
}

export default AuthContext
