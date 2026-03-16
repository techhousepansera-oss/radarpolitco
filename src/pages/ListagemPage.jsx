import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { formatVotes, formatDate, timeAgo } from '../lib/utils'
import FidelidadeBadge from '../components/FidelidadeBadge'
import LoadingSpinner from '../components/LoadingSpinner'
import UploadAudio from '../components/UploadAudio'
import NovaLiderancaModal from '../components/NovaLiderancaModal'
import { ToastContainer } from '../components/Toast'
import { useToast } from '../hooks/useToast'

const PAGE_SIZE = 18

export default function ListagemPage({ session }) {
  const navigate = useNavigate()
  const { toasts, toast, dismiss } = useToast()
  const [liderancas, setLiderancas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showUpload, setShowUpload] = useState(false)
  const [showNovaLideranca, setShowNovaLideranca] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [showMobileSearch, setShowMobileSearch] = useState(false)
  const [filterStatus, setFilterStatus] = useState('todos')
  const [sortBy, setSortBy] = useState('recente')
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE)
  const [realtimeStatus, setRealtimeStatus] = useState('connecting')
  const [processingBanner, setProcessingBanner] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null) // { id, nome }
  const [deleting, setDeleting] = useState(false)
  const [followUpCounts, setFollowUpCounts] = useState({}) // { lider_id: count }
  const channelRef = useRef(null)
  const processingTimerRef = useRef(null)
  const mobileSearchRef = useRef(null)
  const desktopSearchRef = useRef(null)

  const fetchFollowUpCounts = useCallback(async () => {
    const { data } = await supabase
      .from('follow_ups')
      .select('lider_id')
      .eq('status', 'pendente')
    if (!data) return
    const counts = {}
    data.forEach(({ lider_id }) => { counts[lider_id] = (counts[lider_id] || 0) + 1 })
    setFollowUpCounts(counts)
  }, [])

  const fetchLiderancas = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('liderancas')
        .select('*')
        .order('criado_em', { ascending: false })
      if (err) throw err
      setLiderancas(data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  // Debounce search input (300 ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    fetchLiderancas()
    fetchFollowUpCounts()

    const channel = supabase
      .channel('liderancas-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'liderancas' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setLiderancas((prev) => [payload.new, ...prev])
        } else if (payload.eventType === 'UPDATE') {
          setLiderancas((prev) => prev.map((l) => l.id === payload.new.id ? payload.new : l))
        } else if (payload.eventType === 'DELETE') {
          setLiderancas((prev) => prev.filter((l) => l.id !== payload.old.id))
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeStatus('live')
        else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') setRealtimeStatus('offline')
      })

    channelRef.current = channel
    return () => {
      channel.unsubscribe()
      supabase.removeChannel(channel)
    }
  }, [fetchLiderancas, fetchFollowUpCounts])

  // Auto-focus mobile search when opened
  useEffect(() => {
    if (showMobileSearch) {
      setTimeout(() => mobileSearchRef.current?.focus(), 50)
    }
  }, [showMobileSearch])

  // Keyboard shortcut "/" — focuses desktop search
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/') return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      e.preventDefault()
      desktopSearchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Clean up processing banner timer
  useEffect(() => {
    return () => { if (processingTimerRef.current) clearTimeout(processingTimerRef.current) }
  }, [])

  const handleDeleteLider = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    const nome = confirmDelete.nome
    try {
      // 1. Apaga entrevistas vinculadas primeiro (cascata)
      await supabase.from('entrevistas').delete().eq('lider_id', confirmDelete.id)
      // 2. Apaga a liderança
      const { error: err } = await supabase.from('liderancas').delete().eq('id', confirmDelete.id)
      if (err) throw err
      // Remove do estado local imediatamente (realtime pode demorar)
      setLiderancas((prev) => prev.filter((l) => l.id !== confirmDelete.id))
      toast(`${nome} removido com sucesso`, 'success')
    } catch (e) {
      toast('Erro ao apagar: ' + e.message, 'error')
    } finally {
      setDeleting(false)
      setConfirmDelete(null)
    }
  }

  const handleExportCSV = useCallback(() => {
    if (!liderancas.length) {
      toast('Nenhuma liderança para exportar', 'warning')
      return
    }
    const headers = [
      'Nome Completo', 'Apelido Político', 'Território', 'Município',
      'Status Fidelidade', 'Meta Caxias', 'Meta Estado', 'Cadastrado em',
    ]
    const rows = liderancas.map((l) => [
      l.nome_completo || '',
      l.apelido_politico || '',
      l.territorio_principal || '',
      l.municipio || '',
      l.status_fidelidade || '',
      l.meta_votos_caxias || 0,
      l.meta_votos_estado || 0,
      formatDate(l.criado_em || l.created_at),
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))

    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `radar-politico-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(`${liderancas.length} lideranças exportadas`, 'success')
  }, [liderancas, toast])

  const handleUploadSuccess = () => {
    setShowUpload(false)
    setProcessingBanner(true)
    if (processingTimerRef.current) clearTimeout(processingTimerRef.current)
    processingTimerRef.current = setTimeout(() => setProcessingBanner(false), 3 * 60 * 1000)
  }

  // Filter + Sort with useMemo for performance (uses debouncedSearch)
  const sorted = useMemo(() => {
    const q = debouncedSearch.toLowerCase()
    const getDate = (l) => new Date(l.criado_em || l.created_at || 0).getTime()

    const filtered = liderancas.filter((l) => {
      const matchSearch =
        !debouncedSearch ||
        l.nome_completo?.toLowerCase().includes(q) ||
        l.apelido_politico?.toLowerCase().includes(q) ||
        l.territorio_principal?.toLowerCase().includes(q) ||
        l.municipio?.toLowerCase().includes(q)

      const s = l.status_fidelidade?.toLowerCase() || ''
      const matchFilter =
        filterStatus === 'todos' ||
        (filterStatus === 'fiel' && (s.includes('fiel') || s.includes('leal'))) ||
        (filterStatus === 'observando' && (s.includes('observando') || s.includes('neutro') || s.includes('moderado'))) ||
        (filterStatus === 'risco' && (s.includes('risco') || s.includes('baixa') || s.includes('critico') || s.includes('traição')))

      return matchSearch && matchFilter
    })

    return [...filtered].sort((a, b) => {
      if (sortBy === 'recente') return getDate(b) - getDate(a)
      if (sortBy === 'az') return (a.apelido_politico || a.nome_completo || '').localeCompare(b.apelido_politico || b.nome_completo || '', 'pt-BR')
      if (sortBy === 'votos') return (Number(b.meta_votos_caxias) || 0) - (Number(a.meta_votos_caxias) || 0)
      if (sortBy === 'status') {
        const order = { fiel: 0, leal: 0, observando: 1, moderado: 1, neutro: 1, risco: 2, baixa: 2, critico: 2 }
        const getOrder = (l) => {
          const s = l.status_fidelidade?.toLowerCase() || ''
          return Object.entries(order).find(([k]) => s.includes(k))?.[1] ?? 3
        }
        return getOrder(a) - getOrder(b)
      }
      return 0
    })
  }, [liderancas, debouncedSearch, filterStatus, sortBy])

  const visible = sorted.slice(0, displayLimit)
  const hasMore = sorted.length > displayLimit

  const stats = useMemo(() => {
    const fieis = liderancas.filter((l) => {
      const s = l.status_fidelidade?.toLowerCase() || ''
      return s.includes('fiel') || s.includes('leal')
    }).length
    const observando = liderancas.filter((l) => {
      const s = l.status_fidelidade?.toLowerCase() || ''
      return s.includes('observando') || s.includes('neutro') || s.includes('moderado')
    }).length
    const emRisco = liderancas.filter((l) => {
      const s = l.status_fidelidade?.toLowerCase() || ''
      return s.includes('risco') || s.includes('baixa') || s.includes('critico')
    }).length
    return {
      total: liderancas.length,
      metaCaxias: liderancas.reduce((acc, l) => acc + (Number(l.meta_votos_caxias) || 0), 0),
      emRisco,
      fieis,
      filterCounts: { todos: liderancas.length, fiel: fieis, observando, risco: emRisco },
    }
  }, [liderancas])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#00101f] flex items-center justify-center">
        <LoadingSpinner text="Carregando Radar Político..." />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#00101f] flex items-center justify-center p-6">
        <div className="text-center p-8 bg-[#001733] rounded-2xl border border-rose-500/30 max-w-md w-full">
          <div className="w-16 h-16 bg-rose-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-white mb-2">Erro de Conexão com Supabase</h2>
          <p className="text-sm text-slate-400 mb-1 font-mono bg-slate-800/50 rounded-lg p-2 break-all">{error}</p>
          <p className="text-xs text-slate-500 mt-3">Verifique o arquivo .env (VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY)</p>
          <button
            onClick={fetchLiderancas}
            className="mt-4 px-5 py-2 bg-[#002b5c] hover:bg-[#003d82] rounded-xl text-sm text-white transition-colors"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#00101f]">

      {/* ── Top Navigation Bar ── */}
      <header className="bg-[#001733] border-b border-[#002b5c] sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">

          {/* Brand */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 bg-[#e11d48] rounded-xl flex items-center justify-center
              font-black text-white text-xs tracking-tight shadow-lg shadow-[#e11d48]/30">
              B360
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-bold text-white leading-tight">BOW 360</p>
              <p className="text-xs text-slate-500 leading-tight">Pansera 2026 · Radar Político</p>
            </div>
          </div>

          {/* Desktop Search */}
          <div className="flex-1 max-w-sm relative hidden md:block">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500"
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={desktopSearchRef}
              type="text"
              placeholder="Buscar liderança, território... (pressione /)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-[#002b5c]/40 border border-[#002b5c] rounded-xl
                text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#e11d48]/40
                transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {/* Analytics link */}
            <button
              onClick={() => navigate('/analytics')}
              title="Analytics"
              className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#002b5c]
                hover:bg-[#002b5c]/60 text-slate-400 hover:text-white transition-colors text-xs font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Analytics
            </button>

            {/* Realtime indicator */}
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#002b5c]/40 border border-[#002b5c]/60">
              <span className={`w-1.5 h-1.5 rounded-full ${
                realtimeStatus === 'live' ? 'bg-emerald-400 animate-pulse' :
                realtimeStatus === 'connecting' ? 'bg-amber-400 animate-pulse' :
                'bg-rose-500'
              }`} />
              <span className="text-xs text-slate-400">
                {realtimeStatus === 'live' ? 'Live' : realtimeStatus === 'connecting' ? 'Conectando' : 'Offline'}
              </span>
            </div>

            {/* Mobile search toggle */}
            <button
              onClick={() => setShowMobileSearch((v) => !v)}
              title="Buscar"
              className="md:hidden w-9 h-9 rounded-xl border border-[#002b5c] hover:bg-[#002b5c]/60
                flex items-center justify-center text-slate-400 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>

            <button
              onClick={fetchLiderancas}
              title="Atualizar lista"
              className="w-9 h-9 rounded-xl border border-[#002b5c] hover:bg-[#002b5c]/60
                flex items-center justify-center text-slate-400 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>

            {/* Export CSV — desktop */}
            <button
              onClick={handleExportCSV}
              title="Exportar CSV"
              className="hidden md:flex w-9 h-9 rounded-xl border border-[#002b5c] hover:bg-[#002b5c]/60
                items-center justify-center text-slate-400 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>

            {/* Manual registration — desktop */}
            <button
              onClick={() => setShowNovaLideranca(true)}
              title="Cadastrar liderança manualmente"
              className="hidden md:flex items-center gap-2 px-3 py-2.5 border border-[#002b5c] hover:bg-[#002b5c]/60
                text-slate-300 hover:text-white rounded-xl text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              <span>Cadastrar</span>
            </button>

            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#e11d48] hover:bg-[#c81940]
                text-white rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-[#e11d48]/20"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span className="hidden sm:inline">Nova Entrevista</span>
              <span className="sm:hidden">Upload</span>
            </button>

            {/* Logout */}
            <button
              onClick={handleLogout}
              title="Sair"
              className="w-9 h-9 rounded-xl border border-[#002b5c] hover:bg-rose-500/10
                hover:border-rose-500/40 flex items-center justify-center text-slate-500
                hover:text-rose-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile search bar — expandable */}
        {showMobileSearch && (
          <div className="md:hidden px-4 pb-3 border-t border-[#002b5c]/50 pt-3">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500"
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={mobileSearchRef}
                type="text"
                placeholder="Buscar liderança, território..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-10 py-2.5 bg-[#002b5c]/40 border border-[#002b5c] rounded-xl
                  text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#e11d48]/40
                  transition-colors"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

        {/* ── Processing Banner ── */}
        {processingBanner && (
          <div className="flex items-center gap-3 mb-6 px-4 py-3 bg-amber-500/10 border border-amber-500/30
            rounded-xl">
            <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse shrink-0" />
            <p className="text-sm text-amber-300 flex-1">
              Pipeline processando — a liderança aparecerá na lista assim que o n8n concluir a análise.
            </p>
            <button
              onClick={() => setProcessingBanner(false)}
              className="text-amber-500 hover:text-amber-300 shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* ── Stats Bar ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <StatCard icon="👥" label="Lideranças" value={stats.total} color="blue" />
          <StatCard icon="🗳️" label="Meta Caxias" value={formatVotes(stats.metaCaxias)} color="blue" />
          <StatCard icon="⚠️" label="Em Risco" value={stats.emRisco} color="red" />
          <StatCard icon="✓" label="Fiéis" value={stats.fieis} color="green" />
        </div>

        {/* ── Filters + Sort ── */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider mr-1">
            Filtrar:
          </span>
          {[
            { key: 'todos', label: 'Todos' },
            { key: 'fiel', label: 'Fiéis' },
            { key: 'observando', label: 'Observando' },
            { key: 'risco', label: 'Em Risco' },
          ].map(({ key, label }) => {
            const count = stats.filterCounts[key] ?? 0
            return (
              <button
                key={key}
                onClick={() => { setFilterStatus(key); setDisplayLimit(PAGE_SIZE) }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  filterStatus === key
                    ? 'bg-[#e11d48] text-white'
                    : 'bg-[#002b5c]/50 text-slate-400 hover:bg-[#002b5c] hover:text-white'
                }`}
              >
                {label}
                {count > 0 && (
                  <span className={`text-[10px] font-black px-1 py-0.5 rounded leading-none ${
                    filterStatus === key ? 'bg-white/20 text-white' : 'bg-[#002b5c] text-slate-400'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}

          {/* Sort dropdown */}
          <select
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value); setDisplayLimit(PAGE_SIZE) }}
            className="ml-auto px-3 py-1.5 bg-[#002b5c]/50 border border-[#002b5c] rounded-lg
              text-xs text-slate-400 focus:outline-none focus:border-[#e11d48]/40 cursor-pointer
              transition-colors hover:bg-[#002b5c]"
          >
            <option value="recente">↓ Mais recente</option>
            <option value="az">A → Z</option>
            <option value="votos">Mais votos</option>
            <option value="status">Por status</option>
          </select>

          <span className="text-xs text-slate-500 w-full sm:w-auto sm:ml-0">
            {sorted.length} / {liderancas.length} liderança{liderancas.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* ── Bento Grid ── */}
        {sorted.length === 0 ? (
          <EmptyState hasData={liderancas.length > 0} onUpload={() => setShowUpload(true)} />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {visible.map((lider) => (
                <LiderancaCard
                  key={lider.id}
                  lider={lider}
                  onClick={() => navigate(`/lideranca/${lider.id}`)}
                  onDelete={(e) => {
                    e.stopPropagation()
                    setConfirmDelete({ id: lider.id, nome: lider.apelido_politico || lider.nome_completo })
                  }}
                  followUpCount={followUpCounts[lider.id] || 0}
                />
              ))}
            </div>

            {/* Pagination */}
            {hasMore && (
              <div className="mt-8 text-center">
                <button
                  onClick={() => setDisplayLimit((d) => d + PAGE_SIZE)}
                  className="px-6 py-3 bg-[#002b5c]/60 hover:bg-[#002b5c] border border-[#003d82]/60
                    text-slate-300 hover:text-white rounded-xl text-sm font-medium transition-colors"
                >
                  Ver mais ({sorted.length - displayLimit} restantes)
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* ── Mobile FAB: Cadastrar ── */}
      <button
        onClick={() => setShowNovaLideranca(true)}
        className="md:hidden fixed bottom-6 right-6 z-30 w-14 h-14 bg-[#002b5c] hover:bg-[#003d82]
          border border-[#003d82] rounded-full flex items-center justify-center
          shadow-xl shadow-black/40 transition-colors"
        title="Cadastrar liderança"
      >
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
      </button>

      {showUpload && (
        <UploadAudio
          onClose={() => setShowUpload(false)}
          onSuccess={handleUploadSuccess}
        />
      )}

      {showNovaLideranca && (
        <NovaLiderancaModal
          onClose={() => setShowNovaLideranca(false)}
          onSuccess={() => {
            setShowNovaLideranca(false)
            toast('Liderança cadastrada com sucesso!', 'success')
          }}
        />
      )}

      {/* ── Modal de Confirmação de Exclusão ── */}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => !deleting && setConfirmDelete(null)}
        >
          <div
            className="bg-[#001733] border border-rose-500/30 rounded-2xl w-full max-w-sm p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 bg-rose-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-white text-center mb-1">Apagar Liderança?</h3>
            <p className="text-sm text-slate-400 text-center mb-1">
              <strong className="text-white">{confirmDelete.nome}</strong>
            </p>
            <p className="text-xs text-slate-500 text-center mb-6">
              Isso apagará também todas as entrevistas vinculadas. Esta ação é irreversível.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="flex-1 py-2.5 bg-[#002b5c]/50 hover:bg-[#002b5c] border border-[#003d82]/40
                  text-slate-300 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteLider}
                disabled={deleting}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-60
                  text-white rounded-xl font-bold text-sm transition-colors
                  flex items-center justify-center gap-2"
              >
                {deleting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {deleting ? 'Apagando...' : 'Sim, apagar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, color }) {
  const colors = {
    blue: 'bg-[#002b5c]/40 border-[#002b5c]/60',
    red: 'bg-rose-500/10 border-rose-500/20',
    green: 'bg-emerald-500/10 border-emerald-500/20',
  }
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-slate-500 font-medium truncate">{label}</p>
          <p className="text-2xl font-black text-white mt-0.5 tabular-nums">{value}</p>
        </div>
        <span className="text-2xl leading-none mt-0.5 shrink-0">{icon}</span>
      </div>
    </div>
  )
}

function LiderancaCard({ lider, onClick, onDelete, followUpCount = 0 }) {
  const initial = (lider.apelido_politico || lider.nome_completo || '?').charAt(0).toUpperCase()
  const isNew = (() => {
    const created = lider.criado_em || lider.created_at
    if (!created) return false
    return Date.now() - new Date(created).getTime() < 24 * 60 * 60 * 1000
  })()

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer bg-[#001733] border border-[#002b5c]
        hover:border-[#e11d48]/40 rounded-2xl p-5 transition-all duration-200
        hover:bg-[#001f45] hover:shadow-xl hover:shadow-[#e11d48]/5 relative"
    >
      {/* Badge "Novo" — últimas 24h */}
      {isNew && (
        <span className="absolute top-3 left-3 z-10 px-1.5 py-0.5 text-[10px] font-black
          bg-emerald-500 text-white rounded-md tracking-wide leading-none">
          NOVO
        </span>
      )}

      {/* Botão de deletar — aparece no hover */}
      <button
        onClick={onDelete}
        title="Apagar liderança"
        className="absolute top-3 right-3 z-10 w-7 h-7 rounded-lg
          opacity-0 group-hover:opacity-100 transition-all
          bg-rose-500/10 hover:bg-rose-500/30 border border-rose-500/20
          flex items-center justify-center text-rose-500 hover:text-rose-300"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>

      {/* Card header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          {lider.foto_url ? (
            <img
              src={lider.foto_url}
              alt={lider.apelido_politico || lider.nome_completo}
              className="w-10 h-10 rounded-xl object-cover border border-[#003d82]/60 shrink-0"
              onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex' }}
            />
          ) : null}
          <div
            className="w-10 h-10 rounded-xl bg-[#002b5c] border border-[#003d82]/60
              items-center justify-center font-black text-[#e11d48] text-base shrink-0"
            style={{ display: lider.foto_url ? 'none' : 'flex' }}
          >
            {initial}
          </div>
          <div className="min-w-0 pr-6">
            <h3 className="font-bold text-white text-sm leading-tight truncate
              group-hover:text-[#e11d48] transition-colors">
              {lider.apelido_politico || lider.nome_completo}
            </h3>
            {lider.apelido_politico && (
              <p className="text-xs text-slate-500 mt-0.5 truncate">{lider.nome_completo}</p>
            )}
          </div>
        </div>
        <svg className="w-4 h-4 text-slate-600 group-hover:text-[#e11d48]
          group-hover:translate-x-0.5 transition-all shrink-0 mt-0.5 hidden"
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>

      {/* Fidelidade badge */}
      <div className="mb-4">
        <FidelidadeBadge status={lider.status_fidelidade} />
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-2">
        <MetricMini label="Território" value={lider.territorio_principal || '—'} truncate />
        <MetricMini label="Meta Caxias" value={formatVotes(lider.meta_votos_caxias)} />
        {lider.meta_votos_estado > 0 && (
          <MetricMini label="Meta Estado" value={formatVotes(lider.meta_votos_estado)} className="col-span-2" />
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#002b5c]/50">
        <div className="flex items-center gap-2">
          <span
            className="text-xs text-slate-600"
            title={formatDate(lider.criado_em || lider.created_at)}
          >
            {timeAgo(lider.criado_em || lider.created_at)}
          </span>
          {followUpCount > 0 && (
            <span className="flex items-center gap-1 text-xs font-semibold text-amber-400
              bg-amber-500/10 border border-amber-500/25 px-1.5 py-0.5 rounded-lg">
              📅 {followUpCount}
            </span>
          )}
        </div>
        {lider.municipio && (
          <span className="text-xs text-slate-500 bg-[#002b5c]/40 px-2 py-0.5 rounded-full">
            {lider.municipio}
          </span>
        )}
      </div>
    </div>
  )
}

function MetricMini({ label, value, truncate, className = '' }) {
  return (
    <div className={`bg-[#002b5c]/40 rounded-xl p-2.5 ${className}`}>
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <p className={`text-xs font-semibold text-white leading-tight ${truncate ? 'truncate' : ''}`}>
        {value}
      </p>
    </div>
  )
}

function EmptyState({ hasData, onUpload }) {
  return (
    <div className="text-center py-24">
      <div className="w-20 h-20 bg-[#002b5c]/40 rounded-2xl flex items-center justify-center mx-auto mb-6">
        <svg className="w-10 h-10 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7
            20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002
            5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </div>
      {hasData ? (
        <>
          <h3 className="text-lg font-bold text-white mb-2">Nenhum resultado para o filtro</h3>
          <p className="text-sm text-slate-500">Tente remover filtros ou ajustar a busca</p>
        </>
      ) : (
        <>
          <h3 className="text-lg font-bold text-white mb-2">Nenhuma liderança cadastrada</h3>
          <p className="text-sm text-slate-500 mb-6">
            Faça o upload de uma entrevista para iniciar o Radar
          </p>
          <button
            onClick={onUpload}
            className="px-6 py-3 bg-[#e11d48] hover:bg-[#c81940] text-white rounded-xl
              font-semibold text-sm transition-colors"
          >
            Upload da Primeira Entrevista
          </button>
        </>
      )}
    </div>
  )
}
