import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'

const WEBHOOK_URL = import.meta.env.VITE_N8N_WEBHOOK_URL

const ACCEPTED_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/wave',
  'audio/ogg', 'audio/webm', 'audio/aac', 'audio/flac']
const ACCEPTED_EXT = ['.mp3', '.m4a', '.wav', '.ogg', '.webm', '.aac', '.flac']

function isAudioFile(file) {
  return ACCEPTED_TYPES.includes(file.type) || ACCEPTED_EXT.some((ext) => file.name.toLowerCase().endsWith(ext))
}

// ── Etapas do pipeline ─────────────────────────────────────────────────────────
const STAGES = [
  { id: 'upload',     label: 'Arquivo enviado ao n8n',        duration: 5,   icon: '📤' },
  { id: 'deepgram',   label: 'Deepgram — Transcrição',        duration: 55,  icon: '🎙️' },
  { id: 'claude',     label: 'Claude 4.5 — Análise da IA',   duration: 60,  icon: '🤖' },
  { id: 'pdf',        label: 'PDFShift — Gerando relatório',  duration: 20,  icon: '📄' },
  { id: 'supabase',   label: 'Supabase — Salvando dados',     duration: 10,  icon: '💾' },
]
const TOTAL_DURATION = STAGES.reduce((a, s) => a + s.duration, 0) // ~150s

// ── Barra de progresso com animação ───────────────────────────────────────────
function ProgressBar({ pct, color = '#e11d48' }) {
  return (
    <div className="w-full bg-[#002b5c]/60 rounded-full h-2 overflow-hidden">
      <div
        className="h-2 rounded-full transition-all duration-1000"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  )
}

