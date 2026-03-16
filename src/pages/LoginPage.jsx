import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) setError(err.message)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#00101f] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-14 h-14 bg-[#e11d48] rounded-2xl flex items-center justify-center
            font-black text-white text-sm tracking-tight shadow-2xl shadow-[#e11d48]/40 mb-4">
            B360
          </div>
          <h1 className="text-2xl font-black text-white">BOW 360</h1>
          <p className="text-sm text-slate-500 mt-1">Radar Político · Pansera 2026</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="bg-[#001733] border border-[#002b5c] rounded-2xl p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              E-mail
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="w-full px-4 py-3 bg-[#002050] border border-[#002b5c] rounded-xl
                text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#e11d48]/50
                transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Senha
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 bg-[#002050] border border-[#002b5c] rounded-xl
                text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#e11d48]/50
                transition-colors"
            />
          </div>

          {error && (
            <div className="px-4 py-3 bg-rose-500/10 border border-rose-500/30 rounded-xl">
              <p className="text-xs text-rose-400">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#e11d48] hover:bg-[#c81940] disabled:opacity-50
              text-white rounded-xl font-bold text-sm transition-colors
              shadow-lg shadow-[#e11d48]/20"
          >
            {loading ? 'Entrando...' : 'Entrar no Radar'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-600 mt-6">
          Acesso restrito à equipe BOW 360
        </p>
      </div>
    </div>
  )
}
