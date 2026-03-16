import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip } from 'react-leaflet'
import { supabase } from '../lib/supabaseClient'
import { formatVotes } from '../lib/utils'
import FidelidadeBadge from '../components/FidelidadeBadge'
import LoadingSpinner from '../components/LoadingSpinner'
import 'leaflet/dist/leaflet.css'

// ── Classify fidelidade → color ───────────────────────────────────────────────
function classifyStatus(s) {
  if (!s) return 'semStatus'
  const l = s.toLowerCase()
  if (l.includes('fiel') || l.includes('leal') || l.includes('comprometido')) return 'fiel'
  if (l.includes('risco') || l.includes('baixa') || l.includes('critico') || l.includes('traição') || l.includes('volatil')) return 'risco'
  if (l.includes('moderada') || l.includes('moderado') || l.includes('neutro') || l.includes('observando') || l.includes('indefinido')) return 'observando'
  return 'semStatus'
}

const STATUS_COLORS = {
  fiel:       '#10b981',
  observando: '#f59e0b',
  risco:      '#f43f5e',
  semStatus:  '#475569',
}

const STATUS_LABELS = {
  fiel:       'Fiel',
  observando: 'Observando',
  risco:      'Em Risco',
  semStatus:  'Sem Status',
}

// Geocode a place name via Nominatim (with simple in-memory cache)
const geoCache = {}
async function geocode(place) {
  if (!place) return null
  const key = place.toLowerCase().trim()
  if (geoCache[key]) return geoCache[key]
  try {
    const q = encodeURIComponent(`${place}, Rio de Janeiro, Brasil`)
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
      { headers: { 'Accept-Language': 'pt-BR' } }
    )
    const data = await res.json()
    if (data?.[0]) {
      const coord = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
      geoCache[key] = coord
      return coord
    }
  } catch { /* silent */ }
  return null
}

