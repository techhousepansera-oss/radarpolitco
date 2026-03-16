import { useEffect, useState } from 'react'

// ── Individual Toast ──────────────────────────────────────────────────────────

function Toast({ id, message, type, onDismiss }) {
  const [visible, setVisible] = useState(false)

  // Animate in
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [])

  const configs = {
    success: {
      bg: 'bg-emerald-500/20 border-emerald-500/40',
      icon: (
        <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ),
      text: 'text-emerald-200',
    },
    error: {
      bg: 'bg-rose-500/20 border-rose-500/40',
      icon: (
        <svg className="w-4 h-4 text-rose-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
      text: 'text-rose-200',
    },
    info: {
      bg: 'bg-blue-500/20 border-blue-500/40',
      icon: (
        <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      text: 'text-blue-200',
    },
    warning: {
      bg: 'bg-amber-500/20 border-amber-500/40',
      icon: (
        <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
      text: 'text-amber-200',
    },
  }

  const cfg = configs[type] || configs.info

  return (
    <div
      className={`
        flex items-start gap-3 px-4 py-3 rounded-xl border shadow-2xl shadow-black/40
        backdrop-blur-md max-w-sm w-full pointer-events-auto
        transition-all duration-300
        ${cfg.bg}
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}
      `}
    >
      {cfg.icon}
      <p className={`flex-1 text-sm font-medium leading-snug ${cfg.text}`}>{message}</p>
      <button
        onClick={() => onDismiss(id)}
        className="text-slate-500 hover:text-white transition-colors shrink-0 -mt-0.5"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

// ── Container ─────────────────────────────────────────────────────────────────

export function ToastContainer({ toasts, onDismiss }) {
  if (!toasts.length) return null
  return (
    <div className="fixed bottom-6 right-4 z-[9999] flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map((t) => (
        <Toast key={t.id} {...t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
