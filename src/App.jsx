import { useState, useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabaseClient'
import ListagemPage from './pages/ListagemPage'
import DetalhesPage from './pages/DetalhesPage'
import LoginPage from './pages/LoginPage'
import LoadingSpinner from './components/LoadingSpinner'

// Lazy-load heavy pages (Recharts + Leaflet)
const AnalyticsPage  = lazy(() => import('./pages/AnalyticsPage'))
const ComparadorPage = lazy(() => import('./pages/ComparadorPage'))
const MapaPage       = lazy(() => import('./pages/MapaPage'))
const CustosPage     = lazy(() => import('./pages/CustosPage'))

function PageLoader() {
  return (
    <div className="min-h-screen bg-[#00101f] flex items-center justify-center">
      <LoadingSpinner text="Carregando..." />
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = loading

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return (
      <div className="min-h-screen bg-[#00101f] flex items-center justify-center">
        <LoadingSpinner text="Verificando acesso..." />
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route
          path="/login"
          element={session ? <Navigate to="/" replace /> : <LoginPage />}
        />
        <Route
          path="/"
          element={session ? <ListagemPage session={session} /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/lideranca/:id"
          element={session ? <DetalhesPage session={session} /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/analytics"
          element={session ? <AnalyticsPage session={session} /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/mapa"
          element={session ? <MapaPage session={session} /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/comparar"
          element={session ? <ComparadorPage session={session} /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/custos"
          element={session ? <CustosPage session={session} /> : <Navigate to="/login" replace />}
        />
      </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
