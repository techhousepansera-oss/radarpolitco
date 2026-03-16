import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { formatVotes, formatDate } from '../lib/utils'
import LoadingSpinner from '../components/LoadingSpinner'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line, Area, AreaChart,
} from 'recharts'

// ── Palette ───────────────────────────────────────────────────────────────────
const CORES = {
  fiel:       '#10b981',
  observando: '#f59e0b',
  risco:      '#f43f5e',
  semStatus:  '#475569',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function classifyStatus(s) {
  if (!s) return 'semStatus'
  const l = s.toLowerCase()
  if (l.includes('fiel') || l.includes('leal') || l.includes('comprometido')) return 'fiel'
  if (l.includes('risco') || l.includes('baixa') || l.includes('critico') || l.includes('traição') || l.includes('volatil')) return 'risco'
  if (l.includes('moderada') || l.includes('moderado') || l.includes('neutro') || l.includes('observando') || l.includes('indefinido')) return 'observando'
  return 'semStatus'
}

const statusLabel = {
  fiel:       'Fiéis',
  observando: 'Observando',
  risco:      'Em Risco',
  semStatus:  'Sem Status',
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = 'text-white', icon }) {
  return (
    <div className="bg-[#001733] border border-[#002b5c] rounded-2xl p-5 flex items-center gap-4">
      {icon && (
        <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.05)' }}>
          {icon}
        </div>
      )}
      <div>
        <p className="text-xs text-slate-500 uppercase tracking-widest">{label}</p>
        <p className={`text-2xl font-black mt-0.5 ${color}`}>{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ── Custom tooltip ─────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#001733] border border-[#002b5c] rounded-xl px-3 py-2 shadow-xl text-xs">
      {label && <p className="text-slate-400 mb-1">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || p.fill }} className="font-semibold">
          {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString('pt-BR') : p.value}
        </p>
      ))}
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, sub, children }) {
  return (
    <div className="bg-[#001733] border border-[#002b5c] rounded-2xl p-5">
      <div className="mb-4">
        <h2 className="text-sm font-bold text-white">{title}</h2>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
      {children}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AnalyticsPage({ session }) {
  const navigate = useNavigate()
  const [liderancas, setLiderancas] = useState([])
  const [entrevistas, setEntrevistas] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('liderancas').select('*'),
      supabase.from('entrevistas').select('lider_id, score_fidelidade, expectativa_votos_declarada, criado_em'),
    ]).then(([l, e]) => {
      setLiderancas(l.data || [])
      setEntrevistas(e.data || [])
      setLoading(false)
    })
  }, [])

  // ── Computed data ──────────────────────────────────────────────────────────

  const fidelidadeDist = useMemo(() => {
    const counts = { fiel: 0, observando: 0, risco: 0, semStatus: 0 }
    liderancas.forEach((l) => counts[classifyStatus(l.status_fidelidade)]++)
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([key, value]) => ({ name: statusLabel[key], value, fill: CORES[key] }))
  }, [liderancas])

  const totalVotos = useMemo(() =>
    liderancas.reduce((acc, l) => acc + (Number(l.meta_votos_caxias) || 0), 0),
  [liderancas])

  const votosPorTerritorio = useMemo(() => {
    const map = {}
    liderancas.forEach((l) => {
      const t = l.territorio_principal || l.municipio || 'Não definido'
      map[t] = (map[t] || 0) + (Number(l.meta_votos_caxias) || 0)
    })
    return Object.entries(map)
      .map(([territorio, votos]) => ({ territorio: territorio.length > 18 ? territorio.slice(0, 18) + '…' : territorio, votos }))
      .sort((a, b) => b.votos - a.votos)
      .slice(0, 12)
  }, [liderancas])

  const top10 = useMemo(() =>
    [...liderancas]
      .sort((a, b) => (Number(b.meta_votos_caxias) || 0) - (Number(a.meta_votos_caxias) || 0))
      .slice(0, 10),
  [liderancas])

  const evolucaoTemporal = useMemo(() => {
    // Group liderancas by week of creation
    const byWeek = {}
    liderancas.forEach((l) => {
      const d = new Date(l.criado_em || l.created_at)
      if (isNaN(d)) return
      // Floor to Monday of week
      const day = d.getDay()
      const monday = new Date(d)
      monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
      monday.setHours(0, 0, 0, 0)
      const key = monday.toISOString().slice(0, 10)
      if (!byWeek[key]) byWeek[key] = { data: key, fieis: 0, risco: 0, observando: 0 }
      const cat = classifyStatus(l.status_fidelidade)
      if (cat === 'fiel') byWeek[key].fieis++
      else if (cat === 'risco') byWeek[key].risco++
      else byWeek[key].observando++
    })
    return Object.values(byWeek).sort((a, b) => a.data.localeCompare(b.data))
  }, [liderancas])

  const scoreStats = useMemo(() => {
    const scores = entrevistas
      .map((e) => {
        const raw = e.score_fidelidade
        if (!raw) return null
        const n = parseFloat(String(raw).replace(',', '.'))
        if (isNaN(n)) return null
        return n > 1 ? n : n * 100
      })
      .filter((n) => n !== null)
    if (!scores.length) return null
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    const min = Math.min(...scores)
    const max = Math.max(...scores)
    return { avg: avg.toFixed(1), min: min.toFixed(0), max: max.toFixed(0), total: scores.length }
  }, [entrevistas])

  const liderancasPorMunicipio = useMemo(() => {
    const map = {}
    liderancas.forEach((l) => {
      const m = l.municipio || 'Não informado'
      if (!map[m]) map[m] = { municipio: m, total: 0, fieis: 0, risco: 0 }
      map[m].total++
      const cat = classifyStatus(l.status_fidelidade)
      if (cat === 'fiel') map[m].fieis++
      if (cat === 'risco') map[m].risco++
    })
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 8)
  }, [liderancas])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#00101f] flex items-center justify-center">
        <LoadingSpinner text="Carregando Analytics..." />
      </div>
    )
  }

  const fieis   = fidelidadeDist.find((d) => d.name === 'Fiéis')?.value || 0
  const emRisco = fidelidadeDist.find((d) => d.name === 'Em Risco')?.value || 0

  return (
    <div className="min-h-screen bg-[#00101f]">

      {/* ── Header ── */}
      <header className="bg-[#001733] border-b border-[#002b5c] sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="w-9 h-9 rounded-xl border border-[#002b5c] hover:bg-[#002b5c]/60
              flex items-center justify-center text-slate-400 hover:text-white transition-colors shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#e11d48] rounded-xl flex items-center justify-center
              font-black text-white text-xs tracking-tight shadow-lg shadow-[#e11d48]/30">
              B360
            </div>
            <div>
              <p className="text-sm font-bold text-white leading-tight">Analytics · BOW 360</p>
              <p className="text-xs text-slate-500 leading-tight">Pansera 2026 · Painel Estratégico</p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-slate-500 hidden sm:block">
              {liderancas.length} lideranças · {entrevistas.length} entrevistas
            </span>
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Headline KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Total Lideranças"
            value={liderancas.length}
            color="text-white"
            icon={<svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
          />
          <StatCard
            label="Meta Caxias"
            value={formatVotes(totalVotos)}
            color="text-blue-400"
            icon={<svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
          />
          <StatCard
            label="Fiéis"
            value={fieis}
            sub={liderancas.length ? `${Math.round(fieis / liderancas.length * 100)}% da base` : '—'}
            color="text-emerald-400"
            icon={<svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
          <StatCard
            label="Em Risco"
            value={emRisco}
            sub={liderancas.length ? `${Math.round(emRisco / liderancas.length * 100)}% da base` : '—'}
            color="text-rose-400"
            icon={<svg className="w-5 h-5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
          />
        </div>

        {/* Score + Fidelidade dist */}
        <div className="grid md:grid-cols-3 gap-4">

          {/* Donut — Fidelidade */}
          <Section title="Distribuição de Fidelidade" sub="Classificação IA por status">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={fidelidadeDist}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {fidelidadeDist.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} stroke="transparent" />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(v) => <span className="text-xs text-slate-400">{v}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </Section>

          {/* Score médio */}
          <Section title="Score de Fidelidade" sub="Baseado nas entrevistas analisadas pela IA">
            {scoreStats ? (
              <div className="space-y-4">
                <div className="text-center py-3">
                  <p className="text-5xl font-black text-white">{scoreStats.avg}</p>
                  <p className="text-xs text-slate-500 mt-1">Score médio · base 100</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Mínimo', value: scoreStats.min, color: 'text-rose-400' },
                    { label: 'Médio',  value: scoreStats.avg, color: 'text-amber-400' },
                    { label: 'Máximo', value: scoreStats.max, color: 'text-emerald-400' },
                  ].map((s) => (
                    <div key={s.label} className="bg-[#002b5c]/30 rounded-xl p-2 text-center">
                      <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                      <p className="text-xs text-slate-500">{s.label}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-600 text-center">{scoreStats.total} entrevistas analisadas</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-40 text-slate-600">
                <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <p className="text-xs">Nenhum score disponível</p>
              </div>
            )}
          </Section>

          {/* Lideranças por município */}
          <Section title="Por Município" sub="Concentração geográfica da base">
            <div className="space-y-2 overflow-y-auto max-h-[220px] pr-1">
              {liderancasPorMunicipio.length ? liderancasPorMunicipio.map((m) => {
                const pct = liderancas.length ? Math.round(m.total / liderancas.length * 100) : 0
                return (
                  <div key={m.municipio}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-slate-300 truncate max-w-[60%]">{m.municipio}</span>
                      <span className="text-xs text-slate-500">{m.total} líderes · {pct}%</span>
                    </div>
                    <div className="h-1.5 bg-[#002b5c]/50 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#e11d48] rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              }) : (
                <p className="text-xs text-slate-600 text-center py-6">Sem dados de município</p>
              )}
            </div>
          </Section>
        </div>

        {/* Votos por território */}
        <Section title="Meta de Votos por Território" sub="Soma das metas declaradas (Caxias do Sul)">
          {votosPorTerritorio.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={votosPorTerritorio} margin={{ top: 0, right: 10, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#002b5c" />
                <XAxis
                  dataKey="territorio"
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  angle={-35}
                  textAnchor="end"
                  interval={0}
                  tickLine={false}
                />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="votos" name="Votos" fill="#e11d48" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-slate-600 text-center py-10">Sem dados de território</p>
          )}
        </Section>

        {/* Evolução Temporal */}
        {evolucaoTemporal.length > 1 && (
          <Section title="Evolução Temporal de Cadastros" sub="Lideranças cadastradas por semana">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={evolucaoTemporal} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradFiel" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradRisco" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#002b5c" />
                <XAxis dataKey="data" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="fieis"      name="Fiéis"      stroke="#10b981" fill="url(#gradFiel)"  strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="observando" name="Observando" stroke="#f59e0b" fill="none"            strokeWidth={2} dot={false} strokeDasharray="4 2" />
                <Area type="monotone" dataKey="risco"      name="Em Risco"   stroke="#f43f5e" fill="url(#gradRisco)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </Section>
        )}

        {/* Top 10 lideranças */}
        <Section title="Top 10 — Maior Meta de Votos" sub="Lideranças com maior potencial declarado">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-[#002b5c]">
                  <th className="pb-2 pr-4 text-xs text-slate-500 font-medium w-8">#</th>
                  <th className="pb-2 pr-4 text-xs text-slate-500 font-medium">Liderança</th>
                  <th className="pb-2 pr-4 text-xs text-slate-500 font-medium hidden sm:table-cell">Território</th>
                  <th className="pb-2 pr-4 text-xs text-slate-500 font-medium">Status</th>
                  <th className="pb-2 text-xs text-slate-500 font-medium text-right">Meta Caxias</th>
                </tr>
              </thead>
              <tbody>
                {top10.map((l, i) => {
                  const cat = classifyStatus(l.status_fidelidade)
                  return (
                    <tr
                      key={l.id}
                      className="border-b border-[#002b5c]/50 hover:bg-[#002b5c]/20 cursor-pointer transition-colors"
                      onClick={() => navigate(`/lideranca/${l.id}`)}
                    >
                      <td className="py-2.5 pr-4">
                        <span className={`text-xs font-bold ${i < 3 ? 'text-amber-400' : 'text-slate-600'}`}>
                          {i + 1}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          {l.foto_url ? (
                            <img src={l.foto_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-[#002b5c] flex items-center justify-center shrink-0">
                              <span className="text-xs font-bold text-slate-400">
                                {(l.nome_completo || '?')[0].toUpperCase()}
                              </span>
                            </div>
                          )}
                          <div>
                            <p className="text-white font-medium text-xs leading-tight">{l.nome_completo}</p>
                            {l.apelido_politico && (
                              <p className="text-slate-500 text-xs">{l.apelido_politico}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 hidden sm:table-cell">
                        <span className="text-xs text-slate-400">{l.territorio_principal || l.municipio || '—'}</span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded-full"
                          style={{
                            background: CORES[cat] + '22',
                            color: CORES[cat],
                            border: `1px solid ${CORES[cat]}44`,
                          }}
                        >
                          {statusLabel[cat]}
                        </span>
                      </td>
                      <td className="py-2.5 text-right">
                        <span className="text-white font-bold text-xs">{formatVotes(l.meta_votos_caxias)}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Section>

      </main>
    </div>
  )
}
