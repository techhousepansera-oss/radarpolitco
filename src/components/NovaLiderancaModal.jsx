import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

const STATUS_OPTIONS = ['Fiel', 'Leal', 'Observando', 'Moderado', 'Em Risco', 'Baixa Fidelidade', 'Crítico']

export default function NovaLiderancaModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    nome_completo: '',
    apelido_politico: '',
    territorio_principal: '',
    municipio: 'Caxias do Sul',
    status_fidelidade: 'Observando',
    meta_votos_caxias: '',
    meta_votos_estado: '',
    perfil_social_link: '',
    foto_url: '',
    telefone: '',
    instagram: '',
    facebook: '',
    tiktok: '',
    logradouro: '',
    cep: '',
    grau_instrucao: '',
    perfil_ideologico: '',
    participa_de: '',
  })
  const [loading, setLoading] = useState(false)
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('basico')
  const submittingRef = useRef(false)

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }))

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const buscarCep = async () => {
    const logradouro = form.logradouro?.trim()
    if (!logradouro) return
    setBuscandoCep(true)
    try {
      const rua = logradouro.replace(/,?\s*\d+.*$/, '').trim()
      const cidade = (form.municipio || 'Caxias do Sul').replace(/\s+/g, '')
      const res = await fetch(`https://viacep.com.br/ws/RS/${encodeURIComponent(cidade)}/${encodeURIComponent(rua)}/json/`)
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        set('cep', data[0].cep)
      }
    } catch { /* silent */ } finally {
      setBuscandoCep(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submittingRef.current) return
    submittingRef.current = true
    setLoading(true)
    setError(null)

    const payload = {
      nome_completo:        form.nome_completo,
      apelido_politico:     form.apelido_politico     || null,
      territorio_principal: form.territorio_principal || null,
      municipio:            form.municipio            || 'Caxias do Sul',
      status_fidelidade:    form.status_fidelidade,
      meta_votos_caxias:    Number(form.meta_votos_caxias) || 0,
      meta_votos_estado:    Number(form.meta_votos_estado) || 0,
      perfil_social_link:   form.perfil_social_link   || null,
      foto_url:             form.foto_url             || null,
      telefone:             form.telefone             || null,
      instagram:            form.instagram            || null,
      facebook:             form.facebook             || null,
      tiktok:               form.tiktok               || null,
      logradouro:           form.logradouro           || null,
      cep:                  form.cep                  || null,
      grau_instrucao:       form.grau_instrucao       || null,
      perfil_ideologico:    form.perfil_ideologico    || null,
      participa_de:         form.participa_de         || null,
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

  const tabs = [
    { id: 'basico',   label: 'Básico'   },
    { id: 'contato',  label: 'Contato'  },
    { id: 'endereco', label: 'Endereço' },
    { id: 'perfil',   label: 'Perfil'   },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[#001733] border border-[#002b5c] rounded-2xl w-full max-w-lg shadow-2xl
          max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[#002b5c] shrink-0">
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

        {/* Tabs */}
        <div className="flex gap-1 px-4 pt-3 pb-0 shrink-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                tab === t.id
                  ? 'bg-[#e11d48] text-white'
                  : 'text-slate-500 hover:text-white hover:bg-[#002b5c]/60'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">

            {/* ── Básico ── */}
            {tab === 'basico' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Nome Completo *" className="sm:col-span-2">
                  <input type="text" required value={form.nome_completo}
                    onChange={(e) => set('nome_completo', e.target.value)}
                    placeholder="João da Silva" className={inputCls} />
                </Field>

                <Field label="Apelido Político">
                  <input type="text" value={form.apelido_politico}
                    onChange={(e) => set('apelido_politico', e.target.value)}
                    placeholder="Joãozinho" className={inputCls} />
                </Field>

                <Field label="Território Principal">
                  <input type="text" value={form.territorio_principal}
                    onChange={(e) => set('territorio_principal', e.target.value)}
                    placeholder="Centro, São Pelegrino..." className={inputCls} />
                </Field>

                <Field label="Município">
                  <input type="text" value={form.municipio}
                    onChange={(e) => set('municipio', e.target.value)}
                    className={inputCls} />
                </Field>

                <Field label="Status de Fidelidade">
                  <select value={form.status_fidelidade}
                    onChange={(e) => set('status_fidelidade', e.target.value)}
                    className={inputCls}>
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>

                <Field label="Meta Votos (Caxias)">
                  <input type="number" min={0} value={form.meta_votos_caxias}
                    onChange={(e) => set('meta_votos_caxias', e.target.value)}
                    placeholder="5000" className={inputCls} />
                </Field>

                <Field label="Meta Votos (Estado)">
                  <input type="number" min={0} value={form.meta_votos_estado}
                    onChange={(e) => set('meta_votos_estado', e.target.value)}
                    placeholder="10000" className={inputCls} />
                </Field>

                <Field label="Foto (URL)" className="sm:col-span-2">
                  <input type="url" value={form.foto_url}
                    onChange={(e) => set('foto_url', e.target.value)}
                    placeholder="https://... (opcional)" className={inputCls} />
                </Field>
              </div>
            )}

            {/* ── Contato ── */}
            {tab === 'contato' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Telefone / WhatsApp" className="sm:col-span-2">
                  <input type="text" value={form.telefone}
                    onChange={(e) => set('telefone', e.target.value)}
                    placeholder="(54) 9 9999-9999" className={inputCls} />
                </Field>

                <Field label="Instagram">
                  <input type="text" value={form.instagram}
                    onChange={(e) => set('instagram', e.target.value)}
                    placeholder="@usuario" className={inputCls} />
                </Field>

                <Field label="Facebook">
                  <input type="text" value={form.facebook}
                    onChange={(e) => set('facebook', e.target.value)}
                    placeholder="nome ou URL" className={inputCls} />
                </Field>

                <Field label="TikTok">
                  <input type="text" value={form.tiktok}
                    onChange={(e) => set('tiktok', e.target.value)}
                    placeholder="@usuario" className={inputCls} />
                </Field>

                <Field label="Link Social (perfil principal)">
                  <input type="url" value={form.perfil_social_link}
                    onChange={(e) => set('perfil_social_link', e.target.value)}
                    placeholder="https://instagram.com/..." className={inputCls} />
                </Field>
              </div>
            )}

            {/* ── Endereço ── */}
            {tab === 'endereco' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Logradouro" className="sm:col-span-2">
                  <div className="flex gap-2">
                    <input type="text" value={form.logradouro}
                      onChange={(e) => set('logradouro', e.target.value)}
                      placeholder="Rua das Flores, 123" className={inputCls} />
                    <button
                      type="button"
                      onClick={buscarCep}
                      disabled={buscandoCep || !form.logradouro}
                      className="shrink-0 px-3 py-2 bg-[#002b5c] hover:bg-[#003d82] border border-[#003d82]
                        disabled:opacity-40 text-slate-300 hover:text-white rounded-xl text-xs font-semibold
                        transition-colors flex items-center gap-1.5 whitespace-nowrap"
                    >
                      {buscandoCep
                        ? <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                        : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                      }
                      CEP
                    </button>
                  </div>
                </Field>

                <Field label="CEP">
                  <input type="text" value={form.cep}
                    onChange={(e) => set('cep', e.target.value)}
                    placeholder="95000-000" className={inputCls} />
                </Field>
              </div>
            )}

            {/* ── Perfil ── */}
            {tab === 'perfil' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Grau de Instrução">
                  <input type="text" value={form.grau_instrucao}
                    onChange={(e) => set('grau_instrucao', e.target.value)}
                    placeholder="Ex: Ensino médio, Graduação..." className={inputCls} />
                </Field>

                <Field label="Perfil Ideológico">
                  <input type="text" value={form.perfil_ideologico}
                    onChange={(e) => set('perfil_ideologico', e.target.value)}
                    placeholder="Ex: Centro-direita..." className={inputCls} />
                </Field>

                <Field label="Participa de" className="sm:col-span-2">
                  <input type="text" value={form.participa_de}
                    onChange={(e) => set('participa_de', e.target.value)}
                    placeholder="Associações, sindicatos, igrejas..." className={inputCls} />
                </Field>
              </div>
            )}

          </div>

          {error && (
            <div className="mx-6 mb-2 px-4 py-3 bg-rose-500/10 border border-rose-500/30 rounded-xl shrink-0">
              <p className="text-xs text-rose-400">{error}</p>
            </div>
          )}

          <div className="flex gap-3 px-6 pb-6 pt-2 shrink-0 border-t border-[#002b5c]/50">
            <button type="button" onClick={onClose}
              className="flex-1 py-3 bg-[#002b5c]/50 hover:bg-[#002b5c] border border-[#003d82]/40
                text-slate-300 rounded-xl font-semibold text-sm transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-3 bg-[#e11d48] hover:bg-[#c81940] disabled:opacity-60
                disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm transition-colors
                flex items-center justify-center gap-2">
              {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
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
