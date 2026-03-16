/**
 * Parses the analise_json field from the entrevistas table.
 * The n8n flow saves the raw AI Agent output as a string.
 * This function handles: plain JSON, JSON with markdown code blocks,
 * and JSON embedded in text.
 */
export function parseAnalise(analise_json) {
  if (!analise_json) return null
  if (typeof analise_json === 'object') return analise_json

  try {
    // Strip markdown code fences that the AI sometimes includes
    const cleaned = analise_json
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/gi, '')
      .trim()
    return JSON.parse(cleaned)
  } catch {
    // Fallback: extract the first {...} block from the string
    const match = analise_json.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        return JSON.parse(match[0])
      } catch {
        return null
      }
    }
    return null
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
