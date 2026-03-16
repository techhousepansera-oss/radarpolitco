import { useState, useRef, useEffect } from 'react'

const WEBHOOK_URL = import.meta.env.VITE_N8N_WEBHOOK_URL

const ACCEPTED_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/wave',
  'audio/ogg', 'audio/webm', 'audio/aac', 'audio/flac']
const ACCEPTED_EXT = ['.mp3', '.m4a', '.wav', '.ogg', '.webm', '.aac', '.flac']

function isAudioFile(file) {
  return ACCEPTED_TYPES.includes(file.type) || ACCEPTED_EXT.some((ext) => file.name.toLowerCase().endsWith(ext))
}

export default function UploadAudio({ onClose, onSuccess }) {
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState('idle')
  const [progress, setProgress] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef(null)

  // Close on ESC
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped && isAudioFile(dropped)) {
      setFile(dropped)
      setErrorMsg('')
    } else {
      setErrorMsg('Formato não suportado. Use: MP3, M4A, WAV, OGG, AAC ou FLAC.')
    }
  }

  const handleFileSelect = (e) => {
    const selected = e.target.files[0]
    if (selected) {
      setFile(selected)
      setErrorMsg('')
    }
  }

  const handleUpload = async () => {
    if (!file) return

    if (!WEBHOOK_URL || WEBHOOK_URL.includes('[SEU_HOST')) {
      setStatus('error')
      setErrorMsg('Configure VITE_N8N_WEBHOOK_URL no arquivo .env com a URL do seu n8n.')
      return
    }

    setStatus('uploading')
    setProgress(0)

    const formData = new FormData()
    formData.append('Audio', file, file.name)

    try {
      const timer = setInterval(() => {
        setProgress((p) => (p >= 80 ? (clearInterval(timer), 80) : p + 15))
      }, 400)

      const res = await fetch(WEBHOOK_URL, { method: 'POST', body: formData })

      clearInterval(timer)
      setProgress(100)

      if (res.ok || res.status === 200) {
        setStatus('success')
        setTimeout(() => { onSuccess?.(); onClose?.() }, 2200)
      } else {
        throw new Error(`n8n retornou HTTP ${res.status} — verifique se o workflow está ativo.`)
      }
    } catch (err) {
      setStatus('error')
      setErrorMsg(
        err.message.includes('fetch')
          ? 'Não foi possível conectar ao n8n. Verifique a URL e as configurações de CORS.'
          : err.message
      )
    }
  }

  const fmtSize = (b) =>
    b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(2)} MB`

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#001733] border border-[#002b5c] rounded-2xl w-full max-w-md shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#002b5c]">
          <div>
            <h2 className="text-xl font-bold text-white">Processar Entrevista</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Deepgram → Claude 4.5 → PDFShift → Supabase
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-700/50 hover:bg-slate-700 flex items-center
              justify-center text-slate-400 hover:text-white transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Pipeline indicator */}
          <div className="flex items-center gap-2 text-xs text-slate-400 bg-[#002b5c]/40
            border border-[#002b5c]/60 rounded-xl p-3">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse shrink-0" />
            <span>Pipeline ativo: transcrição + análise IA + PDF + banco de dados</span>
          </div>

          {/* Drop zone — only shown in idle state */}
          {status === 'idle' && (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
                transition-all duration-200 select-none
                ${isDragging
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
                onChange={handleFileSelect}
              />

              {file ? (
                <div className="space-y-2">
                  <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
                    <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-white">{file.name}</p>
                  <p className="text-xs text-slate-400">{fmtSize(file.size)}</p>
                  <p className="text-xs text-emerald-400">Clique para trocar</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="w-12 h-12 bg-[#002b5c] rounded-full flex items-center justify-center mx-auto">
                    <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-white">Arraste o áudio aqui</p>
                  <p className="text-xs text-slate-500">ou clique para selecionar</p>
                  <p className="text-xs text-slate-600">MP3, M4A, WAV, OGG, AAC, FLAC</p>
                </div>
              )}
            </div>
          )}

          {/* Upload progress */}
          {status === 'uploading' && (
            <div className="space-y-4 py-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-300">Enviando para n8n...</span>
                <span className="text-[#e11d48] font-bold tabular-nums">{progress}%</span>
              </div>
              <div className="w-full bg-[#002b5c]/60 rounded-full h-2 overflow-hidden">
                <div
                  className="h-2 rounded-full bg-[#e11d48] transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 text-center">
                Pipeline ativo — aguarde o n8n confirmar o recebimento...
              </p>
            </div>
          )}

          {/* Success */}
          {status === 'success' && (
            <div className="py-6 text-center space-y-3">
              <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-lg font-bold text-white">Enviado com sucesso!</p>
              <p className="text-sm text-slate-400">
                O n8n está processando. A liderança aparecerá na lista quando o pipeline concluir.
              </p>
            </div>
          )}

          {/* Error */}
          {status === 'error' && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl space-y-2">
              <p className="text-sm font-semibold text-rose-400">Falha no envio</p>
              <p className="text-xs text-rose-300/80 leading-relaxed">{errorMsg}</p>
              <button
                onClick={() => { setStatus('idle'); setErrorMsg('') }}
                className="text-xs text-rose-400 underline"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {errorMsg && status === 'idle' && (
            <p className="text-xs text-rose-400">{errorMsg}</p>
          )}
        </div>

        {/* Footer buttons */}
        {status === 'idle' && (
          <div className="flex gap-3 px-6 pb-6">
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
