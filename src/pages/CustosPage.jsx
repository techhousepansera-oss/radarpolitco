import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { formatDate } from '../lib/utils'
import LoadingSpinner from '../components/LoadingSpinner'

// ── Preços Claude (USD por 1M tokens) ─────────────────────────────────────────
const PRECO_INPUT  = 3.00   // claude-sonnet-4-5
const PRECO_OUTPUT = 15.00
const BRL_PER_USD  = 5.70   // taxa de conversão aproximada

function calcCusto(input, output) {
  return (input / 1_000_000) * PRECO_INPUT + (output / 1_000_000) * PRECO_OUTPUT
}

function fmtUSD(v) {
  return v < 0.01 ? '< $0,01' : `$${v.toFixed(2)}`
}

function fmtBRL(v) {
  return `R$ ${(v * BRL_PER_USD).toFixed(2)}`
}

function fmtK(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function Stat({ label, value, sub, color = 'text-white', icon }) {
  return (
    <div className="bg-[#001733] border border-[#002b5c] rounded-2xl p-5 flex items-center gap-4">
      {icon && (
        <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-white/5 text-xl">
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

// ── Barra de progresso horizontal ────────────────────────────────────────────
function Bar({ pct, color = '#e11d48' }) {
  return (
    <div className="flex-1 h-1.5 bg-[#002b5c] rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function CustosPage() {
  const navigate = useNavigate()
  const [entrevistas, setEntrevistas] = useState([])
  const [liderancas, setLiderancas] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 20

  useEffect(() => {
    async function load() {
      try {
        const { data: ent, error: eErr } = await supabase
          .from('entrevistas')
          .select('id, lider_id, tokens_input, tokens_output, created_at')
          .order('created_at', { ascending: false })
        if (eErr) throw eErr

        const { data: lid } = await supabase
          .from('liderancas')
          .select('id, nome_completo, apelido_politico')
        const lidMap = {}
        ;(lid || []).forEach(l => { lidMap[l.id] = l })

        setEntrevistas(ent || [])
        setLiderancas(lidMap)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const stats = useMemo(() => {
    const totalInput  = entrevistas.reduce((s, e) => s + (e.tokens_input  || 0), 0)
    const totalOutput = entrevistas.reduce((s, e) => s + (e.tokens_output || 0), 0)
    const totalCusto  = calcCusto(totalInput, totalOutput)
    const comTokens   = entrevistas.filter(e => (e.tokens_input || 0) > 0).length
    const mediaInput  = comTokens > 0 ? Math.round(totalInput  / comTokens) : 0
    const mediaOutput = comTokens > 0 ? Math.round(totalOutput / comTokens) : 0
    const mediaCusto  = comTokens > 0 ? totalCusto / comTokens : 0
    return { totalInput, totalOutput, totalCusto, comTokens, mediaInput, mediaOutput, mediaCusto, total: entrevistas.length }
  }, [entrevistas])

  const maxCusto = useMemo(() => {
    return Math.max(...entrevistas.map(e => calcCusto(e.tokens_input || 0, e.tokens_output || 0)), 0.001)
  }, [entrevistas])

  const paginado = entrevistas.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(entrevistas.length / PAGE_SIZE)

  if (loading) {
    return (
      <div className="min-h-screen bg-[#00101f] flex items-center justify-center">
        <LoadingSpinner text="Carregando custos..." />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#00101f]">

      {/* Header */}
      <header className="bg-[#001733] border-b border-[#002b5c] sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="hidden sm:inline">Radar</span>
            </button>
            <span className="text-slate-700">›</span>
            <span className="text-sm font-semibold text-white">Custos & Tokens IA</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 bg-[#002b5c]/60 px-2.5 py-1 rounded-lg border border-[#003d82]/40">
              Claude Sonnet 4.5
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {error && (
          <div className="px-4 py-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-sm text-rose-400">
            {error}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat
            label="Custo Total"
            value={fmtUSD(stats.totalCusto)}
            sub={fmtBRL(stats.totalCusto)}
            color="text-emerald-400"
            icon="💰"
          />
          <Stat
            label="Entrevistas IA"
            value={stats.comTokens}
            sub={`de ${stats.total} no total`}
            color="text-white"
            icon="🎙️"
          />
          <Stat
            label="Tokens Enviados"
            value={fmtK(stats.totalInput)}
            sub={`~${fmtK(stats.mediaInput)} por entrevista`}
            color="text-sky-400"
            icon="📤"
          />
          <Stat
            label="Tokens Gerados"
            value={fmtK(stats.totalOutput)}
            sub={`~${fmtK(stats.mediaOutput)} por entrevista`}
            color="text-violet-400"
            icon="📥"
          />
        </div>

        {/* Custo médio por entrevista */}
        <div className="bg-[#001733] border border-[#002b5c] rounded-2xl p-6">
          <h2 className="text-sm font-bold text-white mb-5">Referência de Preços — Claude Sonnet 4.5</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'Input (prompt)',  preco: '$3,00 / 1M tokens',  cor: 'text-sky-400',    pct: 20 },
              { label: 'Output (resposta)', preco: '$15,00 / 1M tokens', cor: 'text-violet-400', pct: 100 },
              { label: 'Custo médio/entrevista', preco: fmtUSD(stats.mediaCusto), cor: 'text-emerald-400', pct: 50, sub: fmtBRL(stats.mediaCusto) },
            ].map(item => (
              <div key={item.label} className="bg-[#002050] border border-[#002b5c] rounded-xl p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{item.label}</p>
                <p className={`text-lg font-black ${item.cor}`}>{item.preco}</p>
                {item.sub && <p className="text-xs text-slate-500 mt-0.5">{item.sub}</p>}
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-600 mt-4">
            * Deepgram Nova-2: ~$0,0043/min · PDFShift: plano fixo · TTS OpenAI: $0,015/1k chars
          </p>
        </div>

        {/* Tabela por entrevista */}
        <div className="bg-[#001733] border border-[#002b5c] rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#002b5c] flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">Entrevistas — detalhe por liderança</h2>
            <span className="text-xs text-slate-500">{entrevistas.length} registros</span>
          </div>

          {entrevistas.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-slate-500 text-sm">Nenhuma entrevista com dados de token ainda.</p>
              <p className="text-slate-600 text-xs mt-1">Os tokens serão registrados nas próximas entrevistas processadas pelo n8n.</p>
            </div>
          ) : (
            <>
              {/* Header da tabela */}
              <div className="grid grid-cols-12 gap-2 px-6 py-2 bg-[#002050]/50 border-b border-[#002b5c]
                text-xs text-slate-500 uppercase tracking-wider font-semibold">
                <div className="col-span-4">Liderança</div>
                <div className="col-span-2 text-right">Input</div>
                <div className="col-span-2 text-right">Output</div>
                <div className="col-span-2 text-right">Custo USD</div>
                <div className="col-span-2 text-right">Data</div>
              </div>

              {paginado.map((ent) => {
                const lider = liderancas[ent.lider_id]
                const nome = lider?.apelido_politico || lider?.nome_completo || 'Desconhecido'
                const custo = calcCusto(ent.tokens_input || 0, ent.tokens_output || 0)
                const pct = Math.min(100, (custo / maxCusto) * 100)
                const semTokens = !ent.tokens_input && !ent.tokens_output

                return (
                  <div
                    key={ent.id}
                    onClick={() => lider && navigate(`/lideranca/${ent.lider_id}`)}
                    className="grid grid-cols-12 gap-2 px-6 py-3 border-b border-[#002b5c]/50
                      hover:bg-[#002050]/40 transition-colors cursor-pointer items-center"
                  >
                    <div className="col-span-4 flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-[#e11d48]/20 flex items-center justify-center
                        text-xs font-bold text-[#e11d48] shrink-0">
                        {nome.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm text-white truncate">{nome}</span>
                    </div>
                    <div className="col-span-2 text-right">
                      {semTokens
                        ? <span className="text-xs text-slate-600">—</span>
                        : <span className="text-sm text-sky-400 tabular-nums">{fmtK(ent.tokens_input || 0)}</span>
                      }
                    </div>
                    <div className="col-span-2 text-right">
                      {semTokens
                        ? <span className="text-xs text-slate-600">—</span>
                        : <span className="text-sm text-violet-400 tabular-nums">{fmtK(ent.tokens_output || 0)}</span>
                      }
                    </div>
                    <div className="col-span-2 text-right">
                      {semTokens ? (
                        <span className="text-xs text-slate-600 italic">sem dados</span>
                      ) : (
                        <div className="flex items-center gap-2 justify-end">
                          <Bar pct={pct} color={pct > 80 ? '#f43f5e' : pct > 50 ? '#f59e0b' : '#10b981'} />
                          <span className="text-sm text-emerald-400 tabular-nums shrink-0">{fmtUSD(custo)}</span>
                        </div>
                      )}
                    </div>
                    <div className="col-span-2 text-right text-xs text-slate-500">
                      {formatDate(ent.created_at)}
                    </div>
                  </div>
                )
              })}

              {/* Paginação */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4">
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-4 py-2 bg-[#002b5c]/60 hover:bg-[#002b5c] border border-[#003d82]/40
                      text-slate-300 rounded-xl text-xs font-semibold disabled:opacity-40 transition-colors"
                  >
                    ← Anterior
                  </button>
                  <span className="text-xs text-slate-500">
                    Página {page + 1} de {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={page === totalPages - 1}
                    className="px-4 py-2 bg-[#002b5c]/60 hover:bg-[#002b5c] border border-[#003d82]/40
                      text-slate-300 rounded-xl text-xs font-semibold disabled:opacity-40 transition-colors"
                  >
                    Próxima →
                  </button>
                </div>
              )}
            </>
          )}
        </div>

      </main>
    </div>
  )
}
