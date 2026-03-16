import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

const STATUS_OPTIONS = [
  'Fiel',
  'Leal',
  'Observando',
  'Moderado',
  'Em Risco',
  'Baixa Fidelidade',
  'Crítico',
]

export default function NovaLiderancaModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    nome_completo: '',
    apelido_politico: '',
    territorio_principal: '',
    municipio: 'Duque de Caxias',
    status_fidelidade: 'Observando',
    meta_votos_caxias: '',
    meta_votos_estado: '',
    perfil_social_link: '',
    foto_url: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const submittingRef = useRef(false)

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }))

  // Close on ESC
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submittingRef.current) return
    submittingRef.current = true
    setLoading(true)
    setError(null)

    const payload = {
      nome_completo: form.nome_completo,
      apelido_politico: form.apelido_politico || null,
      territorio_principal: form.territorio_principal || null,
      municipio: form.municipio || 'Duque de Caxias',
      status_fidelidade: form.status_fidelidade,
      meta_votos_caxias: Number(form.meta_votos_caxias) || 0,
      meta_votos_estado: Number(form.meta_votos_estado) || 0,
      perfil_social_link: form.perfil_social_link || null,
      ...(form.foto_url ? { foto_url: form.foto_url } : {}),
    }

    const { error: err } = await supabase.from('liderancas').insert([payload])
    if (err) {
      setError(err.message)
      setLoading(false)
      submittingRef.current = false
      return
    }
    onSuccess()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[#001733] border border-[#002b5c] rounded-2xl w-full max-w-lg shadow-2xl
          max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#002b5c]">
          <div>
            <h2 className="font-bold text-white">Nova Liderança</h2>
            <p className="text-xs text-slate-500 mt-0.5">Cadastro manual sem entrevista</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center
            text-slate-500 hover:text-white hover:bg-[#002b5c] transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nome Completo *">
              <input
                type="text"
                required
                value={form.nome_completo}
                onChange={(e) => set('nome_completo', e.target.value)}
                placeholder="João da Silva"
                className={inputCls}
              />
            </Field>

            <Field label="Apelido Político">
              <input
                type="text"
                value={form.apelido_politico}
                onChange={(e) => set('apelido_politico', e.target.value)}
                placeholder="Joãozinho"
                className={inputCls}
              />
            </Field>

            <Field label="Território Principal">
              <input
                type="text"
                value={form.territorio_principal}
                onChange={(e) => set('territorio_principal', e.target.value)}
                placeholder="Centro, Saracuruna..."
                className={inputCls}
              />
            </Field>

            <Field label="Município">
              <input
                type="text"
                value={form.municipio}
                onChange={(e) => set('municipio', e.target.value)}
                className={inputCls}
              />
            </Field>

            <Field label="Status de Fidelidade">
              <select
                value={form.status_fidelidade}
                onChange={(e) => set('status_fidelidade', e.target.value)}
                className={inputCls}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>

            <Field label="Meta Votos (Caxias)">
              <input
                type="number"
                min={0}
                value={form.meta_votos_caxias}
                onChange={(e) => set('meta_votos_caxias', e.target.value)}
                placeholder="5000"
                className={inputCls}
              />
            </Field>

            <Field label="Meta Votos (Estado)">
              <input
                type="number"
                min={0}
                value={form.meta_votos_estado}
                onChange={(e) => set('meta_votos_estado', e.target.value)}
                placeholder="10000"
                className={inputCls}
              />
            </Field>

            <Field label="Link Social (Instagram/Facebook)">
              <input
                type="url"
                value={form.perfil_social_link}
                onChange={(e) => set('perfil_social_link', e.target.value)}
                placeholder="https://instagram.com/..."
                className={inputCls}
              />
            </Field>

            <Field label="Foto (URL da imagem)" className="sm:col-span-2">
              <input
                type="url"
                value={form.foto_url}
                onChange={(e) => set('foto_url', e.target.value)}
                placeholder="https://... (opcional)"
                className={inputCls}
              />
            </Field>
          </div>

          {error && (
            <div className="px-4 py-3 bg-rose-500/10 border border-rose-500/30 rounded-xl">
              <p className="text-xs text-rose-400">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-[#002b5c]/50 hover:bg-[#002b5c] border border-[#003d82]/40
                text-slate-300 rounded-xl font-semibold text-sm transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 bg-[#e11d48] hover:bg-[#c81940] disabled:opacity-60
                disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm transition-colors
                flex items-center justify-center gap-2"
            >
              {loading && (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              {loading ? 'Salvando...' : 'Cadastrar Liderança'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const inputCls = `w-full px-3 py-2.5 bg-[#002050] border border-[#002b5c] rounded-xl
  text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#e11d48]/50
  transition-colors`

function Field({ label, children, className = '' }) {
  return (
    <div className={className}>
      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      {children}
    </div>
  )
}