// ── Legend ────────────────────────────────────────────────────────────────────
function Legend() {
  return (
    <div className="absolute bottom-6 left-4 z-[1000] bg-[#001733]/95 backdrop-blur-md
      border border-[#002b5c] rounded-2xl px-4 py-3 shadow-xl pointer-events-none">
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Status</p>
      {Object.entries(STATUS_LABELS).map(([key, label]) => (
        <div key={key} className="flex items-center gap-2 mb-1.5">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: STATUS_COLORS[key] }} />
          <span className="text-xs text-slate-300">{label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MapaPage() {
  const navigate = useNavigate()
  const [liderancas, setLiderancas] = useState([])
  const [loading, setLoading] = useState(true)
  const [geocoding, setGeocoding] = useState(false)
  const [markers, setMarkers] = useState([])
  const [filterStatus, setFilterStatus] = useState('todos')
  const [progress, setProgress] = useState(0)

  // Load liderancas
  useEffect(() => {
    supabase.from('liderancas').select('*').then(({ data }) => {
      setLiderancas(data || [])
      setLoading(false)
    })
  }, [])

  // Geocode all unique municipalities
  useEffect(() => {
    if (!liderancas.length) return
    setGeocoding(true)

    const municipios = [...new Set(
      liderancas.map((l) => l.municipio || l.territorio_principal).filter(Boolean)
    )]

    let done = 0
    const coords = {}

    const processNext = async (i) => {
      if (i >= municipios.length) {
        // Build markers from geocoded coords
        const result = liderancas.map((l) => {
          const place = l.municipio || l.territorio_principal
          const coord = place ? coords[place.toLowerCase().trim()] : null
          if (!coord) return null
          // Jitter slightly so overlapping pins are visible
          const jitter = () => (Math.random() - 0.5) * 0.04
          return {
            id: l.id,
            lat: coord.lat + jitter(),
            lng: coord.lng + jitter(),
            lider: l,
            status: classifyStatus(l.status_fidelidade),
            color: STATUS_COLORS[classifyStatus(l.status_fidelidade)],
          }
        }).filter(Boolean)
        setMarkers(result)
        setGeocoding(false)
        return
      }

      const place = municipios[i]
      const coord = await geocode(place)
      if (coord) coords[place.toLowerCase().trim()] = coord
      done++
      setProgress(Math.round((done / municipios.length) * 100))

      // Rate limit: Nominatim asks for max 1 req/sec
      setTimeout(() => processNext(i + 1), 200)
    }

    processNext(0)
  }, [liderancas])

  const visibleMarkers = useMemo(() => {
    if (filterStatus === 'todos') return markers
    return markers.filter((m) => m.status === filterStatus)
  }, [markers, filterStatus])

  const stats = useMemo(() => {
    const counts = { fiel: 0, observando: 0, risco: 0, semStatus: 0 }
    markers.forEach((m) => counts[m.status]++)
    return counts
  }, [markers])

  if (loading) return (
    <div className="min-h-screen bg-[#00101f] flex items-center justify-center">
      <LoadingSpinner text="Carregando mapa..." />
    </div>
  )

  return (
    <div className="min-h-screen bg-[#00101f] flex flex-col">

      {/* ── Header ── */}
      <header className="bg-[#001733] border-b border-[#002b5c] z-40 flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4 flex-wrap">
          <button
            onClick={() => navigate('/')}
            className="w-9 h-9 rounded-xl border border-[#002b5c] hover:bg-[#002b5c]/60
              flex items-center justify-center text-slate-400 hover:text-white transition-colors shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <p className="text-sm font-bold text-white leading-tight">Mapa Eleitoral · BOW 360</p>
            <p className="text-xs text-slate-500 leading-tight">
              {geocoding
                ? `Geocodificando municípios... ${progress}%`
                : `${markers.length} lideranças no mapa · OpenStreetMap`}
            </p>
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-1.5 ml-auto flex-wrap">
            {[
              { key: 'todos', label: 'Todos', count: markers.length },
              { key: 'fiel', label: 'Fiéis', count: stats.fiel },
              { key: 'observando', label: 'Observando', count: stats.observando },
              { key: 'risco', label: 'Em Risco', count: stats.risco },
            ].map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setFilterStatus(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  filterStatus === key
                    ? 'bg-[#e11d48] text-white'
                    : 'bg-[#002b5c]/50 text-slate-400 hover:bg-[#002b5c] hover:text-white'
                }`}
              >
                {key !== 'todos' && (
                  <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[key] }} />
                )}
                {label}
                <span className={`text-[10px] font-black px-1 rounded ${
                  filterStatus === key ? 'bg-white/20' : 'bg-[#002b5c]'
                }`}>
                  {count}
                </span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Map ── */}
      <div className="flex-1 relative" style={{ minHeight: 'calc(100vh - 73px)' }}>

        {/* Geocoding progress overlay */}
        {geocoding && (
          <div className="absolute inset-0 z-[2000] bg-[#00101f]/80 backdrop-blur-sm flex flex-col items-center justify-center">
            <div className="bg-[#001733] border border-[#002b5c] rounded-2xl p-8 text-center max-w-xs w-full mx-4">
              <div className="w-12 h-12 bg-[#002b5c] rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-[#e11d48] animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                </svg>
              </div>
              <p className="text-sm font-bold text-white mb-1">Geocodificando municípios</p>
              <p className="text-xs text-slate-500 mb-4">Buscando coordenadas via OpenStreetMap...</p>
              <div className="h-2 bg-[#002b5c] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#e11d48] rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-2">{progress}%</p>
            </div>
          </div>
        )}

        {markers.length > 0 ? (
          <MapContainer
            center={[-22.79, -43.31]}
            zoom={10}
            style={{ width: '100%', height: '100%' }}
            className="z-0"
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://carto.com">CARTO</a> &copy; <a href="https://osm.org">OpenStreetMap</a>'
              maxZoom={19}
            />

            {visibleMarkers.map((m) => (
              <CircleMarker
                key={m.id}
                center={[m.lat, m.lng]}
                radius={9}
                pathOptions={{
                  fillColor: m.color,
                  fillOpacity: 0.85,
                  color: '#000',
                  weight: 1.5,
                }}
              >
                <Tooltip permanent={false} direction="top">
                  <div style={{ background: 'transparent', border: 'none' }}>
                    <strong>{m.lider.apelido_politico || m.lider.nome_completo}</strong>
                    <br />
                    <small>{m.lider.municipio || '—'}</small>
                  </div>
                </Tooltip>
                <Popup>
                  <div style={{ minWidth: 180, fontFamily: 'Inter, sans-serif' }}>
                    <p style={{ fontWeight: 800, fontSize: 14, marginBottom: 2 }}>
                      {m.lider.apelido_politico || m.lider.nome_completo}
                    </p>
                    {m.lider.apelido_politico && (
                      <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
                        {m.lider.nome_completo}
                      </p>
                    )}
                    <p style={{ fontSize: 11, marginBottom: 2 }}>
                      📍 {m.lider.territorio_principal || m.lider.municipio || '—'}
                    </p>
                    <p style={{ fontSize: 11, marginBottom: 8 }}>
                      🗳️ {formatVotes(m.lider.meta_votos_caxias)} votos
                    </p>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: 20,
                      fontSize: 10,
                      fontWeight: 700,
                      background: m.color + '33',
                      color: m.color,
                      border: `1px solid ${m.color}66`,
                      marginBottom: 8,
                    }}>
                      {STATUS_LABELS[m.status]}
                    </span>
                    <br />
                    <button
                      onClick={() => navigate(`/lideranca/${m.id}`)}
                      style={{
                        marginTop: 4,
                        padding: '4px 10px',
                        background: '#e11d48',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 8,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        width: '100%',
                      }}
                    >
                      Ver Dossiê →
                    </button>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        ) : !geocoding ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-slate-500 text-sm mb-2">Nenhuma liderança com município cadastrado</p>
              <p className="text-slate-600 text-xs">Adicione o campo "Município" no cadastro das lideranças</p>
            </div>
          </div>
        ) : null}

        {/* Legend */}
        {!geocoding && markers.length > 0 && <Legend />}
      </div>
    </div>
  )
}
