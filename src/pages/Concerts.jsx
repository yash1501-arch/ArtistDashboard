import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Calendar, MapPin, TrendingUp, Ticket, Loader2, AlertCircle } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import EmptyState from '../components/ui/EmptyState'
import { useConcerts } from '../hooks/useConcerts'
import { formatNumber, formatCurrency, formatDate } from '../utils/formatters'

const CITIES = ['All', 'Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Kolkata']

function Concerts() {
  const navigate = useNavigate()
  const [search, setSearch]   = useState('')
  const [activeCity, setCity] = useState('All')
  const [sortBy, setSortBy]   = useState('date')
  const observerTarget = useRef(null)

  const { 
    data: concerts = [], 
    total,
    isLoading, 
    error, 
    fetchNextPage, 
    hasNextPage, 
    isFetchingNextPage 
  } = useConcerts({
    city: activeCity === 'All' ? undefined : activeCity,
    limit: 50
  })

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { threshold: 0.1 }
    )

    if (observerTarget.current) {
      observer.observe(observerTarget.current)
    }

    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const filtered = concerts
    .filter(c => 
      (c.artist || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.city || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.name || '').toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === 'date') return new Date(b.date) - new Date(a.date)
      if (sortBy === 'revenue') return (b.total_revenue || 0) - (a.total_revenue || 0)
      if (sortBy === 'tickets') return (b.tickets_sold || 0) - (a.tickets_sold || 0)
      return 0
    })

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Concerts" 
        subtitle={`Managing ${formatNumber(total || 0)} concert events across ${CITIES.length - 1} major cities`}
      />

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between glass-card p-4">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={18} />
          <input
            type="text"
            placeholder="Search artists, venues or cities..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500/50 outline-none transition-all text-sm"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 w-full md:w-auto">
          {CITIES.map(city => (
            <button
              key={city}
              onClick={() => setCity(city)}
              className={`px-4 py-2 rounded-xl text-xs font-medium transition-all whitespace-nowrap border ${
                activeCity === city 
                  ? 'bg-indigo-500 border-indigo-400 text-white shadow-lg shadow-indigo-500/20' 
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white'
              }`}
            >
              {city}
            </button>
          ))}
        </div>
      </div>

      {isLoading && concerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="text-indigo-500 animate-spin" size={40} />
          <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Fetching concert database...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 glass-card">
          <AlertCircle className="text-red-500" size={40} />
          <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
            {error.response?.data?.message || error.message || 'Error loading concerts.'}
          </p>
          <button onClick={() => window.location.reload()} className="text-xs px-4 py-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            Try Refreshing
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No concerts found" subtitle="Try adjusting your search or city filter" />
      ) : (
        <div className="glass-card overflow-hidden animate-fade-up">
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
              <tr>
                {['Artist', 'Concert', 'Date', 'City / Venue', 'Tickets Sold', 'Sell-Through', 'Revenue'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest"
                    style={{ color: 'var(--text-muted)', fontSize: '10px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => {
                const tickets = Number(c.tickets_sold || 0)
                const capacity = Number(c.capacity || 0)
                const st = capacity > 0 ? (tickets / capacity) * 100 : 0
                const stFormatted = st > 0 ? st.toFixed(1) : '0.0'
                
                return (
                  <tr key={c.id} onClick={() => navigate(`/concerts/${c.id}`)}
                    className="cursor-pointer transition-all duration-150"
                    style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td className="px-4 py-3 font-bold font-display text-sm" style={{ color: 'var(--accent-indigo)' }}>
                      {c.artist || 'Unknown Artist'}
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {c.name || 'Live Event'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                        <Calendar size={11} />
                        {formatDate(c.date)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-white">{c.city}</span>
                        <div className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          <MapPin size={9} />
                          {c.venue || 'TBA'}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-white font-mono">
                      {formatNumber(tickets)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-1.5 w-16 bg-white/5 rounded-full overflow-hidden flex-shrink-0">
                          <div className="h-full rounded-full transition-all duration-500"
                            style={{ 
                              width: `${Math.min(st, 100)}%`,
                              backgroundColor: st >= 95 ? '#10B981' : st >= 80 ? '#F59E0B' : '#6366F1'
                            }} />
                        </div>
                        <span className="text-xs font-medium" style={{ color: st >= 95 ? '#10B981' : 'var(--text-secondary)' }}>
                          {stFormatted}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-white">
                      {formatCurrency(c.total_revenue)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          
          <div ref={observerTarget} className="py-8 flex justify-center">
            {isFetchingNextPage ? (
              <div className="flex items-center gap-2 text-indigo-400">
                <Loader2 size={20} className="animate-spin" />
                <span className="text-xs font-medium">Loading more concerts...</span>
              </div>
            ) : hasNextPage ? (
              <div className="h-4" />
            ) : filtered.length > 0 ? (
              <p className="text-xs text-white/20 italic">No more concerts to load</p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}

export default Concerts