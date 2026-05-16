import { useState, useMemo } from 'react'
import {
  TrendingUp, BarChart3, Zap, Trophy,
  Star, Ticket, Music2, Activity, Cpu
} from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import ChartContainer from '../components/charts/ChartContainer'
import BarChart from '../components/charts/BarChart'
import { useArtists } from '../hooks/useArtists'
import { useAutoPredict, useModelInfo } from '../hooks/usePredictions'
import { formatNumber, formatCurrency } from '../utils/formatters'

const TABS = ['Profitability Predictor', 'Artist Comparison']

const CITIES = [
  { name: 'Mumbai',    multiplier: 1.4, demand: 92, population: 20700000 },
  { name: 'Delhi',     multiplier: 1.3, demand: 88, population: 32900000 },
  { name: 'Bangalore', multiplier: 1.2, demand: 84, population: 13200000 },
  { name: 'Chennai',   multiplier: 1.0, demand: 76, population: 11200000 },
  { name: 'Kolkata',   multiplier: 0.9, demand: 72, population: 14900000 },
  { name: 'Hyderabad', multiplier: 1.1, demand: 79, population: 10500000 },
  { name: 'Pune',      multiplier: 1.0, demand: 74, population: 7400000  },
  { name: 'Ahmedabad', multiplier: 0.9, demand: 68, population: 8400000  },
]

function heuristicPredict(artist, city) {
  if (!artist || !city) return null
  const totalFollowers  = Object.values(artist.followers).reduce((a, b) => a + b, 0)
  const avgRoG          = Object.values(artist.rog).reduce((a, b) => a + b, 0) / (Object.values(artist.rog).length || 1)
  const baseCapacity    = Math.min(Math.floor(Math.max(totalFollowers, 1000) * 0.002), 60000)
  const adjustedCap     = Math.floor(baseCapacity * city.multiplier)
  const sellThrough     = Math.min(0.65 + (avgRoG / 100) * 8 + city.demand / 1000, 0.99)
  const ticketsSold     = Math.floor(adjustedCap * sellThrough)
  const atp             = 1500 + (Math.max(totalFollowers, 1000) / 1000000) * 800 * city.multiplier
  const ticketRevenue   = ticketsSold * atp
  const sponsorRevenue  = ticketRevenue * 0.18
  const totalRevenue    = ticketRevenue + sponsorRevenue
  const roi             = ((totalRevenue - totalRevenue * 0.45) / (totalRevenue * 0.45)) * 100
  const popularityScore = Math.min(Math.round(city.demand * 0.6 + avgRoG * 4 + (Math.max(totalFollowers, 1000) / 1000000) * 2), 99)

  return {
    adjustedCap, ticketsSold, atp,
    ticketRevenue, sponsorRevenue, totalRevenue,
    sellThrough: sellThrough * 100, roi, popularityScore,
    demandScore: city.demand,
    source: 'heuristic',
  }
}

function mlToPrediction(mlData, artist, city) {
  if (!mlData || !artist || !city) return null
  const predictedRevenue = mlData.predictions?.predicted_revenue || mlData.predicted_revenue || 0
  const predictedAttendance = mlData.predictions?.predicted_attendance || mlData.predicted_attendance || 0
  const fillRate = mlData.predictions?.fill_rate || mlData.fill_rate || 0
  const avgPrice = mlData.predictions?.avg_ticket_price || mlData.avg_ticket_price || 0
  const revenueUpper = mlData.predictions?.confidence_interval_95pct?.revenue_upper || mlData.confidence_interval_95pct?.revenue_upper || predictedRevenue * 1.2
  const potentialScore = mlData.potential_score?.total || 0

  const sponsorRevenue = predictedRevenue * 0.18
  const totalRevenueNum = predictedRevenue + sponsorRevenue

  const totalFollowers = Object.values(artist.followers).reduce((a, b) => a + b, 0)
  const roi = totalRevenueNum > 0 ? ((totalRevenueNum - totalRevenueNum * 0.45) / (totalRevenueNum * 0.45)) * 100 : 0

  return {
    adjustedCap: mlData.predictions?.venue_capacity || mlData.venue_capacity || 5000,
    ticketsSold: predictedAttendance,
    atp: avgPrice,
    ticketRevenue: predictedRevenue,
    sponsorRevenue,
    totalRevenue: totalRevenueNum,
    sellThrough: fillRate * 100,
    roi,
    popularityScore: Math.min(Math.round(potentialScore), 99),
    demandScore: city.demand,
    source: mlData.predictions?.model_used || mlData.model_used || 'ml',
    revenueLower: mlData.predictions?.confidence_interval_95pct?.revenue_lower || mlData.confidence_interval_95pct?.revenue_lower,
    revenueUpper,
    confidenceAvailable: !!(mlData.predictions?.confidence_interval_95pct || mlData.confidence_interval_95pct),
  }
}

