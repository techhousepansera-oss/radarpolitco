import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabaseClient'
import ListagemPage from './pages/ListagemPage'
import DetalhesPage from './pages/DetalhesPage'
import LoginPage from './pages/LoginPage'
import LoadingSpinner from './components/LoadingSpinner'

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
      </Routes>
    </BrowserRouter>
  )
}
