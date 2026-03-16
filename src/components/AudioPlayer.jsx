import { useRef, useState, useEffect } from 'react'

export default function AudioPlayer({ src, title = 'Resumo em Áudio' }) {
  const audioRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !src) {
      setIsLoading(false)
      return
    }

    const onLoaded = () => { setDuration(audio.duration); setIsLoading(false) }
    const onTimeUpdate = () => setCurrentTime(audio.currentTime)
    const onEnded = () => setIsPlaying(false)
    const onError = () => { setError('Áudio indisponível'); setIsLoading(false) }

    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)

    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
    }
  }, [src])

  const togglePlay = () => {
    if (!audioRef.current || !src) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  const handleSeek = (e) => {
    const t = (e.target.value / 100) * duration
    audioRef.current.currentTime = t
    setCurrentTime(t)
  }

  const handleVolume = (e) => {
    const v = e.target.value / 100
    audioRef.current.volume = v
    setVolume(v)
  }

  const fmt = (s) => {
    if (!s || isNaN(s)) return '0:00'
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  }

  const progress = duration ? (currentTime / duration) * 100 : 0

  if (!src) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-800/40 border border-slate-700/40">
        <div className="w-9 h-9 rounded-full bg-slate-700/60 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-slate-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium text-slate-400">Áudio TTS não gerado</p>
          <p className="text-xs text-slate-600 mt-0.5">Ative o nó "Generate audio" no n8n</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 rounded-xl bg-[#002b5c]/40 border border-[#003d82]/40">
      <audio ref={audioRef} src={src} preload="metadata" />

      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={togglePlay}
          disabled={isLoading || !!error}
          className="w-10 h-10 rounded-full bg-[#e11d48] hover:bg-[#c81940] disabled:bg-slate-600
            flex items-center justify-center transition-colors shrink-0"
        >
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : isPlaying ? (
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{title}</p>
          {error ? (
            <p className="text-xs text-rose-400">{error}</p>
          ) : (
            <p className="text-xs text-slate-400">{fmt(currentTime)} / {fmt(duration)}</p>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <svg className="w-3 h-3 text-slate-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
          </svg>
          <input
            type="range" min="0" max="100" value={volume * 100}
            onChange={handleVolume}
            className="w-14 h-1 cursor-pointer accent-[#e11d48]"
          />
        </div>
      </div>

      <input
        type="range" min="0" max="100" value={progress}
        onChange={handleSeek}
        disabled={!duration}
        className="w-full h-1 cursor-pointer accent-[#e11d48] rounded-full"
        style={{
          background: `linear-gradient(to right, #e11d48 ${progress}%, #1e3a5f ${progress}%)`,
        }}
      />
    </div>
  )
}