// Score bar component
function ScoreBar({ label, value, max = 100, color }) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
        <span className="text-xs font-bold" style={{ color }}>{value}{max === 100 ? '%' : ''}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${(value / max) * 100}%`, background: `linear-gradient(90deg, ${color}88, ${color})` }}
        />
      </div>
    </div>
  )
}

// Stat box
function StatBox({ label, value, sub, color, delay = 0 }) {
  return (
    <div className="glass-card p-4 animate-fade-up"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both', opacity: 0 }}>
      <p className="text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>{label}</p>
      <p className="font-display font-bold text-xl" style={{ color: color || 'var(--text-primary)' }}>{value}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}

function ProfitabilityPredictor({ artists = [] }) {
  const [selectedArtist, setArtist] = useState('')
  const [selectedCity, setCity]     = useState('')
  const [useML, setUseML] = useState(true)

  const artist = artists.find(a => a.id === selectedArtist)
  const city   = CITIES.find(c => c.name === selectedCity)

  const { data: mlResult, isLoading: mlLoading, error: mlError } = useAutoPredict(
    artist?.id, selectedCity, 5000, useML && !!artist && !!selectedCity
  )

  const { data: modelInfo } = useModelInfo()

  const pred = useMemo(() => {
    if (useML && mlResult && !mlError) return mlToPrediction(mlResult, artist, city)
    return heuristicPredict(artist, city)
  }, [useML, mlResult, mlError, artist, city])

  const cityComparison = useMemo(() => {
    if (!artist) return []
    return CITIES.map(c => ({
      name: c.name,
      revenue: heuristicPredict(artist, c)?.totalRevenue || 0,
    })).sort((a, b) => b.revenue - a.revenue)
  }, [artist])

  const predictionSource = pred?.source || 'heuristic'
  const isMLActive = useML && predictionSource !== 'heuristic' && !mlLoading

  return (
    <div>
      <div className="glass-card p-5 mb-6 animate-fade-up">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold" style={{ color: 'var(--text-primary)' }}>
            Configure Prediction
          </h3>
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none"
            style={{ color: 'var(--text-muted)' }}>
            <span>ML Engine</span>
            <button
              onClick={() => setUseML(!useML)}
              className="w-9 h-5 rounded-full relative transition-all duration-200 border-0 cursor-pointer"
              style={{ background: useML ? 'var(--accent-indigo)' : 'var(--border)' }}>
              <div className="w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-all duration-200"
                style={{ left: useML ? '1.375rem' : '0.25rem' }} />
            </button>
          </label>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-widest block mb-2"
              style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
              Select Artist
            </label>
            <select
              value={selectedArtist}
              onChange={e => setArtist(e.target.value)}
              className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all duration-200"
              style={{
                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                color: 'var(--text-primary)', fontFamily: 'Satoshi'
              }}
            >
              <option value="">Choose an artist...</option>
              {artists.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-widest block mb-2"
              style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
              Select City
            </label>
            <select
              value={selectedCity}
              onChange={e => setCity(e.target.value)}
              className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all duration-200"
              style={{
                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                color: 'var(--text-primary)', fontFamily: 'Satoshi'
              }}
            >
              <option value="">Choose a city...</option>
              {CITIES.map(c => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {!artist || !city ? (
        <div className="glass-card p-16 text-center animate-fade-up">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <Zap size={28} style={{ color: 'var(--accent-indigo)' }} />
          </div>
          <h3 className="font-display font-semibold text-lg mb-2" style={{ color: 'var(--text-primary)' }}>
            Select an Artist & City
          </h3>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Our AI model will predict revenue, ticket demand, and ROI
          </p>
        </div>
      ) : mlLoading && useML ? (
        <div className="glass-card p-12 text-center animate-fade-up">
          <div className="w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
          <h3 className="font-display font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
            Running ML Prediction
          </h3>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Analyzing {artist.name} for {city.name}...
          </p>
        </div>
      ) : pred ? (
        <>
          <div className="flex items-center gap-3 mb-4 animate-fade-up">
            <img src={artist.photo} alt={artist.name}
              className="w-12 h-12 rounded-xl object-cover"
              style={{ border: '2px solid var(--border-strong)' }} />
            <div>
              <p className="font-display font-bold" style={{ color: 'var(--text-primary)' }}>
                {artist.name} <span style={{ color: 'var(--text-muted)' }}>in</span> {city.name}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {isMLActive ? 'ML-powered prediction' : 'Heuristic estimate'} &middot; {modelInfo?.models?.filter(m => m.exists).length || 0} models active
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-xl"
              style={{
                background: isMLActive ? 'rgba(99,102,241,0.1)' : 'rgba(245,158,11,0.1)',
                border: `1px solid ${isMLActive ? 'rgba(99,102,241,0.2)' : 'rgba(245,158,11,0.2)'}`
              }}>
              {isMLActive ? <Cpu size={13} style={{ color: 'var(--accent-indigo)' }} /> : <Zap size={13} style={{ color: 'var(--accent-gold)' }} />}
              <span className="text-xs font-semibold" style={{ color: isMLActive ? 'var(--accent-indigo)' : 'var(--accent-gold)' }}>
                {isMLActive ? `ML ${predictionSource}` : 'Heuristic'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatBox label="Predicted Revenue"   value={formatCurrency(pred.totalRevenue)}   color="var(--accent-gold)"   delay={0} />
            <StatBox label="Est. Tickets Sold"   value={formatNumber(pred.ticketsSold)}       color="var(--accent-indigo)" delay={80} />
            <StatBox label="Avg. Ticket Price"   value={formatCurrency(pred.atp)}             color="var(--accent-green)"  delay={160} />
            <StatBox label="Projected ROI"       value={`${pred.roi.toFixed(1)}%`}            color={pred.roi > 50 ? 'var(--accent-green)' : 'var(--accent-gold)'} delay={240} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
            <div className="glass-card p-5 animate-fade-up" style={{ animationDelay: '100ms', animationFillMode: 'both', opacity: 0 }}>
              <h3 className="font-display font-semibold text-sm mb-4" style={{ color: 'var(--text-primary)' }}>
                Performance Scores
              </h3>
              <div className="space-y-4">
                <ScoreBar label="Popularity Score"   value={pred.popularityScore} color="#818CF8" />
                <ScoreBar label="City Demand Index"  value={pred.demandScore}     color="#FBBF24" />
                <ScoreBar label="Sell-Through Rate"  value={Math.round(pred.sellThrough)} color="#34D399" />
                <ScoreBar label="Revenue Confidence"
                  value={pred.confidenceAvailable ? Math.min(Math.round((pred.revenueLower / pred.revenueUpper) * 100), 97) : Math.min(Math.round(pred.popularityScore * 0.85 + 10), 97)}
                  color="#F87171" />
              </div>

              <div className="mt-5 p-3 rounded-xl"
                style={{ background: pred.roi > 60
                  ? 'rgba(16,185,129,0.08)' : pred.roi > 30
                  ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)',
                  border: `1px solid ${pred.roi > 60 ? 'rgba(16,185,129,0.2)' : pred.roi > 30 ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                <div className="flex items-center gap-2 mb-1">
                  <Trophy size={14} style={{ color: pred.roi > 60 ? 'var(--accent-green)' : pred.roi > 30 ? 'var(--accent-gold)' : 'var(--accent-red)' }} />
                  <span className="text-xs font-bold" style={{ color: pred.roi > 60 ? 'var(--accent-green)' : pred.roi > 30 ? 'var(--accent-gold)' : 'var(--accent-red)' }}>
                    {pred.roi > 60 ? 'Highly Profitable' : pred.roi > 30 ? 'Moderately Profitable' : 'High Risk'}
                  </span>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {pred.roi > 60
                    ? `Strong market fit. ${city.name} is an ideal venue for ${artist.name}.`
                    : pred.roi > 30
                    ? `Decent potential. Consider mid-size venues to reduce risk.`
                    : `Lower demand signals. Consider a smaller venue or different timing.`}
                </p>
              </div>
            </div>

            <ChartContainer title="Revenue Breakdown" subtitle="Ticket vs sponsor contribution" delay={180}>
              <BarChart
                data={[
                  { name: 'Ticket Revenue',  value: Math.round(pred.ticketRevenue)  },
                  { name: 'Sponsor Revenue', value: Math.round(pred.sponsorRevenue) },
                ]}
                xKey="name"
                layout="horizontal"
                bars={[{ key: 'value', label: 'Revenue (INR)', color: '#818CF8' }]}
                height={220}
              />
            </ChartContainer>
          </div>

          {cityComparison.length > 0 && (
            <ChartContainer
              title={`Best Cities for ${artist.name}`}
              subtitle="Predicted revenue across all cities ranked"
              delay={200}
            >
              <BarChart
                data={cityComparison}
                xKey="name"
                layout="horizontal"
                bars={[{ key: 'revenue', label: 'Predicted Revenue', color: '#FBBF24' }]}
                multiColor={false}
                height={260}
              />
            </ChartContainer>
          )}
        </>
      ) : (
        <div className="glass-card p-12 text-center animate-fade-up">
          <div className="w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <Activity size={24} style={{ color: 'var(--accent-red)' }} />
          </div>
          <h3 className="font-display font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
            Prediction Unavailable
          </h3>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Unable to generate a prediction. Try selecting a different artist or city.
          </p>
        </div>
      )}
    </div>
  )
}

