import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { parseAnalise, formatVotes, formatDate, getFidelidadeConfig } from '../lib/utils'
import FidelidadeBadge from '../components/FidelidadeBadge'
import LoadingSpinner from '../components/LoadingSpinner'

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseScore(raw) {
  if (!raw) return null
  const s = String(raw)
  const slash = s.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+)/)
  if (slash) return Math.round((parseFloat(slash[1]) / parseFloat(slash[2])) * 100)
  const n = parseFloat(s.replace(',', '.'))
  if (isNaN(n)) return null
  return n > 1 ? Math.round(n) : Math.round(n * 100)
}

// ── Side panel to pick a leader ───────────────────────────────────────────────
function LiderPicker({ label, liderancas, selected, onSelect }) {
  const [search, setSearch] = useState('')
  const filtered = liderancas.filter((l) => {
    const q = search.toLowerCase()
    return (
      l.nome_completo?.toLowerCase().includes(q) ||
      l.apelido_politico?.toLowerCase().includes(q) ||
      l.territorio_principal?.toLowerCase().includes(q) ||
      l.municipio?.toLowerCase().includes(q)
    )
  })
  return (
    <div className="bg-[#001733] border border-[#002b5c] rounded-2xl p-4 h-full flex flex-col">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">{label}</p>

      {selected ? (
        <div className="flex items-center gap-3 mb-3 p-3 bg-[#002b5c]/40 rounded-xl">
          {selected.foto_url ? (
            <img src={selected.foto_url} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-[#e11d48]/20 border border-[#e11d48]/30
              flex items-center justify-center font-black text-[#e11d48] shrink-0">
              {(selected.apelido_politico || selected.nome_completo || '?')[0].toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white truncate">
              {selected.apelido_politico || selected.nome_completo}
            </p>
            <p className="text-xs text-slate-500 truncate">{selected.territorio_principal || selected.municipio || '—'}</p>
          </div>
          <button
            onClick={() => onSelect(null)}
            className="text-slate-600 hover:text-rose-400 transition-colors shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : null}

      {/* Search */}
      <div className="relative mb-2">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500"
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar liderança..."
          className="w-full pl-9 pr-3 py-2 bg-[#002b5c]/40 border border-[#002b5c] rounded-xl
            text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#e11d48]/40 transition-colors"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto space-y-1 min-h-0 max-h-56">
        {filtered.slice(0, 40).map((l) => {
          const isSelected = selected?.id === l.id
          return (
            <button
              key={l.id}
              onClick={() => onSelect(l)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors ${
                isSelected
                  ? 'bg-[#e11d48]/20 border border-[#e11d48]/30 text-white'
                  : 'hover:bg-[#002b5c]/60 text-slate-300 hover:text-white'
              }`}
            >
              <div className="w-7 h-7 rounded-lg bg-[#002b5c] flex items-center justify-center
                text-xs font-bold text-slate-400 shrink-0">
                {(l.apelido_politico || l.nome_completo || '?')[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">{l.apelido_politico || l.nome_completo}</p>
                <p className="text-xs text-slate-600 truncate">{l.territorio_principal || l.municipio || '—'}</p>
              </div>
            </button>
          )
        })}
        {filtered.length === 0 && (
          <p className="text-xs text-slate-600 text-center py-4">Nenhum resultado</p>
        )}
      </div>
    </div>
  )
}

// ── Comparison row ─────────────────────────────────────────────────────────────
function CompRow({ label, valA, valB, highlight = false, aIsBetter, bIsBetter, icon }) {
  return (
    <div className={`grid grid-cols-[1fr_auto_1fr] items-start gap-2 py-3 border-b border-[#002b5c]/40 ${
      highlight ? 'bg-[#002b5c]/20 -mx-4 px-4 rounded-xl' : ''
    }`}>
      <div className={`text-xs rounded-xl px-2 py-1.5 text-right ${
        aIsBetter ? 'bg-emerald-500/15 text-emerald-300 font-bold' : 'text-slate-300'
      }`}>
        {valA || <span className="text-slate-600">—</span>}
      </div>
      <div className="text-center min-w-[80px]">
        <p className="text-[10px] text-slate-500 uppercase tracking-wider leading-tight">{label}</p>
        {icon && <span className="text-sm">{icon}</span>}
      </div>
      <div className={`text-xs rounded-xl px-2 py-1.5 ${
        bIsBetter ? 'bg-emerald-500/15 text-emerald-300 font-bold' : 'text-slate-300'
      }`}>
        {valB || <span className="text-slate-600">—</span>}
      </div>
    </div>
  )
}

// ── Score bar ─────────────────────────────────────────────────────────────────
function ScoreBar({ score, flip = false }) {
  const s = score || 0
  const color = s >= 70 ? '#10b981' : s >= 40 ? '#f59e0b' : '#f43f5e'
  return (
    <div className={`flex items-center gap-2 ${flip ? 'flex-row-reverse' : ''}`}>
      <span className="text-xs font-bold" style={{ color }}>{s}</span>
      <div className="flex-1 h-1.5 bg-[#002b5c] rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${s}%`, background: color }} />
      </div>
    </div>
  )
}

// ── Pill list ─────────────────────────────────────────────────────────────────
function PillList({ items, color = '#e11d48' }) {
  if (!items?.length) return <span className="text-slate-600 text-xs">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {items.slice(0, 5).map((item, i) => (
        <span
          key={i}
          className="text-[10px] px-2 py-0.5 rounded-full font-medium"
          style={{ background: color + '22', color, border: `1px solid ${color}44` }}
        >
          {item}
        </span>
      ))}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ComparadorPage() {
  const navigate = useNavigate()
  const [liderancas, setLiderancas] = useState([])
  const [loading, setLoading] = useState(true)
  const [liderA, setLiderA] = useState(null)
  const [liderB, setLiderB] = useState(null)
  const [entrevistaA, setEntrevistaA] = useState(null)
  const [entrevistaB, setEntrevistaB] = useState(null)
  const [analiseA, setAnaliseA] = useState(null)
  const [analiseB, setAnaliseB] = useState(null)
  const [loadingComp, setLoadingComp] = useState(false)

  useEffect(() => {
    supabase.from('liderancas').select('*').order('nome_completo').then(({ data }) => {
      setLiderancas(data || [])
      setLoading(false)
    })
  }, [])

  // Load entrevista when leaders are selected
  useEffect(() => {
    const loadEntrevista = async (lider, setEnt, setAn) => {
      if (!lider) { setEnt(null); setAn(null); return }
      const { data } = await supabase
        .from('entrevistas').select('*').eq('lider_id', lider.id)
        .order('id', { ascending: false }).limit(1).maybeSingle()
      setEnt(data || null)
      setAn(data ? parseAnalise(data.analise_json) : null)
    }
    setLoadingComp(true)
    Promise.all([
      loadEntrevista(liderA, setEntrevistaA, setAnaliseA),
      loadEntrevista(liderB, setEntrevistaB, setAnaliseB),
    ]).then(() => setLoadingComp(false))
  }, [liderA?.id, liderB?.id])

  const ready = liderA && liderB

  // Derived values for comparison
  const votosA = Number(liderA?.meta_votos_caxias) || 0
  const votosB = Number(liderB?.meta_votos_caxias) || 0
  const scoreA = parseScore(entrevistaA?.score_fidelidade)
  const scoreB = parseScore(entrevistaB?.score_fidelidade)
  const totalA = (Number(liderA?.meta_votos_caxias) || 0) + (Number(liderA?.meta_votos_estado) || 0)
  const totalB = (Number(liderB?.meta_votos_caxias) || 0) + (Number(liderB?.meta_votos_estado) || 0)

  if (loading) return (
    <div className="min-h-screen bg-[#00101f] flex items-center justify-center">
      <LoadingSpinner text="Carregando lideranças..." />
    </div>
  )

  return (
    <div className="min-h-screen bg-[#00101f]">

      {/* ── Header ── */}
      <header className="bg-[#001733] border-b border-[#002b5c] sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="w-9 h-9 rounded-xl border border-[#002b5c] hover:bg-[#002b5c]/60
              flex items-center justify-center text-slate-400 hover:text-white transition-colors shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <p className="text-sm font-bold text-white leading-tight">Comparador · BOW 360</p>
            <p className="text-xs text-slate-500 leading-tight">Análise lado a lado</p>
          </div>
          <div className="ml-auto text-xs text-slate-600 hidden sm:block">
            {liderancas.length} lideranças disponíveis
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">

        {/* ── Seleção dos dois líderes ── */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_48px_1fr] gap-3 mb-6 items-start">
          <LiderPicker label="Liderança A" liderancas={liderancas} selected={liderA} onSelect={setLiderA} />
          <div className="flex items-center justify-center h-12 md:h-full">
            <div className="w-10 h-10 rounded-full bg-[#002b5c] border border-[#003d82] flex items-center justify-center">
              <span className="text-slate-400 text-xs font-bold">VS</span>
            </div>
          </div>
          <LiderPicker label="Liderança B" liderancas={liderancas} selected={liderB} onSelect={setLiderB} />
        </div>

        {/* ── Empty state ── */}
        {!ready && (
          <div className="bg-[#001733] border border-[#002b5c]/50 rounded-2xl p-12 text-center">
            <div className="w-16 h-16 bg-[#002b5c]/40 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Selecione duas lideranças</h3>
            <p className="text-sm text-slate-500">Use os painéis acima para escolher as lideranças que deseja comparar</p>
          </div>
        )}

        {/* ── Comparison table ── */}
        {ready && !loadingComp && (
          <div className="space-y-4">

            {/* Header cards */}
            <div className="grid grid-cols-[1fr_80px_1fr] gap-3">
              {[
                { lider: liderA, entrevista: entrevistaA, navigate: () => navigate(`/lideranca/${liderA.id}`) },
                null,
                { lider: liderB, entrevista: entrevistaB, navigate: () => navigate(`/lideranca/${liderB.id}`) },
              ].map((item, idx) => {
                if (!item) return (
                  <div key={idx} className="flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-[#001733] border border-[#002b5c] flex items-center justify-center">
                      <span className="text-slate-500 text-xs font-bold">VS</span>
                    </div>
                  </div>
                )
                return (
                  <button
                    key={idx}
                    onClick={item.navigate}
                    className="bg-[#001733] border border-[#002b5c] hover:border-[#e11d48]/40
                      rounded-2xl p-4 text-center group transition-colors"
                  >
                    {item.lider.foto_url ? (
                      <img src={item.lider.foto_url} alt=""
                        className="w-14 h-14 rounded-2xl object-cover border border-[#003d82]/60 mx-auto mb-2" />
                    ) : (
                      <div className="w-14 h-14 rounded-2xl bg-[#e11d48]/20 border border-[#e11d48]/30
                        flex items-center justify-center font-black text-[#e11d48] text-2xl mx-auto mb-2">
                        {(item.lider.apelido_politico || item.lider.nome_completo || '?')[0].toUpperCase()}
                      </div>
                    )}
                    <p className="text-sm font-bold text-white group-hover:text-[#e11d48] transition-colors truncate">
                      {item.lider.apelido_politico || item.lider.nome_completo}
                    </p>
                    {item.lider.apelido_politico && (
                      <p className="text-xs text-slate-500 truncate">{item.lider.nome_completo}</p>
                    )}
                    <div className="flex justify-center mt-2">
                      <FidelidadeBadge status={item.lider.status_fidelidade} />
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Rows */}
            <div className="bg-[#001733] border border-[#002b5c] rounded-2xl px-4 py-2">

              <CompRow
                label="Território"
                icon="📍"
                valA={liderA.territorio_principal || '—'}
                valB={liderB.territorio_principal || '—'}
              />
              <CompRow
                label="Município"
                icon="🏙️"
                valA={liderA.municipio || '—'}
                valB={liderB.municipio || '—'}
              />
              <CompRow
                label="Meta Caxias"
                icon="🗳️"
                valA={formatVotes(liderA.meta_votos_caxias)}
                valB={formatVotes(liderB.meta_votos_caxias)}
                aIsBetter={votosA > votosB}
                bIsBetter={votosB > votosA}
                highlight
              />
              <CompRow
                label="Meta Estado"
                icon="🌍"
                valA={formatVotes(liderA.meta_votos_estado)}
                valB={formatVotes(liderB.meta_votos_estado)}
                aIsBetter={(Number(liderA.meta_votos_estado)||0) > (Number(liderB.meta_votos_estado)||0)}
                bIsBetter={(Number(liderB.meta_votos_estado)||0) > (Number(liderA.meta_votos_estado)||0)}
              />
              <CompRow
                label="Total Votos"
                icon="📊"
                valA={formatVotes(totalA)}
                valB={formatVotes(totalB)}
                aIsBetter={totalA > totalB}
                bIsBetter={totalB > totalA}
                highlight
              />

              {/* Score comparison */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-3 border-b border-[#002b5c]/40">
                <ScoreBar score={scoreA} flip={false} />
                <div className="text-center min-w-[80px]">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider">Score IA</p>
                  <span className="text-sm">🤖</span>
                </div>
                <ScoreBar score={scoreB} flip={true} />
              </div>

              {/* Bairros */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2 py-3 border-b border-[#002b5c]/40">
                <PillList items={analiseA?.bairros} color="#e11d48" />
                <div className="text-center min-w-[80px]">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider">Bairros</p>
                  <span className="text-sm">🏘️</span>
                </div>
                <PillList items={analiseB?.bairros} color="#e11d48" />
              </div>

              <CompRow
                label="Ponto de Traição"
                icon="⚠️"
                valA={analiseA?.analise_fria?.ponto_de_traicao || '—'}
                valB={analiseB?.analise_fria?.ponto_de_traicao || '—'}
                highlight
              />
              <CompRow
                label="Adversário Local"
                icon="🎯"
                valA={analiseA?.analise_fria?.adversario_local || '—'}
                valB={analiseB?.analise_fria?.adversario_local || '—'}
              />
              <CompRow
                label="Reação PT"
                icon="🔴"
                valA={analiseA?.analise_fria?.reacao_pt || '—'}
                valB={analiseB?.analise_fria?.reacao_pt || '—'}
              />
              <CompRow
                label="Vínculo Pansera"
                icon="🤝"
                valA={analiseA?.historico?.vinculo_pansera || '—'}
                valB={analiseB?.historico?.vinculo_pansera || '—'}
              />
              <CompRow
                label="Tempo na Política"
                icon="🗓️"
                valA={analiseA?.historico?.tempo_politica || '—'}
                valB={analiseB?.historico?.tempo_politica || '—'}
              />
            </div>

            {/* Resumos executivos */}
            <div className="grid md:grid-cols-2 gap-4">
              {[
                { lider: liderA, analise: analiseA },
                { lider: liderB, analise: analiseB },
              ].map(({ lider, analise }, i) => (
                <div key={i} className="bg-[#001733] border border-[#002b5c] rounded-2xl p-4">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Resumo · {lider.apelido_politico || lider.nome_completo}
                  </p>
                  {analise?.analise_fria?.resumo_executivo ? (
                    <p className="text-sm text-slate-300 leading-relaxed">
                      {analise.analise_fria.resumo_executivo}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-600 italic">Sem análise de IA disponível</p>
                  )}
                </div>
              ))}
            </div>

          </div>
        )}

        {ready && loadingComp && (
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner text="Carregando análises..." />
          </div>
        )}

      </main>
    </div>
  )
}
