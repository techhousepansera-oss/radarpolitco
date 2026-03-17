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
  const [overdueCount, setOverdueCount] = useState(0)
  const channelRef = useRef(null)
  const processingTimerRef = useRef(null)
  const mobileSearchRef = useRef(null)
  const desktopSearchRef = useRef(null)

  const fetchFollowUpCounts = useCallback(async () => {
    const { data } = await supabase
      .from('follow_ups')
      .select('lider_id, data_agendada')
      .eq('status', 'pendente')
    if (!data) return
    const counts = {}
    const now = new Date()
    let overdue = 0
    data.forEach(({ lider_id, data_agendada }) => {
      counts[lider_id] = (counts[lider_id] || 0) + 1
      if (new Date(data_agendada) < now) overdue++
    })
    setFollowUpCounts(counts)
    setOverdueCount(overdue)
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

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      // "/" — focus search
      if (e.key === '/' && !isTyping) {
        e.preventDefault()
        desktopSearchRef.current?.focus()
        return
      }
      // "a" — open analytics
      if ((e.key === 'a' || e.key === 'A') && !isTyping && !e.ctrlKey && !e.metaKey) {
        navigate('/analytics')
        return
      }
      // "m" — open map
      if ((e.key === 'm' || e.key === 'M') && !isTyping && !e.ctrlKey && !e.metaKey) {
        navigate('/mapa')
        return
      }
      // "c" — open comparador
      if ((e.key === 'c' || e.key === 'C') && !isTyping && !e.ctrlKey && !e.metaKey) {
        navigate('/comparar')
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

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
      'Status Fidelidade', 'Meta Caxias', 'Meta Estado',
      'Telefone', 'Instagram', 'Facebook', 'Logradouro', 'CEP',
      'Grau de Instrução', 'Perfil Ideológico', 'Participa de',
      'Desde quando atua', 'Desde quando Pansera', 'Cadastrado em',
    ]
    const rows = liderancas.map((l) => [
      l.nome_completo || '',
      l.apelido_politico || '',
      l.territorio_principal || '',
      l.municipio || '',
      l.status_fidelidade || '',
      l.meta_votos_caxias || 0,
      l.meta_votos_estado || 0,
      l.telefone || '',
      l.instagram || '',
      l.facebook || '',
      l.logradouro || '',
      l.cep || '',
      l.grau_instrucao || '',
      l.perfil_ideologico || '',
      l.participa_de || '',
      l.desde_quando_atua || '',
      l.desde_quando_pansera || '',
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

  const handleUploadSuccess = useCallback(() => {
    setShowUpload(false)
    setProcessingBanner(true)
    if (processingTimerRef.current) clearTimeout(processingTimerRef.current)
    // Força refresh imediato — o polling do UploadAudio já confirmou que o
    // registro existe no Supabase, então fetchLiderancas() vai encontrá-lo
    fetchLiderancas()
    fetchFollowUpCounts()
    processingTimerRef.current = setTimeout(() => setProcessingBanner(false), 3 * 60 * 1000)
  }, [fetchLiderancas, fetchFollowUpCounts])

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
        l.municipio?.toLowerCase().includes(q) ||
        l.telefone?.includes(q) ||
        l.instagram?.toLowerCase().includes(q) ||
        l.facebook?.toLowerCase().includes(q) ||
        l.participa_de?.toLowerCase().includes(q)

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
    const totalFollowUps = Object.values(followUpCounts).reduce((a, b) => a + b, 0)
    return {
      total: liderancas.length,
      metaCaxias: liderancas.reduce((acc, l) => acc + (Number(l.meta_votos_caxias) || 0), 0),
      emRisco,
      fieis,
      filterCounts: { todos: liderancas.length, fiel: fieis, observando, risco: emRisco },
      totalFollowUps,
    }
  }, [liderancas, followUpCounts])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#00101f]">
        {/* Skeleton header */}
        <div className="bg-[#001733] border-b border-[#002b5c] h-[73px]" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          {/* Skeleton stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-xl border border-[#002b5c]/50 p-4 animate-pulse">
                <div className="h-3 w-16 bg-[#002b5c] rounded mb-2" />
                <div className="h-7 w-12 bg-[#002b5c] rounded" />
              </div>
            ))}
          </div>
          {/* Skeleton cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-[#001733] border border-[#002b5c]/50 rounded-2xl p-5 animate-pulse">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-[#002b5c] shrink-0" />
                  <div className="flex-1">
                    <div className="h-4 w-32 bg-[#002b5c] rounded mb-1.5" />
                    <div className="h-3 w-20 bg-[#002b5c]/60 rounded" />
                  </div>
                </div>
                <div className="h-6 w-24 bg-[#002b5c]/60 rounded-full mb-4" />
                <div className="grid grid-cols-2 gap-2">
                  <div className="h-14 bg-[#002b5c]/40 rounded-xl" />
                  <div className="h-14 bg-[#002b5c]/40 rounded-xl" />
                </div>
                <div className="mt-4 pt-3 border-t border-[#002b5c]/50 flex justify-between">
                  <div className="h-3 w-16 bg-[#002b5c]/50 rounded" />
                  <div className="h-3 w-20 bg-[#002b5c]/50 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
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
            {/* Follow-up global badge */}
            {stats.totalFollowUps > 0 && (
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                bg-amber-500/10 border border-amber-500/25 text-amber-400 text-xs font-semibold">
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {stats.totalFollowUps} pendente{stats.totalFollowUps !== 1 ? 's' : ''}
              </div>
            )}

            {/* Analytics link */}
            <button
              onClick={() => navigate('/analytics')}
              title="Analytics (A)"
              className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#002b5c]
                hover:bg-[#002b5c]/60 text-slate-400 hover:text-white transition-colors text-xs font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Analytics
            </button>

            {/* Map link */}
            <button
              onClick={() => navigate('/mapa')}
              title="Mapa Eleitoral (M)"
              className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#002b5c]
                hover:bg-[#002b5c]/60 text-slate-400 hover:text-white transition-colors text-xs font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              Mapa
            </button>

            {/* Comparador link */}
            <button
              onClick={() => navigate('/comparar')}
              title="Comparar lideranças (C)"
              className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#002b5c]
                hover:bg-[#002b5c]/60 text-slate-400 hover:text-white transition-colors text-xs font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
              Comparar
            </button>

            {/* Custos link */}
            <button
              onClick={() => navigate('/custos')}
              title="Custos & Tokens IA"
              className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#002b5c]
                hover:bg-[#002b5c]/60 text-slate-400 hover:text-white transition-colors text-xs font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Custos
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

        {/* ── Banner: Follow-ups Atrasados ── */}
        {overdueCount > 0 && (
          <div className="flex items-center gap-3 mb-4 px-4 py-3 bg-rose-500/10 border border-rose-500/30
            rounded-xl">
            <svg className="w-4 h-4 text-rose-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-rose-300 flex-1">
              <strong>{overdueCount}</strong> follow-up{overdueCount !== 1 ? 's' : ''} atrasado{overdueCount !== 1 ? 's' : ''} — acesse a aba Agenda de cada liderança para resolver.
            </p>
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
              {visible.map((lider, idx) => (
                <LiderancaCard
                  key={lider.id}
                  lider={lider}
                  index={idx}
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

function LiderancaCard({ lider, onClick, onDelete, followUpCount = 0, index = 0 }) {
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
        hover:bg-[#001f45] hover:shadow-xl hover:shadow-[#e11d48]/5 relative
        opacity-0 animate-fadeIn"
      style={{ animationDelay: `${Math.min(index * 40, 400)}ms`, animationFillMode: 'forwards' }}
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

      {/* Avaliação interna — média */}
      {(() => {
        const scores = [
          lider.avaliacao_capacidade,
          lider.avaliacao_entrega,
          lider.avaliacao_comprometimento,
          lider.avaliacao_postura,
          lider.avaliacao_potencial,
        ].filter(Boolean)
        if (scores.length === 0) return null
        const media = scores.reduce((a, b) => a + b, 0) / scores.length
        const stars = Math.round(media)
        return (
          <div className="flex items-center gap-1.5 mt-3">
            <div className="flex gap-0.5">
              {[1,2,3,4,5].map((v) => (
                <svg key={v} className={`w-3 h-3 ${v <= stars ? 'text-amber-400' : 'text-slate-700'}`}
                  fill="currentColor" viewBox="0 0 24 24">
                  <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              ))}
            </div>
            <span className="text-xs text-slate-500">{media.toFixed(1)}</span>
            {lider.avaliacao_perfil && (
              <span className="text-xs text-slate-600 capitalize ml-0.5">· {lider.avaliacao_perfil}</span>
            )}
          </div>
        )
      })()}

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#002b5c]/50">
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
        <div className="flex items-center gap-1.5">
          {lider.telefone && (
            <a
              href={`https://wa.me/55${lider.telefone.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title="WhatsApp"
              className="w-6 h-6 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/30 border border-emerald-500/20
                flex items-center justify-center text-emerald-400 transition-colors"
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </a>
          )}
          {lider.instagram && (
            <a
              href={lider.instagram.startsWith('http') ? lider.instagram : `https://instagram.com/${lider.instagram.replace('@','')}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title="Instagram"
              className="w-6 h-6 rounded-lg bg-purple-500/10 hover:bg-purple-500/30 border border-purple-500/20
                flex items-center justify-center text-purple-400 transition-colors"
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
              </svg>
            </a>
          )}
          {lider.municipio && (
            <span className="text-xs text-slate-500 bg-[#002b5c]/40 px-2 py-0.5 rounded-full">
              {lider.municipio}
            </span>
          )}
        </div>
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