// ARTIST COMPARISON
function ArtistComparison({ artists = [], concerts = [] }) {
  const [artistA, setArtistA] = useState('')
  const [artistB, setArtistB] = useState('')

  const a = artists.find(x => x.id === artistA)
  const b = artists.find(x => x.id === artistB)

  const concertsA = concerts.filter(c => c.artistId === a?.id)
  const concertsB = concerts.filter(c => c.artistId === b?.id)

  const statsA = a ? {
    totalFollowers:  Object.values(a.followers).reduce((s, v) => s + v, 0),
    avgRoG:          Object.values(a.rog).reduce((s, v) => s + v, 0) / (Object.values(a.rog).length || 1),
    totalRevenue:    concertsA.reduce((s, c) => s + Number(c.totalRevenue || 0), 0),
    totalTickets:    concertsA.reduce((s, c) => s + Number(c.ticketsSold || 0), 0),
    concertCount:    concertsA.length,
    topPlatform:     Object.entries(a.followers).sort((x, y) => y[1] - x[1])[0] || ['N/A', 0],
  } : null

  const statsB = b ? {
    totalFollowers:  Object.values(b.followers).reduce((s, v) => s + v, 0),
    avgRoG:          Object.values(b.rog).reduce((s, v) => s + v, 0) / (Object.values(b.rog).length || 1),
    totalRevenue:    concertsB.reduce((s, c) => s + Number(c.totalRevenue || 0), 0),
    totalTickets:    concertsB.reduce((s, c) => s + Number(c.ticketsSold || 0), 0),
    concertCount:    concertsB.length,
    topPlatform:     Object.entries(b.followers).sort((x, y) => y[1] - x[1])[0] || ['N/A', 0],
  } : null

  const getWinner = (valA, valB) => {
    if (valA > valB) return 'a'
    if (valB > valA) return 'b'
    return null
  }

  const comparisonRows = statsA && statsB ? [
    { label: 'Total Followers',  a: formatNumber(statsA.totalFollowers), b: formatNumber(statsB.totalFollowers),
      winner: getWinner(statsA.totalFollowers, statsB.totalFollowers) },
    { label: 'Avg. RoG',         a: `${statsA.avgRoG.toFixed(1)}%`,     b: `${statsB.avgRoG.toFixed(1)}%`,
      winner: getWinner(statsA.avgRoG, statsB.avgRoG) },
    { label: 'Total Revenue',    a: formatCurrency(statsA.totalRevenue), b: formatCurrency(statsB.totalRevenue),
      winner: getWinner(statsA.totalRevenue, statsB.totalRevenue) },
    { label: 'Tickets Sold',     a: formatNumber(statsA.totalTickets),   b: formatNumber(statsB.totalTickets),
      winner: getWinner(statsA.totalTickets, statsB.totalTickets) },
    { label: 'Concerts',         a: statsA.concertCount,                 b: statsB.concertCount,
      winner: getWinner(statsA.concertCount, statsB.concertCount) },
    { label: 'Top Platform',     a: statsA.topPlatform[0],               b: statsB.topPlatform[0],
      winner: getWinner(statsA.topPlatform[1], statsB.topPlatform[1]) },
  ] : []

  // Weighted overall winner
  const overallWinner = useMemo(() => {
    if (!statsA || !statsB) return null
    let scoreA = 0
    let scoreB = 0

    // Revenue (Weight: 4)
    if (statsA.totalRevenue > statsB.totalRevenue) scoreA += 4
    else if (statsB.totalRevenue > statsA.totalRevenue) scoreB += 4

    // Followers (Weight: 3)
    if (statsA.totalFollowers > statsB.totalFollowers) scoreA += 3
    else if (statsB.totalFollowers > statsA.totalFollowers) scoreB += 3

    // RoG (Weight: 2)
    if (statsA.avgRoG > statsB.avgRoG) scoreA += 2
    else if (statsB.avgRoG > statsA.avgRoG) scoreB += 2

    // Concerts (Weight: 1)
    if (statsA.concertCount > statsB.concertCount) scoreA += 1
    else if (statsB.concertCount > statsA.concertCount) scoreB += 1

    if (scoreA > scoreB) return 'a'
    if (scoreB > scoreA) return 'b'
    return 'tie'
  }, [statsA, statsB])

  // Normalised comparison data for bar chart
  const comparisonChartData = statsA && statsB ? [
    { metric: 'Followers (M)', a: statsA.totalFollowers / 1000000, b: statsB.totalFollowers / 1000000 },
    { metric: 'RoG %',        a: statsA.avgRoG,                   b: statsB.avgRoG                   },
    { metric: 'Revenue (10M)', a: statsA.totalRevenue / 10000000,  b: statsB.totalRevenue / 10000000  },
    { metric: 'Tickets (10K)', a: statsA.totalTickets / 10000,     b: statsB.totalTickets / 10000     },
  ] : []

  return (
    <div>
      {/* Artist selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        {/* Artist A */}
        <div className="glass-card p-5 animate-fade-up" style={{ animationFillMode: 'both', opacity: 0, borderLeft: '3px solid #818CF8' }}>
          <label className="text-xs font-semibold uppercase tracking-widest block mb-3"
            style={{ color: '#818CF8', fontSize: '10px' }}>
            Artist A
          </label>
          <select
            value={artistA}
            onChange={e => setArtistA(e.target.value)}
            className="w-full rounded-xl px-4 py-3 text-sm outline-none mb-3"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'Satoshi' }}
          >
            <option value="">Choose artist A...</option>
            {artists.map(x => (
              <option key={x.id} value={x.id}>{x.name}</option>
            ))}
          </select>
          {a && (
            <div className="flex items-center gap-3">
              <img src={a.photo} alt={a.name} className="w-10 h-10 rounded-xl object-cover" />
              <div>
                <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{a.name}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{a.genre} Â· {a.nationality}</p>
              </div>
            </div>
          )}
        </div>

        {/* Artist B */}
        <div className="glass-card p-5 animate-fade-up delay-1" style={{ animationFillMode: 'both', opacity: 0, borderLeft: '3px solid #FBBF24' }}>
          <label className="text-xs font-semibold uppercase tracking-widest block mb-3"
            style={{ color: '#FBBF24', fontSize: '10px' }}>
            Artist B
          </label>
          <select
            value={artistB}
            onChange={e => setArtistB(e.target.value)}
            className="w-full rounded-xl px-4 py-3 text-sm outline-none mb-3"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'Satoshi' }}
          >
            <option value="">Choose artist B...</option>
            {artists.map(x => (
              <option key={x.id} value={x.id}>{x.name}</option>
            ))}
          </select>
          {b && (
            <div className="flex items-center gap-3">
              <img src={b.photo} alt={b.name} className="w-10 h-10 rounded-xl object-cover" />
              <div>
                <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{b.name}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{b.genre} Â· {b.nationality}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Empty state */}
      {(!a || !b) && (
        <div className="glass-card p-16 text-center animate-fade-up">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <BarChart3 size={28} style={{ color: 'var(--accent-gold)' }} />
          </div>
          <h3 className="font-display font-semibold text-lg mb-2" style={{ color: 'var(--text-primary)' }}>
            Select Two Artists to Compare
          </h3>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Head-to-head stats, revenue, followers and RoG side by side
          </p>
        </div>
      )}

      {/* Comparison Results */}
      {a && b && statsA && statsB && (
        <>
          {/* Head to head table */}
          <div className="glass-card overflow-hidden mb-4 animate-fade-up">
            {/* Header */}
            <div className="grid grid-cols-3 p-4"
              style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
              <div className="flex items-center gap-2">
                <img src={a.photo} className="w-8 h-8 rounded-lg object-cover" alt={a.name} />
                <span className="font-display font-bold text-sm" style={{ color: '#818CF8' }}>{a.name}</span>
              </div>
              <div className="text-center">
                <span className="text-xs font-semibold uppercase tracking-widest"
                  style={{ color: 'var(--text-muted)', fontSize: '10px' }}>VS</span>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <span className="font-display font-bold text-sm" style={{ color: '#FBBF24' }}>{b.name}</span>
                <img src={b.photo} className="w-8 h-8 rounded-lg object-cover" alt={b.name} />
              </div>
            </div>

            {/* Rows */}
            {comparisonRows.map((row, i) => (
              <div key={i} className="grid grid-cols-3 px-4 py-3"
                style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-secondary)' }}>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm"
                    style={{ color: row.winner === 'a' ? '#818CF8' : 'var(--text-secondary)' }}>
                    {row.a}
                  </span>
                  {row.winner === 'a' && (
                    <Trophy size={12} style={{ color: '#818CF8' }} />
                  )}
                </div>
                <div className="text-center">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{row.label}</span>
                </div>
                <div className="flex items-center gap-2 justify-end">
                  {row.winner === 'b' && (
                    <Trophy size={12} style={{ color: '#FBBF24' }} />
                  )}
                  <span className="font-semibold text-sm"
                    style={{ color: row.winner === 'b' ? '#FBBF24' : 'var(--text-secondary)' }}>
                    {row.b}
                  </span>
                </div>
              </div>
            ))}

            {/* Winner Banner */}
            <div className="p-4"
              style={{
                background: overallWinner === 'tie'
                  ? 'var(--bg-secondary)'
                  : overallWinner === 'a'
                  ? 'linear-gradient(135deg, rgba(129,140,248,0.1), transparent)'
                  : 'linear-gradient(135deg, rgba(251,191,36,0.1), transparent)'
              }}>
              <div className="flex items-center gap-2">
                <Star size={16} style={{ color: 'var(--accent-gold)' }} />
                <span className="font-display font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                  {overallWinner === 'tie' ? 'Performance Tie:' : 'Overall Winner:'}
                </span>
                <span className="font-bold text-sm"
                  style={{
                    color: overallWinner === 'tie'
                      ? 'var(--text-muted)'
                      : overallWinner === 'a' ? '#818CF8' : '#FBBF24'
                  }}>
                  {overallWinner === 'tie' ? 'Both Artists' : overallWinner === 'a' ? a.name : b.name}
                </span>
                <span className="text-xs ml-1" style={{ color: 'var(--text-muted)' }}>
                  {overallWinner === 'tie'
                    ? 'â€” metrics are equal'
                    : `â€” higher overall performance score`}
                </span>
              </div>
            </div>
          </div>

          {/* Side by side charts */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartContainer
              title="Head-to-Head Metrics"
              subtitle="Normalised comparison across key indicators"
              delay={100}
            >
              <BarChart
                data={comparisonChartData}
                xKey="metric"
                layout="horizontal"
                bars={[
                  { key: 'a', label: a.name, color: '#818CF8' },
                  { key: 'b', label: b.name, color: '#FBBF24' },
                ]}
                height={260}
              />
            </ChartContainer>

            {/* Platform followers side by side */}
            <ChartContainer
              title="Platform Follower Breakdown"
              subtitle="Followers per platform comparison"
              delay={180}
            >
              <BarChart
                data={[
                  { platform: 'Instagram', a: a.followers.instagram, b: b.followers.instagram },
                  { platform: 'YouTube',   a: a.followers.youtube,   b: b.followers.youtube   },
                  { platform: 'Spotify',   a: a.followers.spotify,   b: b.followers.spotify   },
                ]}
                xKey="platform"
                layout="horizontal"
                bars={[
                  { key: 'a', label: a.name, color: '#818CF8' },
                  { key: 'b', label: b.name, color: '#FBBF24' },
                ]}
                height={260}
              />
            </ChartContainer>
          </div>
        </>
      )}
    </div>
  )
}

// â”€â”€ MAIN PAGE â”€â”€
function Analysis() {
  const [activeTab, setTab] = useState('Profitability Predictor')
  const { data: artists, concerts, isLoading } = useArtists()

  return (
    <div className="relative">
      {/* Ambient glows */}
      <div className="fixed top-32 right-32 w-80 h-80 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.06), transparent 70%)', filter: 'blur(40px)' }} />

      <PageHeader
        title="Analysis"
        subtitle="Revenue prediction and artist comparison engine"
      />

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-2xl mb-6 w-fit"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setTab(tab)}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200"
            style={activeTab === tab ? {
              background: 'linear-gradient(135deg, #6366F1, #818CF8)',
              color: '#fff',
              boxShadow: '0 4px 16px rgba(99,102,241,0.3)'
            } : {
              color: 'var(--text-muted)',
              background: 'transparent'
            }}
          >
            {tab === 'Profitability Predictor' ? 'ðŸŽ¯ ' : 'âš”ï¸ '}{tab}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {activeTab === 'Profitability Predictor' && <ProfitabilityPredictor artists={artists} />}
          {activeTab === 'Artist Comparison'       && <ArtistComparison artists={artists} concerts={concerts} />}
        </>
      )}
    </div>
  )
}

export default Analysis
