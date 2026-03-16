import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { parseAnalise, formatVotes, formatDate, getFidelidadeConfig } from '../lib/utils'
import FidelidadeBadge from '../components/FidelidadeBadge'
import AudioPlayer from '../components/AudioPlayer'
import LoadingSpinner from '../components/LoadingSpinner'
import { ToastContainer } from '../components/Toast'
import { useToast } from '../hooks/useToast'

const STATUS_OPTIONS = ['Fiel', 'Leal', 'Observando', 'Moderado', 'Em Risco', 'Baixa Fidelidade', 'Crítico']

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Quebra a transcrição bruta em parágrafos + detecta perguntas */
function formatTranscricao(texto) {
  if (!texto) return []

  const gatilhos = [
    'qual o seu nome', 'qual o apelido', 'como começou', 'você conheceu',
    'você é da', 'qual a diferença', 'como que você entra', 'participa de',
    'você vai fazer', 'quantos alunos', 'como que é esse projeto',
    'quais são as principais', 'quem seriam os adversários', 'quantos votos',
    'quais serão as estratégias', 'se disponibilizaria', 'em quais zonas',
    'qual é a dificuldade', 'características', 'as pessoas mais lembram',
    'associação partidária', 'focaria no candidato', 'me fala sobre',
    'como você avalia', 'o que você acha',
  ]

  const lower = texto.toLowerCase()
  const blocos = []
  let ultimoIdx = 0
  const encontrados = []

  gatilhos.forEach((g) => {
    let idx = 0
    while ((idx = lower.indexOf(g, idx)) !== -1) {
      encontrados.push({ idx, g })
      idx += g.length
    }
  })

  encontrados.sort((a, b) => a.idx - b.idx)

  if (encontrados.length === 0) {
    // Sem perguntas detectadas: divide em parágrafos por sentenças
    const sentences = texto
      .replace(/([.!?])\s+([A-ZÁÉÍÓÚÀÂÊÔÃÕÇ])/g, '$1\n$2')
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 5)

    let current = []
    sentences.forEach((s, i) => {
      current.push(s)
      if (current.length >= 4 || i === sentences.length - 1) {
        blocos.push({ tipo: 'paragrafo', texto: current.join(' ') })
        current = []
      }
    })
    return blocos
  }

  // Com perguntas: formata como Q&A
  encontrados.forEach((item, i) => {
    const inicio = item.idx
    const fim = i + 1 < encontrados.length ? encontrados[i + 1].idx : texto.length

    // Acha fim da pergunta (próximo ? ou . após o gatilho)
    let fimPergunta = texto.indexOf('?', inicio)
    if (fimPergunta === -1 || fimPergunta > inicio + 150) fimPergunta = inicio + 80
    const pergunta = texto.slice(inicio, fimPergunta + 1).trim()
    const resposta = texto.slice(fimPergunta + 1, fim).trim()

    if (pergunta) blocos.push({ tipo: 'pergunta', texto: pergunta })
    if (resposta) blocos.push({ tipo: 'resposta', texto: resposta })
  })

  return blocos
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function DetalhesPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toasts, toast, dismiss } = useToast()
  const [lider, setLider] = useState(null)
  const [entrevista, setEntrevista] = useState(null)
  const [analise, setAnalise] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Tabs
  const [activeTab, setActiveTab] = useState('dossie')

  // Follow-ups
  const [followUps, setFollowUps] = useState([])
  const [followForm, setFollowForm] = useState({ titulo: '', descricao: '', data_agendada: '' })
  const [savingFollow, setSavingFollow] = useState(false)

  const fetchFollowUps = async () => {
    const { data } = await supabase
      .from('follow_ups')
      .select('*')
      .eq('lider_id', id)
      .order('data_agendada', { ascending: true })
    setFollowUps(data || [])
  }

  const handleAddFollowUp = async (e) => {
    e.preventDefault()
    if (!followForm.titulo.trim() || !followForm.data_agendada) return
    setSavingFollow(true)
    const { error: err } = await supabase.from('follow_ups').insert({
      lider_id: id,
      titulo: followForm.titulo.trim(),
      descricao: followForm.descricao.trim() || null,
      data_agendada: followForm.data_agendada,
      status: 'pendente',
    })
    setSavingFollow(false)
    if (err) {
      toast('Erro ao agendar: ' + err.message, 'error')
    } else {
      toast('Follow-up agendado!', 'success')
      setFollowForm({ titulo: '', descricao: '', data_agendada: '' })
      fetchFollowUps()
    }
  }

  const handleToggleFollowUp = async (f) => {
    const newStatus = f.status === 'concluido' ? 'pendente' : 'concluido'
    await supabase.from('follow_ups').update({ status: newStatus }).eq('id', f.id)
    setFollowUps((prev) => prev.map((x) => x.id === f.id ? { ...x, status: newStatus } : x))
  }

  const handleDeleteFollowUp = async (fId) => {
    await supabase.from('follow_ups').delete().eq('id', fId)
    setFollowUps((prev) => prev.filter((x) => x.id !== fId))
    toast('Follow-up removido', 'info')
  }

  // Edit form
  const [editForm, setEditForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  // TTS Web Speech
  const [speaking, setSpeaking] = useState(false)

  // Copy to clipboard
  const [copied, setCopied] = useState(false)
  const copyResumo = async () => {
    const text = analise?.analise_fria?.resumo_executivo
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast('Resumo copiado para a área de transferência', 'success')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast('Não foi possível copiar', 'error')
    }
  }

  // Delete
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDeleteLider = async () => {
    setDeleting(true)
    try {
      await supabase.from('entrevistas').delete().eq('lider_id', id)
      const { error: err } = await supabase.from('liderancas').delete().eq('id', id)
      if (err) throw err
      navigate('/')
    } catch (e) {
      toast('Erro ao apagar: ' + e.message, 'error')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const { data: l, error: lErr } = await supabase
          .from('liderancas').select('*').eq('id', id).single()
        if (lErr) throw lErr
        setLider(l)

        const { data: e } = await supabase
          .from('entrevistas').select('*').eq('lider_id', id)
          .order('id', { ascending: false }).limit(1).maybeSingle()

        if (e) {
          setEntrevista(e)
          setAnalise(parseAnalise(e.analise_json))
        }

        // Load follow-ups (silently — table might not exist yet)
        const { data: fu } = await supabase
          .from('follow_ups')
          .select('*')
          .eq('lider_id', id)
          .order('data_agendada', { ascending: true })
        setFollowUps(fu || [])
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  // Preenche o form de edição com dados do banco + sugestões da IA
  useEffect(() => {
    if (!lider) return
    const af = analise?.analise_fria || {}
    const perfil = analise?.perfil || {}
    const metas = analise?.metas || {}
    setEditForm({
      nome_completo:       lider.nome_completo || perfil.nome || '',
      apelido_politico:    lider.apelido_politico || perfil.apelido || '',
      territorio_principal:lider.territorio_principal || perfil.distrito || '',
      municipio:           lider.municipio || 'Duque de Caxias',
      status_fidelidade:   lider.status_fidelidade || 'Observando',
      meta_votos_caxias:   lider.meta_votos_caxias || metas.votos_caxias || 0,
      meta_votos_estado:   lider.meta_votos_estado || metas.votos_estado || 0,
      perfil_social_link:  lider.perfil_social_link || '',
      foto_url:            lider.foto_url || '',
    })
  }, [lider, analise])

  // Web Speech TTS
  const speakSummary = () => {
    if (!('speechSynthesis' in window)) return
    const af = analise?.analise_fria || {}
    const texto = af.resumo_executivo
    if (!texto) return
    if (speaking) {
      window.speechSynthesis.cancel()
      setSpeaking(false)
      return
    }
    const utt = new SpeechSynthesisUtterance(texto)
    utt.lang = 'pt-BR'
    utt.rate = 0.88
    utt.pitch = 1
    utt.onend = () => setSpeaking(false)
    utt.onerror = () => setSpeaking(false)
    window.speechSynthesis.speak(utt)
    setSpeaking(true)
  }

  const saveEdit = async (e) => {
    e.preventDefault()
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    const payload = {
      nome_completo:        editForm.nome_completo,
      apelido_politico:     editForm.apelido_politico || null,
      territorio_principal: editForm.territorio_principal || null,
      municipio:            editForm.municipio || 'Duque de Caxias',
      status_fidelidade:    editForm.status_fidelidade,
      meta_votos_caxias:    Number(editForm.meta_votos_caxias) || 0,
      meta_votos_estado:    Number(editForm.meta_votos_estado) || 0,
      perfil_social_link:   editForm.perfil_social_link || null,
      foto_url:             editForm.foto_url || null,
    }
    const { error: err } = await supabase.from('liderancas').update(payload).eq('id', id)
    setSaving(false)
    savingRef.current = false
    if (err) {
      toast(err.message, 'error')
    } else {
      setLider((prev) => ({ ...prev, ...payload }))
      toast('Cadastro atualizado com sucesso!', 'success')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#00101f] flex items-center justify-center">
        <LoadingSpinner text="Carregando dossiê..." />
      </div>
    )
  }

  if (error || !lider) {
    return (
      <div className="min-h-screen bg-[#00101f] flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-rose-400 mb-4 text-sm">{error || 'Liderança não encontrada'}</p>
          <button onClick={() => navigate('/')} className="text-slate-400 underline text-sm">
            Voltar ao Radar
          </button>
        </div>
      </div>
    )
  }

  const af = analise?.analise_fria || {}
  const hist = analise?.historico || {}
  const metas = analise?.metas || {}
  const totalVotos = (Number(lider.meta_votos_caxias) || 0) + (Number(lider.meta_votos_estado) || 0)
  const blocosTranscricao = formatTranscricao(entrevista?.transcricao_bruta)

  return (
    <div className="min-h-screen bg-[#00101f]">

      {/* ── Header ── */}
      <header className="bg-[#001733] border-b border-[#002b5c] sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm
                transition-colors shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="hidden sm:inline">Radar</span>
            </button>
            <span className="text-slate-700">›</span>
            <span className="text-sm font-semibold text-white truncate">
              {lider.apelido_politico || lider.nome_completo}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setConfirmDelete(true)}
              title="Apagar liderança"
              className="w-9 h-9 rounded-xl border border-rose-500/30 hover:bg-rose-500/10
                flex items-center justify-center text-rose-500/60 hover:text-rose-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            {lider.perfil_social_link && (
              <a href={lider.perfil_social_link} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 bg-[#002b5c] hover:bg-[#003d82]
                  rounded-xl text-sm text-white transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                <span className="hidden sm:inline">Perfil</span>
              </a>
            )}
            {entrevista?.pdf_url && (
              <a href={entrevista.pdf_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 bg-[#e11d48] hover:bg-[#c81940]
                  rounded-xl text-sm text-white font-semibold transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                PDF
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

        {/* ── Hero ── */}
        <div className="bg-gradient-to-br from-[#002b5c] to-[#001733] rounded-2xl p-6 mb-6
          border border-[#003d82]/40 shadow-xl shadow-[#001020]/50">
          <div className="flex flex-col sm:flex-row sm:items-start gap-5">
            {lider.foto_url ? (
              <img
                src={lider.foto_url}
                alt={lider.nome_completo}
                className="w-16 h-16 rounded-2xl object-cover border border-[#003d82]/60 shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-[#e11d48]/20 border border-[#e11d48]/30
                flex items-center justify-center text-3xl font-black text-[#e11d48] shrink-0">
                {(lider.apelido_politico || lider.nome_completo || '?').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-3 mb-1">
                <h1 className="text-2xl font-black text-white">
                  {lider.apelido_politico || lider.nome_completo}
                </h1>
                <FidelidadeBadge status={lider.status_fidelidade} size="lg" />
              </div>
              {lider.apelido_politico && (
                <p className="text-slate-400 text-sm mb-2">{lider.nome_completo}</p>
              )}
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-400">
                {lider.territorio_principal && (
                  <span className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    </svg>
                    {lider.territorio_principal}
                  </span>
                )}
                {lider.municipio && (
                  <span className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    {lider.municipio}
                  </span>
                )}
                {entrevista?.created_at && (
                  <span>Entrevistado em {formatDate(entrevista.created_at)}</span>
                )}
              </div>
            </div>
            <div className="sm:text-right shrink-0">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Meta Total</p>
              <p className="text-3xl font-black text-white tabular-nums">{formatVotes(totalVotos)}</p>
              <p className="text-xs text-slate-500">votos esperados</p>
            </div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 bg-[#001733] border border-[#002b5c] rounded-2xl p-1.5 mb-6">
          {[
            { id: 'dossie',     label: 'Dossiê',        icon: '🧠' },
            { id: 'transcricao',label: 'Transcrição',   icon: '📝' },
            { id: 'agenda',     label: 'Agenda',        icon: '📅', badge: followUps.filter(f => f.status === 'pendente').length },
            { id: 'cadastro',   label: 'Editar Cadastro', icon: '✏️' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl
                text-sm font-semibold transition-all relative ${
                activeTab === tab.id
                  ? 'bg-[#e11d48] text-white shadow-lg shadow-[#e11d48]/20'
                  : 'text-slate-400 hover:text-white hover:bg-[#002b5c]/60'
              }`}
            >
              <span>{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
              {tab.badge > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-white text-[10px]
                  font-bold rounded-full flex items-center justify-center">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════
            ABA 1: DOSSIÊ
        ══════════════════════════════════════════════ */}
        {activeTab === 'dossie' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* Coluna esquerda */}
            <div className="lg:col-span-2 space-y-5">

              {/* Resumo Executivo com botão TTS */}
              <InfoCard
                title="Resumo Executivo"
                subtitle="Claude 4.5 — para ler no carro"
                icon={<DocIcon />}
                action={
                  af.resumo_executivo ? (
                    <div className="flex items-center gap-1.5">
                      {/* Copy button */}
                      <button
                        onClick={copyResumo}
                        title="Copiar resumo"
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold
                          transition-all border ${
                          copied
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                            : 'bg-[#002b5c]/60 border-[#003d82]/40 text-slate-300 hover:text-white hover:bg-[#002b5c]'
                        }`}
                      >
                        {copied ? (
                          <>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Copiado
                          </>
                        ) : (
                          <>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            Copiar
                          </>
                        )}
                      </button>

                      {/* TTS button */}
                      {'speechSynthesis' in window && (
                        <button
                          onClick={speakSummary}
                          title={speaking ? 'Parar áudio' : 'Ouvir resumo'}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold
                            transition-all border ${
                            speaking
                              ? 'bg-[#e11d48]/20 border-[#e11d48]/40 text-[#e11d48] animate-pulse'
                              : 'bg-[#002b5c]/60 border-[#003d82]/40 text-slate-300 hover:text-white hover:bg-[#002b5c]'
                          }`}
                        >
                          {speaking ? (
                            <>
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
                              </svg>
                              Parar
                            </>
                          ) : (
                            <>
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                              </svg>
                              Ouvir
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  ) : null
                }
              >
                {af.resumo_executivo ? (
                  <p className="text-slate-200 leading-relaxed">{af.resumo_executivo}</p>
                ) : (
                  <NoData text="Resumo de IA não disponível para esta liderança." />
                )}
              </InfoCard>

              {/* Ponto de Traição */}
              <InfoCard
                title="Ponto de Traição"
                subtitle="O que faria ele mudar de lado?"
                variant="danger"
                icon={<WarnIcon />}
              >
                {af.ponto_de_traicao ? (
                  <p className="text-rose-200 leading-relaxed">{af.ponto_de_traicao}</p>
                ) : (
                  <NoData text="Sem dados suficientes para identificar o ponto de ruptura." />
                )}
              </InfoCard>

              {/* Reação PT + Adversário */}
              {(af.reacao_pt || af.adversario_local) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {af.reacao_pt && (
                    <InfoCard title="Reação ao PT" icon={<ChatIcon />}>
                      <p className="text-slate-300 text-sm leading-relaxed">{af.reacao_pt}</p>
                    </InfoCard>
                  )}
                  {af.adversario_local && (
                    <InfoCard title="Adversário Local" icon={<PersonIcon />}>
                      <p className="text-slate-300 text-sm leading-relaxed">{af.adversario_local}</p>
                    </InfoCard>
                  )}
                </div>
              )}

              {/* Histórico */}
              {(hist.tempo_politica || hist.vinculo_pansera) && (
                <InfoCard title="Histórico Político" icon={<ClockIcon />}>
                  <div className="space-y-3">
                    {hist.tempo_politica && (
                      <div>
                        <p className="text-xs text-slate-500 mb-0.5">Tempo em Política</p>
                        <p className="text-sm text-slate-200">{hist.tempo_politica}</p>
                      </div>
                    )}
                    {hist.vinculo_pansera && (
                      <div>
                        <p className="text-xs text-slate-500 mb-0.5">Vínculo com Pansera</p>
                        <p className="text-sm text-slate-200">{hist.vinculo_pansera}</p>
                      </div>
                    )}
                  </div>
                </InfoCard>
              )}

              {/* Bairros / Territórios de Influência */}
              {analise?.bairros && analise.bairros.length > 0 && (
                <InfoCard title="Territórios de Influência" subtitle="Bairros mapeados na entrevista" icon={<MapIcon />}>
                  <div className="flex flex-wrap gap-2">
                    {(Array.isArray(analise.bairros) ? analise.bairros : String(analise.bairros).split(/[,;]+/))
                      .map((b, i) => String(b).trim()).filter(Boolean).map((bairro, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 bg-[#002b5c]/60 border border-[#003d82]/50
                          rounded-lg text-xs font-medium text-slate-300 flex items-center gap-1.5"
                      >
                        <svg className="w-2.5 h-2.5 text-[#e11d48] shrink-0" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                        </svg>
                        {bairro}
                      </span>
                    ))}
                  </div>
                </InfoCard>
              )}
            </div>

            {/* Coluna direita */}
            <div className="space-y-5">
              <InfoCard title="Projeção de Votos" icon={<ChartIcon />}>
                <div className="space-y-2.5">
                  <MetricRow label="Meta Caxias" value={formatVotes(lider.meta_votos_caxias)} />
                  <MetricRow label="Meta Estado" value={formatVotes(lider.meta_votos_estado)} />
                  {entrevista?.expectativa_votos_declarada && (
                    <MetricRow label="Declarado" value={formatVotes(entrevista.expectativa_votos_declarada)} />
                  )}
                  <div className="border-t border-[#002b5c] pt-2.5 mt-2">
                    <MetricRow label="Total Esperado" value={formatVotes(totalVotos)} highlight />
                  </div>
                  {(metas.votos_caxias || metas.votos_estado) && (
                    <p className="text-xs text-slate-600 bg-[#002b5c]/30 rounded-lg p-2 leading-relaxed">
                      IA estimou: {formatVotes(metas.votos_caxias)} (Caxias) + {formatVotes(metas.votos_estado)} (Estado)
                    </p>
                  )}
                </div>
              </InfoCard>

              <InfoCard title="Áudio do Resumo" subtitle="TTS · OpenAI Onyx" icon={<MusicIcon />}>
                <AudioPlayer
                  src={entrevista?.audio_url}
                  title={lider.apelido_politico || lider.nome_completo}
                />
              </InfoCard>

              {entrevista?.pdf_url ? (
                <a href={entrevista.pdf_url} target="_blank" rel="noopener noreferrer" className="block group">
                  <div className="bg-[#001733] border border-[#002b5c] group-hover:border-[#e11d48]/40
                    rounded-2xl p-5 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#e11d48]/20 rounded-xl flex items-center justify-center shrink-0">
                        <svg className="w-5 h-5 text-[#e11d48]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white group-hover:text-[#e11d48] transition-colors">
                          Relatório PDF
                        </p>
                        <p className="text-xs text-slate-500">Abrir dossiê completo</p>
                      </div>
                      <svg className="w-4 h-4 text-slate-500 group-hover:text-[#e11d48] transition-colors shrink-0"
                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </div>
                  </div>
                </a>
              ) : (
                <div className="bg-[#001733] border border-[#002b5c]/50 rounded-2xl p-5">
                  <div className="flex items-center gap-3 text-slate-600">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium">PDF não disponível</p>
                      <p className="text-xs text-slate-700 mt-0.5">Verifique o nó PDFShift no n8n</p>
                    </div>
                  </div>
                </div>
              )}

              <InfoCard title="Diagnóstico IA" icon={<BulbIcon />}>
                <div className="space-y-2.5">
                  <DiagRow label="Status" value={<FidelidadeBadge status={lider.status_fidelidade} size="sm" />} />
                  {entrevista?.score_fidelidade && (
                    <ScoreRow score={entrevista.score_fidelidade} />
                  )}
                  {analise?.perfil?.profissao && <DiagRow label="Profissão" value={analise.perfil.profissao} />}
                  {analise?.perfil?.distrito && <DiagRow label="Distrito" value={analise.perfil.distrito} />}
                  {lider.created_at && <DiagRow label="Cadastrado" value={formatDate(lider.created_at)} />}
                </div>
              </InfoCard>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            ABA 2: TRANSCRIÇÃO FORMATADA
        ══════════════════════════════════════════════ */}
        {activeTab === 'transcricao' && (
          <div className="space-y-4">
            {blocosTranscricao.length === 0 ? (
              <div className="bg-[#001733] border border-[#002b5c] rounded-2xl p-12 text-center">
                <svg className="w-10 h-10 text-slate-700 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-slate-500">Nenhuma transcrição disponível para esta liderança.</p>
              </div>
            ) : (
              <>
                {/* Info header */}
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Transcrição Deepgram · Formatada por IA
                    </span>
                    <span className="text-xs bg-[#002b5c] text-slate-400 px-2 py-0.5 rounded-full">
                      {blocosTranscricao.length} blocos
                    </span>
                  </div>
                  <span className="text-xs text-slate-600">
                    {entrevista?.created_at ? formatDate(entrevista.created_at) : ''}
                  </span>
                </div>

                {/* Blocos */}
                <div className="space-y-3">
                  {blocosTranscricao.map((bloco, i) => {
                    if (bloco.tipo === 'pergunta') {
                      return (
                        <div key={i} className="flex gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/30
                            flex items-center justify-center text-xs font-black text-blue-400 shrink-0 mt-0.5">
                            P
                          </div>
                          <div className="flex-1 bg-blue-950/30 border border-blue-500/20 rounded-2xl
                            rounded-tl-sm px-4 py-3">
                            <p className="text-sm font-semibold text-blue-200 leading-relaxed">
                              {bloco.texto}
                            </p>
                          </div>
                        </div>
                      )
                    }
                    if (bloco.tipo === 'resposta') {
                      return (
                        <div key={i} className="flex gap-3 pl-4">
                          <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30
                            flex items-center justify-center text-xs font-black text-emerald-400 shrink-0 mt-0.5">
                            R
                          </div>
                          <div className="flex-1 bg-[#001733] border border-[#002b5c] rounded-2xl
                            rounded-tl-sm px-4 py-3">
                            <p className="text-sm text-slate-300 leading-relaxed">{bloco.texto}</p>
                          </div>
                        </div>
                      )
                    }
                    // Parágrafo simples
                    return (
                      <div key={i}
                        className="bg-[#001733] border border-[#002b5c] rounded-2xl px-5 py-4">
                        <p className="text-sm text-slate-300 leading-relaxed">{bloco.texto}</p>
                      </div>
                    )
                  })}
                </div>

                {/* Transcrição bruta como referência */}
                <details className="bg-[#001428] border border-[#002b5c]/50 rounded-2xl overflow-hidden mt-4">
                  <summary className="flex items-center gap-2 px-5 py-3 cursor-pointer
                    text-xs font-semibold text-slate-500 hover:text-slate-400 transition-colors list-none">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                    Ver transcrição bruta (texto original)
                  </summary>
                  <div className="px-5 pb-5">
                    <p className="text-xs text-slate-500 leading-relaxed font-mono whitespace-pre-wrap
                      max-h-60 overflow-y-auto">
                      {entrevista.transcricao_bruta}
                    </p>
                  </div>
                </details>
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════
            ABA 3: AGENDA DE FOLLOW-UPS
        ══════════════════════════════════════════════ */}
        {activeTab === 'agenda' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* Lista de follow-ups */}
            <div className="lg:col-span-2 space-y-3">
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">
                Próximos Contatos
              </h2>

              {followUps.length === 0 && (
                <div className="bg-[#001733] border border-[#002b5c] rounded-2xl p-8 text-center">
                  <div className="w-12 h-12 bg-[#002b5c] rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-sm text-slate-500">Nenhum follow-up agendado</p>
                  <p className="text-xs text-slate-600 mt-1">Use o formulário ao lado para agendar</p>
                </div>
              )}

              {followUps.map((f) => {
                const isPast = new Date(f.data_agendada) < new Date() && f.status === 'pendente'
                const isConcluido = f.status === 'concluido'
                return (
                  <div
                    key={f.id}
                    className={`flex items-start gap-3 p-4 rounded-2xl border transition-all ${
                      isConcluido
                        ? 'bg-[#001020] border-[#001a30]/60 opacity-60'
                        : isPast
                        ? 'bg-rose-950/20 border-rose-500/25'
                        : 'bg-[#001733] border-[#002b5c]'
                    }`}
                  >
                    {/* Checkbox */}
                    <button
                      onClick={() => handleToggleFollowUp(f)}
                      className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center shrink-0 mt-0.5
                        transition-all ${
                        isConcluido
                          ? 'bg-emerald-500 border-emerald-500'
                          : 'border-[#003d82] hover:border-emerald-500'
                      }`}
                    >
                      {isConcluido && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`text-sm font-semibold ${isConcluido ? 'line-through text-slate-600' : 'text-white'}`}>
                          {f.titulo}
                        </p>
                        {isPast && (
                          <span className="text-xs bg-rose-500/20 text-rose-400 border border-rose-500/30 px-1.5 py-0.5 rounded-lg font-medium">
                            Atrasado
                          </span>
                        )}
                      </div>
                      {f.descricao && (
                        <p className="text-xs text-slate-500 mt-0.5">{f.descricao}</p>
                      )}
                      <p className={`text-xs mt-1 ${isPast ? 'text-rose-400' : 'text-slate-500'}`}>
                        📅 {new Date(f.data_agendada).toLocaleString('pt-BR', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    </div>

                    <button
                      onClick={() => handleDeleteFollowUp(f.id)}
                      className="text-slate-700 hover:text-rose-400 transition-colors shrink-0"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )
              })}
            </div>

            {/* Formulário de novo follow-up */}
            <div>
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">
                Agendar Contato
              </h2>
              <form
                onSubmit={handleAddFollowUp}
                className="bg-[#001733] border border-[#002b5c] rounded-2xl p-5 space-y-4"
              >
                <div>
                  <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">Assunto *</label>
                  <input
                    type="text"
                    value={followForm.titulo}
                    onChange={(e) => setFollowForm(f => ({ ...f, titulo: e.target.value }))}
                    placeholder="Ex: Confirmar apoio no bairro..."
                    required
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">Observações</label>
                  <textarea
                    value={followForm.descricao}
                    onChange={(e) => setFollowForm(f => ({ ...f, descricao: e.target.value }))}
                    placeholder="Detalhes, pontos a discutir..."
                    rows={3}
                    className={inputCls + ' resize-none'}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">Data e Hora *</label>
                  <input
                    type="datetime-local"
                    value={followForm.data_agendada}
                    onChange={(e) => setFollowForm(f => ({ ...f, data_agendada: e.target.value }))}
                    required
                    className={inputCls}
                  />
                </div>
                <button
                  type="submit"
                  disabled={savingFollow}
                  className="w-full py-3 bg-[#e11d48] hover:bg-[#c81940] disabled:opacity-60
                    text-white rounded-xl font-bold text-sm transition-colors
                    flex items-center justify-center gap-2"
                >
                  {savingFollow && (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  {savingFollow ? 'Agendando...' : '📅 Agendar Follow-up'}
                </button>

                {/* Quick-add presets */}
                <div className="pt-2 border-t border-[#002b5c]/60">
                  <p className="text-xs text-slate-600 mb-2">Atalhos rápidos:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: 'Amanhã', days: 1 },
                      { label: '1 semana', days: 7 },
                      { label: '1 mês', days: 30 },
                    ].map(({ label, days }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => {
                          const d = new Date()
                          d.setDate(d.getDate() + days)
                          d.setHours(10, 0, 0, 0)
                          const local = d.toISOString().slice(0, 16)
                          setFollowForm(f => ({ ...f, data_agendada: local }))
                        }}
                        className="px-2 py-1 bg-[#002b5c]/50 hover:bg-[#002b5c] border border-[#003d82]/40
                          text-xs text-slate-400 hover:text-white rounded-lg transition-colors"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            ABA 4: EDITAR CADASTRO (IA pré-preenche)
        ══════════════════════════════════════════════ */}
        {activeTab === 'cadastro' && editForm && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* Form */}
            <div className="lg:col-span-2">
              <div className="bg-[#001733] border border-[#002b5c] rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-7 h-7 rounded-lg bg-[#002b5c] flex items-center justify-center">
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Editar Cadastro</h3>
                    <p className="text-xs text-slate-500">Campos pré-preenchidos pela IA · confirme e salve</p>
                  </div>
                </div>

                <form onSubmit={saveEdit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                    <EditField
                      label="Nome Completo"
                      aiValue={analise?.perfil?.nome}
                      currentValue={lider.nome_completo}
                    >
                      <input
                        type="text" required
                        value={editForm.nome_completo}
                        onChange={(e) => setEditForm(f => ({ ...f, nome_completo: e.target.value }))}
                        className={inputCls}
                      />
                    </EditField>

                    <EditField
                      label="Apelido Político"
                      aiValue={analise?.perfil?.apelido}
                      currentValue={lider.apelido_politico}
                    >
                      <input
                        type="text"
                        value={editForm.apelido_politico}
                        onChange={(e) => setEditForm(f => ({ ...f, apelido_politico: e.target.value }))}
                        className={inputCls}
                      />
                    </EditField>

                    <EditField
                      label="Território Principal"
                      aiValue={analise?.perfil?.distrito}
                      currentValue={lider.territorio_principal}
                      onApplyAI={() => setEditForm(f => ({ ...f, territorio_principal: analise?.perfil?.distrito || '' }))}
                    >
                      <input
                        type="text"
                        value={editForm.territorio_principal}
                        onChange={(e) => setEditForm(f => ({ ...f, territorio_principal: e.target.value }))}
                        className={inputCls}
                      />
                    </EditField>

                    <EditField label="Município">
                      <input
                        type="text"
                        value={editForm.municipio}
                        onChange={(e) => setEditForm(f => ({ ...f, municipio: e.target.value }))}
                        className={inputCls}
                      />
                    </EditField>

                    <EditField
                      label="Status de Fidelidade"
                      aiValue={analise?.analise_fria?.status_fidelidade}
                      currentValue={lider.status_fidelidade}
                      onApplyAI={() => {
                        const raw = analise?.analise_fria?.status_fidelidade || ''
                        const norm = normalizeStatusForForm(raw)
                        setEditForm(f => ({ ...f, status_fidelidade: norm }))
                      }}
                    >
                      <select
                        value={editForm.status_fidelidade}
                        onChange={(e) => setEditForm(f => ({ ...f, status_fidelidade: e.target.value }))}
                        className={inputCls}
                      >
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </EditField>

                    <EditField
                      label="Meta Votos (Caxias)"
                      aiValue={analise?.metas?.votos_caxias ? String(analise.metas.votos_caxias) : null}
                      currentValue={String(lider.meta_votos_caxias || 0)}
                      onApplyAI={() => setEditForm(f => ({ ...f, meta_votos_caxias: analise?.metas?.votos_caxias || 0 }))}
                    >
                      <input
                        type="number" min={0}
                        value={editForm.meta_votos_caxias}
                        onChange={(e) => setEditForm(f => ({ ...f, meta_votos_caxias: e.target.value }))}
                        className={inputCls}
                      />
                    </EditField>

                    <EditField
                      label="Meta Votos (Estado)"
                      aiValue={analise?.metas?.votos_estado ? String(analise.metas.votos_estado) : null}
                      currentValue={String(lider.meta_votos_estado || 0)}
                      onApplyAI={() => setEditForm(f => ({ ...f, meta_votos_estado: analise?.metas?.votos_estado || 0 }))}
                    >
                      <input
                        type="number" min={0}
                        value={editForm.meta_votos_estado}
                        onChange={(e) => setEditForm(f => ({ ...f, meta_votos_estado: e.target.value }))}
                        className={inputCls}
                      />
                    </EditField>

                    <EditField label="Link Social">
                      <input
                        type="url"
                        value={editForm.perfil_social_link}
                        onChange={(e) => setEditForm(f => ({ ...f, perfil_social_link: e.target.value }))}
                        placeholder="https://instagram.com/..."
                        className={inputCls}
                      />
                    </EditField>

                    <EditField label="Foto (URL)" className="sm:col-span-2">
                      <input
                        type="url"
                        value={editForm.foto_url}
                        onChange={(e) => setEditForm(f => ({ ...f, foto_url: e.target.value }))}
                        placeholder="https://..."
                        className={inputCls}
                      />
                      {editForm.foto_url && (
                        <div className="mt-2 flex items-center gap-3">
                          <img
                            src={editForm.foto_url}
                            alt="Preview"
                            className="w-12 h-12 rounded-xl object-cover border border-[#003d82]/60 shrink-0"
                            onError={(e) => { e.currentTarget.style.display = 'none' }}
                          />
                          <span className="text-xs text-slate-500">Preview da foto</span>
                        </div>
                      )}
                    </EditField>

                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        // Restaura os valores originais do banco
                        const af2 = analise?.analise_fria || {}
                        const p = analise?.perfil || {}
                        const m = analise?.metas || {}
                        setEditForm({
                          nome_completo:        lider.nome_completo || p.nome || '',
                          apelido_politico:     lider.apelido_politico || p.apelido || '',
                          territorio_principal: lider.territorio_principal || p.distrito || '',
                          municipio:            lider.municipio || 'Duque de Caxias',
                          status_fidelidade:    lider.status_fidelidade || 'Observando',
                          meta_votos_caxias:    lider.meta_votos_caxias || m.votos_caxias || 0,
                          meta_votos_estado:    lider.meta_votos_estado || m.votos_estado || 0,
                          perfil_social_link:   lider.perfil_social_link || '',
                          foto_url:             lider.foto_url || '',
                        })
                      }}
                      className="flex-1 py-3 bg-[#002b5c]/50 hover:bg-[#002b5c] border border-[#003d82]/40
                        text-slate-300 rounded-xl font-semibold text-sm transition-colors"
                    >
                      Restaurar
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex-1 py-3 bg-[#e11d48] hover:bg-[#c81940] disabled:opacity-60
                        disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm
                        transition-colors flex items-center justify-center gap-2"
                    >
                      {saving && (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      )}
                      {saving ? 'Salvando...' : 'Salvar Alterações'}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Painel de sugestões da IA */}
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-purple-950/40 to-[#001733] border border-purple-500/20
                rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-purple-500/20 flex items-center justify-center">
                    <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">IA Detectou</h3>
                    <p className="text-xs text-purple-400">Claude 4.5 · Dados extraídos</p>
                  </div>
                </div>

                {analise ? (
                  <div className="space-y-3">
                    {analise.perfil?.nome && (
                      <AIRow label="Nome" value={analise.perfil.nome} />
                    )}
                    {analise.perfil?.apelido && (
                      <AIRow label="Apelido" value={analise.perfil.apelido} />
                    )}
                    {analise.perfil?.profissao && (
                      <AIRow label="Profissão" value={analise.perfil.profissao} />
                    )}
                    {analise.perfil?.distrito && (
                      <AIRow label="Distrito" value={analise.perfil.distrito} />
                    )}
                    {analise.analise_fria?.status_fidelidade && (
                      <AIRow label="Status" value={analise.analise_fria.status_fidelidade} highlight />
                    )}
                    {analise.metas?.votos_caxias > 0 && (
                      <AIRow label="Votos Caxias" value={formatVotes(analise.metas.votos_caxias)} />
                    )}
                    {analise.metas?.votos_estado > 0 && (
                      <AIRow label="Votos Estado" value={formatVotes(analise.metas.votos_estado)} />
                    )}
                    {analise.historico?.tempo_politica && (
                      <AIRow label="Tempo Política" value={analise.historico.tempo_politica} />
                    )}
                    {analise.historico?.vinculo_pansera && (
                      <AIRow label="Vínculo Pansera" value={analise.historico.vinculo_pansera} />
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 text-center py-4">
                    Nenhuma análise de IA disponível.
                    <br /><span className="text-xs">Faça upload de uma entrevista.</span>
                  </p>
                )}
              </div>

              {analise && (
                <button
                  type="button"
                  onClick={() => {
                    const p = analise.perfil || {}
                    const m = analise.metas || {}
                    const a = analise.analise_fria || {}
                    setEditForm(f => ({
                      ...f,
                      nome_completo:        p.nome || f.nome_completo,
                      apelido_politico:     p.apelido || f.apelido_politico,
                      territorio_principal: p.distrito || f.territorio_principal,
                      status_fidelidade:    normalizeStatusForForm(a.status_fidelidade) || f.status_fidelidade,
                      meta_votos_caxias:    m.votos_caxias || f.meta_votos_caxias,
                      meta_votos_estado:    m.votos_estado || f.meta_votos_estado,
                    }))
                    toast('Sugestões da IA aplicadas! Revise e salve.', 'info')
                  }}
                  className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl
                    font-bold text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Aplicar Todas as Sugestões da IA
                </button>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-10 pt-6 border-t border-[#002b5c]/40 flex items-center justify-between">
          <span className="text-xs text-slate-700 uppercase tracking-widest">CONFIDENCIAL · BOW 360</span>
          <span className="text-xs text-slate-700">CAMPANHA CELSO PANSERA 2026</span>
        </div>
      </main>

      {/* ── Modal Confirmar Exclusão ── */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => !deleting && setConfirmDelete(false)}
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
              <strong className="text-white">{lider.apelido_politico || lider.nome_completo}</strong>
            </p>
            <p className="text-xs text-slate-500 text-center mb-6">
              Apagará também todas as entrevistas vinculadas. Irreversível.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="flex-1 py-2.5 bg-[#002b5c]/50 hover:bg-[#002b5c] border border-[#003d82]/40
                  text-slate-300 rounded-xl font-semibold text-sm transition-colors"
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

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}

// ── Helpers internos ──────────────────────────────────────────────────────────

function normalizeStatusForForm(raw) {
  if (!raw) return 'Observando'
  const s = raw.toLowerCase()
  if (s.includes('leal') || s.includes('fiel') || s.includes('alta') || s.includes('comprometido')) return 'Fiel'
  if (s.includes('risco') || s.includes('crítico') || s.includes('critico') || s.includes('traição') || s.includes('traicao')) return 'Em Risco'
  if (s.includes('baixa')) return 'Baixa Fidelidade'
  if (s.includes('moderado') || s.includes('moderada')) return 'Moderado'
  if (s.includes('observando') || s.includes('indefinido') || s.includes('neutro')) return 'Observando'
  return 'Observando'
}

const inputCls = `w-full px-3 py-2.5 bg-[#002050] border border-[#002b5c] rounded-xl
  text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#e11d48]/50
  transition-colors`

// ── Sub-components ────────────────────────────────────────────────────────────

function InfoCard({ title, subtitle, icon, children, variant = 'default', action }) {
  const base = variant === 'danger' ? 'bg-rose-950/30 border-rose-500/25' : 'bg-[#001733] border-[#002b5c]'
  const iconBg = variant === 'danger' ? 'bg-rose-500/20 text-rose-400' : 'bg-[#002b5c] text-slate-400'
  return (
    <div className={`rounded-2xl border p-5 ${base}`}>
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
            {icon}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white leading-tight">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function EditField({ label, children, aiValue, currentValue, onApplyAI, className = '' }) {
  const hasSuggestion = aiValue && String(aiValue).trim() !== '' && String(aiValue) !== String(currentValue || '')
  return (
    <div className={className}>
      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      {children}
      {hasSuggestion && (
        <div className="mt-1.5 flex items-center justify-between gap-2 px-2.5 py-1.5
          bg-purple-500/10 border border-purple-500/20 rounded-lg">
          <span className="text-xs text-purple-300 truncate">
            🤖 IA: <strong>{String(aiValue)}</strong>
          </span>
          {onApplyAI && (
            <button
              type="button"
              onClick={onApplyAI}
              className="text-xs text-purple-400 hover:text-purple-200 font-bold shrink-0
                hover:bg-purple-500/20 px-1.5 py-0.5 rounded transition-colors"
            >
              Aplicar
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function AIRow({ label, value, highlight }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-xs text-slate-500 shrink-0 mt-0.5">{label}</span>
      <span className={`text-xs font-semibold text-right ${highlight ? 'text-purple-300' : 'text-slate-300'}`}>
        {value}
      </span>
    </div>
  )
}

function MetricRow({ label, value, highlight }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-slate-400 min-w-0 truncate">{label}</span>
      <span className={`font-bold tabular-nums shrink-0 ${highlight ? 'text-white text-lg' : 'text-slate-200 text-sm'}`}>
        {value}
      </span>
    </div>
  )
}

/** Parses score from AI output: "8/10", "75", "0.8", "8" → value 0–100 */
function parseScore(raw) {
  if (!raw) return null
  const s = String(raw).trim()
  const slash = s.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+)$/)
  if (slash) return Math.round((parseFloat(slash[1]) / parseFloat(slash[2])) * 100)
  const pct = parseFloat(s.replace('%', ''))
  if (!isNaN(pct)) {
    if (pct <= 1) return Math.round(pct * 100)
    if (pct <= 10) return Math.round(pct * 10)
    return Math.round(pct)
  }
  return null
}

function ScoreRow({ score }) {
  const pct = parseScore(score)
  const color = pct === null ? 'bg-slate-500' : pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-rose-500'
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500">Score IA</span>
        <span className="text-xs font-bold text-slate-300">{String(score)}</span>
      </div>
      {pct !== null && (
        <div className="h-1.5 bg-[#002b5c] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${color}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  )
}

function DiagRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-slate-500">{label}</span>
      {typeof value === 'string'
        ? <span className="text-xs text-slate-300 font-medium text-right">{value}</span>
        : value
      }
    </div>
  )
}

function NoData({ text }) {
  return (
    <div className="flex items-center gap-2 p-3 bg-slate-800/30 rounded-xl">
      <svg className="w-4 h-4 text-slate-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p className="text-sm text-slate-500">{text}</p>
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const DocIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
)
const WarnIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
)
const ChatIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
)
const PersonIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
)
const ClockIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)
const ChartIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
)
const MusicIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
  </svg>
)
const BulbIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
  </svg>
)
const MapIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)
