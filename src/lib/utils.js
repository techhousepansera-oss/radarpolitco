/**
 * Parses the analise_json field from the entrevistas table.
 * The n8n flow saves the raw AI Agent output as a string.
 * This function handles: plain JSON, JSON with markdown code blocks,
 * and JSON embedded in text.
 *
 * Also normalizes the structure so that resumo_executivo is always
 * inside analise_fria — the n8n prompt historically places it at root level.
 */
export function parseAnalise(analise_json) {
  if (!analise_json) return null

  let parsed = null

  if (typeof analise_json === 'object') {
    parsed = analise_json
  } else {
    try {
      // Strip markdown code fences that the AI sometimes includes
      const cleaned = analise_json
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/gi, '')
        .trim()
      parsed = JSON.parse(cleaned)
    } catch {
      // Fallback: extract the first {...} block from the string
      const match = analise_json.match(/\{[\s\S]*\}/)
      if (match) {
        try {
          parsed = JSON.parse(match[0])
        } catch {
          return null
        }
      }
      if (!parsed) return null
    }
  }

  return normalizeAnalise(parsed)
}

/**
 * Normalizes the parsed analysis object to a consistent structure.
 *
 * The n8n Claude prompt places `resumo_executivo` at the ROOT of the JSON,
 * but the frontend always reads it from `analise_fria.resumo_executivo`.
 * This function moves it into analise_fria if it's at root.
 */
function normalizeAnalise(data) {
  if (!data || typeof data !== 'object') return null

  // Move resumo_executivo from root into analise_fria (n8n prompt quirk)
  const af = data.analise_fria || {}
  const resumo = af.resumo_executivo || data.resumo_executivo || null

  return {
    ...data,
    bairros: Array.isArray(data.bairros) ? data.bairros : [],
    analise_fria: {
      ...af,
      resumo_executivo: resumo,
    },
  }
}

/**
 * Returns Tailwind color config based on the fidelity status string.
 * Maps the Claude AI output values (e.g. "Alta Fidelidade", "Risco de Traição")
 * to visual badge styles.
 */
export function getFidelidadeConfig(status) {
  if (!status) {
    return {
      label: 'Sem Status',
      bg: 'bg-slate-500/20',
      text: 'text-slate-400',
      border: 'border-slate-500/30',
      dot: 'bg-slate-400',
    }
  }

  const lower = status.toLowerCase()

  // Green: confirmed loyal
  if (
    lower.includes('fiel') ||
    lower.includes('alta fidelidade') ||
    lower.includes('leal') ||
    lower.includes('comprometido')
  ) {
    return {
      label: status,
      bg: 'bg-emerald-500/20',
      text: 'text-emerald-400',
      border: 'border-emerald-500/30',
      dot: 'bg-emerald-400',
    }
  }

  // Amber: neutral / watching
  if (
    lower.includes('moderada') ||
    lower.includes('moderado') ||
    lower.includes('neutro') ||
    lower.includes('observando') ||
    lower.includes('indefinido')
  ) {
    return {
      label: status,
      bg: 'bg-amber-500/20',
      text: 'text-amber-400',
      border: 'border-amber-500/30',
      dot: 'bg-amber-400',
    }
  }

  // Red: risk / low credibility
  if (
    lower.includes('risco') ||
    lower.includes('baixa') ||
    lower.includes('critico') ||
    lower.includes('traição') ||
    lower.includes('traicao') ||
    lower.includes('credibilidade') ||
    lower.includes('volátil') ||
    lower.includes('volatil')
  ) {
    return {
      label: status,
      bg: 'bg-rose-500/20',
      text: 'text-rose-400',
      border: 'border-rose-500/30',
      dot: 'bg-rose-400',
    }
  }

  // Default: informational blue
  return {
    label: status,
    bg: 'bg-blue-500/20',
    text: 'text-blue-400',
    border: 'border-blue-500/30',
    dot: 'bg-blue-400',
  }
}

/** Formats a number using pt-BR locale (e.g. 1500 → "1.500") */
export function formatVotes(num) {
  if (!num && num !== 0) return '—'
  return Number(num).toLocaleString('pt-BR')
}

/** Formats a date string to DD/MM/YYYY */
export function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** Returns relative time string in pt-BR ("há 2 dias", "há 3 horas", etc.) */
export function timeAgo(dateStr) {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const min  = Math.floor(diff / 60000)
  const h    = Math.floor(diff / 3600000)
  const d    = Math.floor(diff / 86400000)
  const mo   = Math.floor(d / 30)
  const yr   = Math.floor(d / 365)
  if (min < 1)   return 'agora mesmo'
  if (min < 60)  return `há ${min} min`
  if (h < 24)    return `há ${h}h`
  if (d < 2)     return 'ontem'
  if (d < 30)    return `há ${d} dias`
  if (mo < 12)   return `há ${mo} ${mo === 1 ? 'mês' : 'meses'}`
  return `há ${yr} ${yr === 1 ? 'ano' : 'anos'}`
}
