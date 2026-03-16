import { getFidelidadeConfig } from '../lib/utils'

const sizeClasses = {
  sm: 'text-xs px-2 py-0.5 gap-1',
  md: 'text-xs px-3 py-1 gap-1.5',
  lg: 'text-sm px-4 py-1.5 gap-1.5',
}

export default function FidelidadeBadge({ status, size = 'md' }) {
  const config = getFidelidadeConfig(status)

  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold border
        ${config.bg} ${config.text} ${config.border} ${sizeClasses[size]}`}
    >
      <span className={`rounded-full animate-pulse ${config.dot} ${size === 'lg' ? 'w-2 h-2' : 'w-1.5 h-1.5'}`} />
      {config.label}
    </span>
  )
}