// ── Etapa individual ───────────────────────────────────────────────────────────
function StageRow({ stage, state }) {
  // state: 'pending' | 'active' | 'done'
  return (
    <div className={`flex items-center gap-3 py-2 transition-all duration-300 ${
      state === 'pending' ? 'opacity-30' : 'opacity-100'
    }`}>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all ${
        state === 'done'
          ? 'bg-emerald-500/30'
          : state === 'active'
          ? 'bg-[#e11d48]/20 ring-2 ring-[#e11d48]/40'
          : 'bg-[#002b5c]/50'
      }`}>
        {state === 'done' ? (
          <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        ) : state === 'active' ? (
          <div className="w-2 h-2 bg-[#e11d48] rounded-full animate-pulse" />
        ) : (
          <div className="w-2 h-2 bg-[#002b5c] rounded-full" />
        )}
      </div>
      <span className={`text-sm flex-1 ${
        state === 'done' ? 'text-emerald-400' :
        state === 'active' ? 'text-white font-semibold' :
        'text-slate-500'
      }`}>
        {stage.icon} {stage.label}
      </span>
      {state === 'active' && (
        <span className="text-xs text-slate-500 animate-pulse">~{stage.duration}s</span>
      )}
      {state === 'done' && (
        <span className="text-xs text-emerald-500">✓</span>
      )}
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function UploadAudio({ onClose, onSuccess }) {
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState('idle')   // idle | sending | processing | found | error
  const [uploadPct, setUploadPct] = useState(0)
  const [elapsed, setElapsed] = useState(0)      // seconds since processing started
  const [errorMsg, setErrorMsg] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [snapshotTime, setSnapshotTime] = useState(null) // timestamp before sending
  const inputRef = useRef(null)
  const timerRef = useRef(null)
  const pollRef = useRef(null)
  const submitRef = useRef(false)

  // Fecha com ESC
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && status !== 'processing') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, status])

  // Limpa timers ao desmontar
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current)
      clearInterval(pollRef.current)
    }
  }, [])

  // ── Polling: verifica se nova liderança apareceu no Supabase ──────────────
  const startPolling = useCallback((since) => {
    let attempts = 0
    pollRef.current = setInterval(async () => {
      attempts++
      const { data } = await supabase
        .from('liderancas')
        .select('id, nome_completo, criado_em')
        .gt('criado_em', since)
        .order('criado_em', { ascending: false })
        .limit(1)

      if (data?.length > 0) {
        clearInterval(pollRef.current)
        clearInterval(timerRef.current)
        setStatus('found')
        setTimeout(() => { onSuccess?.(); onClose?.() }, 2500)
      } else if (attempts >= 36) {
        // 36 × 5s = 3 minutos sem resposta
        clearInterval(pollRef.current)
        clearInterval(timerRef.current)
        setStatus('error')
        setErrorMsg('Tempo limite atingido (3 min) — o n8n não retornou nenhuma liderança. Verifique os logs do workflow e tente novamente.')
      }
    }, 5000) // verifica a cada 5 segundos
  }, [onSuccess, onClose])

  // ── Envio do arquivo ───────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!file || submitRef.current) return

    if (!WEBHOOK_URL || WEBHOOK_URL.includes('[SEU_HOST')) {
      setStatus('error')
      setErrorMsg('Configure VITE_N8N_WEBHOOK_URL no arquivo .env com a URL do seu n8n.')
      return
    }

    submitRef.current = true
    setStatus('sending')
    setUploadPct(0)
    setErrorMsg('')

    const formData = new FormData()
    formData.append('Audio', file, file.name)

    // Simula progresso do envio
    const uploadTimer = setInterval(() => {
      setUploadPct((p) => {
        if (p >= 85) { clearInterval(uploadTimer); return 85 }
        return p + 20
      })
    }, 300)

    try {
      // Captura timestamp ANTES do envio para o polling detectar registros novos
      const before = new Date().toISOString()
      setSnapshotTime(before)

      const res = await fetch(WEBHOOK_URL, { method: 'POST', body: formData })
      clearInterval(uploadTimer)

      if (res.ok || res.status === 200) {
        setUploadPct(100)

        // Inicia fase de processamento
        setTimeout(() => {
          setStatus('processing')
          setElapsed(0)

          // Timer de elapsed (tick a cada segundo)
          timerRef.current = setInterval(() => {
            setElapsed((s) => s + 1)
          }, 1000)

          // Polling no Supabase
          startPolling(before)
        }, 400)

      } else {
        throw new Error(`n8n retornou HTTP ${res.status} — verifique se o workflow está ativo.`)
      }
    } catch (err) {
      clearInterval(uploadTimer)
      submitRef.current = false
      setStatus('error')
      setErrorMsg(
        err.message.includes('fetch')
          ? 'Não foi possível conectar ao n8n. Verifique se o workflow está publicado e a URL está correta.'
          : err.message
      )
    }
  }

  // ── Retry ──────────────────────────────────────────────────────────────────
  const handleRetry = () => {
    clearInterval(timerRef.current)
    clearInterval(pollRef.current)
    submitRef.current = false
    setStatus('idle')
    setUploadPct(0)
    setElapsed(0)
    setErrorMsg('')
    setRetryCount((n) => n + 1)
  }

  // ── Estado das etapas baseado no tempo elapsed ─────────────────────────────
  const getStageState = (stageIdx) => {
    if (status === 'found') return 'done'
    let cumulative = 0
    for (let i = 0; i <= stageIdx; i++) {
      cumulative += STAGES[i].duration
    }
    const prevCumulative = cumulative - STAGES[stageIdx].duration
    if (elapsed >= cumulative) return 'done'
    if (elapsed >= prevCumulative) return 'active'
    return 'pending'
  }

  // Progresso total (0-100) baseado no elapsed
  const processingPct = Math.min(Math.round((elapsed / TOTAL_DURATION) * 100), 95)

  const fmtSize = (b) =>
    b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(2)} MB`

  const fmtTime = (s) => s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={status === 'processing' ? undefined : onClose}
    >
      <div
        className="bg-[#001733] border border-[#002b5c] rounded-2xl w-full max-w-md shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between p-5 border-b border-[#002b5c]">
          <div>
            <h2 className="text-lg font-bold text-white">Processar Entrevista</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Deepgram → Claude 4.5 → PDFShift → Supabase
            </p>
          </div>
          <button
            onClick={status === 'processing' ? undefined : onClose}
            title={status === 'processing' ? 'Processando... aguarde' : 'Fechar'}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors text-xl leading-none ${
              status === 'processing'
                ? 'text-slate-700 cursor-not-allowed'
                : 'bg-slate-700/50 hover:bg-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-4">

          {/* ── IDLE: Drop zone ── */}
          {status === 'idle' && (
            <>
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setIsDragging(false)
                  const dropped = e.dataTransfer.files[0]
                  if (dropped && isAudioFile(dropped)) { setFile(dropped); setErrorMsg('') }
                  else setErrorMsg('Formato não suportado. Use: MP3, M4A, WAV, OGG, AAC ou FLAC.')
                }}
                onClick={() => inputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-7 text-center cursor-pointer
                  transition-all duration-200 select-none ${
                  isDragging
                    ? 'border-[#e11d48] bg-[#e11d48]/10'
                    : file
                    ? 'border-emerald-500/50 bg-emerald-500/10'
                    : 'border-[#002b5c] hover:border-[#003d82] bg-[#002b5c]/20 hover:bg-[#002b5c]/40'
                }`}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPTED_EXT.join(',') + ',audio/*'}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files[0]
                    if (f) { setFile(f); setErrorMsg('') }
                  }}
                />
                {file ? (
                  <div className="space-y-1.5">
                    <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
                      <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-white">{file.name}</p>
                    <p className="text-xs text-slate-400">{fmtSize(file.size)}</p>
                    <p className="text-xs text-emerald-400">Clique para trocar</p>
                    {retryCount > 0 && (
                      <p className="text-xs text-amber-400">Tentativa {retryCount + 1}</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="w-10 h-10 bg-[#002b5c] rounded-full flex items-center justify-center mx-auto">
                      <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-white">Arraste o áudio aqui</p>
                    <p className="text-xs text-slate-500">ou clique para selecionar</p>
                    <p className="text-xs text-slate-600">MP3 · M4A · WAV · OGG · AAC · FLAC</p>
                  </div>
                )}
              </div>
              {errorMsg && <p className="text-xs text-rose-400">{errorMsg}</p>}
            </>
          )}

          {/* ── SENDING: barra de upload ── */}
          {status === 'sending' && (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-[#e11d48] rounded-full animate-pulse shrink-0" />
                <span className="text-sm text-white font-medium">Enviando arquivo para o n8n...</span>
                <span className="ml-auto text-[#e11d48] font-bold text-sm tabular-nums">{uploadPct}%</span>
              </div>
              <ProgressBar pct={uploadPct} />
              <p className="text-xs text-slate-500 text-center">
                {file?.name} · {fmtSize(file?.size || 0)}
              </p>
            </div>
          )}

          {/* ── PROCESSING: pipeline ── */}
          {(status === 'processing' || status === 'found') && (
            <div className="space-y-4">

              {/* Barra de progresso geral */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-medium">
                    {status === 'found' ? 'Concluído!' : 'Pipeline em execução...'}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">{fmtTime(elapsed)}</span>
                    <span className="text-xs font-bold text-[#e11d48]">
                      {status === 'found' ? '100%' : `${processingPct}%`}
                    </span>
                  </div>
                </div>
                <ProgressBar
                  pct={status === 'found' ? 100 : processingPct}
                  color={status === 'found' ? '#10b981' : '#e11d48'}
                />
              </div>

              {/* Etapas */}
              <div className="bg-[#002b5c]/20 rounded-xl p-3 space-y-0.5">
                {STAGES.map((stage, i) => (
                  <StageRow key={stage.id} stage={stage} state={getStageState(i)} />
                ))}
              </div>

              {/* Status text */}
              {status === 'found' ? (
                <div className="flex items-center gap-2 text-emerald-400 text-sm font-semibold justify-center">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Liderança salva no Radar! Redirecionando...
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500">
                    Aguardando registro no banco de dados...
                  </p>
                  <button
                    onClick={() => { clearInterval(timerRef.current); clearInterval(pollRef.current); onSuccess?.(); onClose?.() }}
                    className="text-xs text-slate-600 hover:text-slate-400 underline transition-colors"
                  >
                    Fechar e aguardar
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── ERROR ── */}
          {status === 'error' && (
            <div className="space-y-3">
              <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl space-y-2">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-rose-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p className="text-sm font-semibold text-rose-400">Falha no envio</p>
                </div>
                <p className="text-xs text-rose-300/80 leading-relaxed">{errorMsg}</p>
              </div>

              {/* Diagnóstico rápido */}
              <div className="text-xs text-slate-600 space-y-1 bg-[#002b5c]/20 rounded-xl p-3">
                <p className="text-slate-500 font-medium mb-1.5">Verificar:</p>
                <p>• Workflow n8n está <strong className="text-slate-400">publicado e ativo</strong>?</p>
                <p>• URL do webhook está correta no <strong className="text-slate-400">.env</strong>?</p>
                <p>• n8n tem <strong className="text-slate-400">CORS liberado</strong> para este domínio?</p>
              </div>

              <button
                onClick={handleRetry}
                className="w-full py-3 bg-[#e11d48] hover:bg-[#c81940] text-white rounded-xl
                  font-bold text-sm transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Tentar Novamente ({file?.name})
              </button>
            </div>
          )}

        </div>

        {/* ── Footer: só no idle ── */}
        {status === 'idle' && (
          <div className="flex gap-3 px-5 pb-5">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl border border-[#002b5c] text-slate-300
                hover:bg-[#002b5c]/50 transition-colors text-sm font-medium"
            >
              Cancelar
            </button>
            <button
              onClick={handleUpload}
              disabled={!file}
              className="flex-1 px-4 py-3 rounded-xl bg-[#e11d48] hover:bg-[#c81940]
                disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed
                text-white font-semibold transition-colors text-sm flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Processar Agora
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
