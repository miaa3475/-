import React from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth, roleLabel } from '../auth'
import { Badge, Button } from './ui'

const NAV = [
  { to: '/', label: '總覽', icon: '▤', end: true, roles: ['WAREHOUSE', 'PURCHASE', 'ADMIN'] },
  { to: '/products', label: '商品主檔', icon: '▦', roles: ['WAREHOUSE', 'PURCHASE', 'ADMIN'] },
  { to: '/categories', label: '商品類別', icon: '▥', roles: ['WAREHOUSE', 'PURCHASE', 'ADMIN'] },
  { to: '/suppliers', label: '供應商與報價', icon: '☰', roles: ['WAREHOUSE', 'PURCHASE', 'ADMIN'] },
  { to: '/locations', label: '倉庫與庫位', icon: '⌂', roles: ['WAREHOUSE', 'PURCHASE', 'ADMIN'] },
  { to: '/receipts', label: '進貨單', icon: '⇩', roles: ['WAREHOUSE', 'PURCHASE', 'ADMIN'] },
  { to: '/issues', label: '領用單', icon: '⇧', roles: ['WAREHOUSE', 'ADMIN'] },
  { to: '/moves', label: '移位作業', icon: '⇄', roles: ['WAREHOUSE', 'ADMIN'] },
  { to: '/stock', label: '庫存查詢', icon: '⌗', roles: ['WAREHOUSE', 'PURCHASE', 'ADMIN'] },
  { to: '/stocktakes', label: '盤點作業', icon: '☑', roles: ['WAREHOUSE', 'ADMIN'] },
  { to: '/adjustments', label: '庫存調整', icon: '⇅', roles: ['WAREHOUSE', 'ADMIN'] },
  { to: '/purchases', label: '採購作業', icon: '✎', roles: ['PURCHASE', 'ADMIN'] },
  { to: '/sales', label: '銷貨單', icon: '￥', roles: ['ADMIN'] },
  { to: '/audit', label: '稽核軌跡', icon: '⚑', roles: ['ADMIN'] },
  { to: '/users', label: '使用者與角色', icon: '☺', roles: ['ADMIN'] },
]

export default function Layout() {
  const { user, role, logout } = useAuth()
  const navigate = useNavigate()

  const items = NAV.filter((item) => !item.roles || item.roles.indexOf(role) >= 0)

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">庫</div>
          <div className="brand-text">
            <div className="brand-title">庫存管理系統</div>
            <div className="brand-sub">Inventory Management</div>
          </div>
        </div>
        <nav className="nav">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`.trim()}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <span className="topbar-title">庫存管理系統後台</span>
          </div>
          <div className="topbar-right">
            <div className="user-info">
              <span className="user-name">{user ? user.display_name || user.username : '—'}</span>
              <span className="user-username">{user ? user.username : ''}</span>
            </div>
            <Badge label={roleLabel(role)} tone="info" />
            <Button variant="ghost" onClick={handleLogout}>
              登出
            </Button>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
