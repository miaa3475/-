import React from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import { ToastProvider } from './components/ui'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Products from './pages/Products'
import Categories from './pages/Categories'
import Suppliers from './pages/Suppliers'
import Locations from './pages/Locations'
import Receipts from './pages/Receipts'
import Issues from './pages/Issues'
import Moves from './pages/Moves'
import StockQuery from './pages/StockQuery'
import Stocktakes from './pages/Stocktakes'
import Adjustments from './pages/Adjustments'
import Purchases from './pages/Purchases'
import Sales from './pages/Sales'
import Audit from './pages/Audit'
import Users from './pages/Users'

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="app-loading">載入中…</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

function GuestOnly({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="app-loading">載入中…</div>
  if (user) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
            <Route
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/products" element={<Products />} />
              <Route path="/categories" element={<Categories />} />
              <Route path="/suppliers" element={<Suppliers />} />
              <Route path="/locations" element={<Locations />} />
              <Route path="/receipts" element={<Receipts />} />
              <Route path="/issues" element={<Issues />} />
              <Route path="/moves" element={<Moves />} />
              <Route path="/stock" element={<StockQuery />} />
              <Route path="/stocktakes" element={<Stocktakes />} />
              <Route path="/adjustments" element={<Adjustments />} />
              <Route path="/purchases" element={<Purchases />} />
              <Route path="/sales" element={<Sales />} />
              <Route path="/audit" element={<Audit />} />
              <Route path="/users" element={<Users />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
