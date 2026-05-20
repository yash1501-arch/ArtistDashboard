import { useState } from 'react'
import PageHeader from '../components/ui/PageHeader'
import ChartContainer from '../components/charts/ChartContainer'
import PieChart from '../components/charts/PieChart'
import BarChart from '../components/charts/BarChart'
import { formatNumber } from '../utils/formatters'
import { mockAgeData, mockArtists, mockGenderData, mockGenreData } from '../utils/mockData'

const PLATFORMS = ['All Platforms', 'Instagram', 'YouTube', 'Spotify']

const cityData = [
  { city: 'Mumbai',    audience: 4200000 },
  { city: 'Delhi',     audience: 3800000 },
  { city: 'Bangalore', audience: 2900000 },
  { city: 'Chennai',   audience: 1800000 },
  { city: 'Kolkata',   audience: 1600000 },
  { city: 'Hyderabad', audience: 1400000 },
  { city: 'Pune',      audience: 980000  },
  { city: 'Ahmedabad', audience: 750000  },
]

const summaryStats = [
  { label: 'Largest Age Group', value: '18–24',    sub: '34% of audience'               },
  { label: 'Dominant Gender',   value: 'Male',      sub: '54% of audience'               },
  { label: 'Top City',          value: 'Mumbai',    sub: formatNumber(4200000) + ' listeners' },
  { label: 'Top Genre',         value: 'Bollywood', sub: formatNumber(4200000) + ' streams'   },
]

function Demographics() {
  const [selectedArtist, setArtist]   = useState('all')
  const [selectedPlatform, setPlatform] = useState('All Platforms')

  return (
    <div className="relative">
      <div className="fixed bottom-20 left-72 w-80 h-80 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.06), transparent 70%)', filter: 'blur(40px)' }} />

      <PageHeader title="Demographics" subtitle="Audience breakdown by age, gender, geography and genre" />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <select value={selectedArtist} onChange={e => setArtist(e.target.value)}
          className="text-sm rounded-xl px-4 py-3 outline-none"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'Satoshi' }}>
          <option value="all">All Artists</option>
          {mockArtists.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <div className="flex gap-2 flex-wrap">
          {PLATFORMS.map(p => (
            <button key={p} onClick={() => setPlatform(p)}
              className="text-xs px-3 py-1.5 rounded-xl font-medium transition-all duration-200"
              style={selectedPlatform === p ? {
                background: 'linear-gradient(135deg, #10B981, #34D399)',
                color: '#fff', boxShadow: '0 4px 12px rgba(16,185,129,0.3)'
              } : {
                background: 'var(--bg-card)', color: 'var(--text-muted)', border: '1px solid var(--border)'
              }}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Row 1: Age + Gender */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <ChartContainer title="Audience Age Distribution" subtitle="% of total audience by age group" delay={0}>
          <PieChart data={mockAgeData} nameKey="name" valueKey="value" innerRadius={60} height={260} />
          <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
            {mockAgeData.map((row, i) => (
              <div key={i} className="flex items-center justify-between py-1.5">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{row.name}</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                    <div className="h-full rounded-full" style={{ width: `${row.value}%`, background: 'var(--accent-indigo)' }} />
                  </div>
                  <span className="text-xs font-bold w-8 text-right" style={{ color: 'var(--text-primary)' }}>{row.value}%</span>
                </div>
              </div>
            ))}
          </div>
        </ChartContainer>

        <ChartContainer title="Gender Distribution" subtitle="% of total audience by gender" delay={80}>
          <PieChart data={mockGenderData} nameKey="name" valueKey="value" innerRadius={60} height={260} />
          <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
            {mockGenderData.map((row, i) => (
              <div key={i} className="flex items-center justify-between py-1.5">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{row.name}</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                    <div className="h-full rounded-full" style={{ width: `${row.value}%`, background: 'var(--accent-gold)' }} />
                  </div>
                  <span className="text-xs font-bold w-8 text-right" style={{ color: 'var(--text-primary)' }}>{row.value}%</span>
                </div>
              </div>
            ))}
          </div>
        </ChartContainer>
      </div>

      {/* Row 2: Genre + City */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <ChartContainer title="Genre Popularity" subtitle="Total streams by music genre" delay={120}>
          <BarChart data={mockGenreData} xKey="genre" layout="vertical"
            bars={[{ key: 'streams', label: 'Streams' }]} multiColor={true} height={280} />
        </ChartContainer>
        <ChartContainer title="Audience by City" subtitle="Top cities by listener count" delay={200}>
          <BarChart data={cityData} xKey="city" layout="vertical"
            bars={[{ key: 'audience', label: 'Audience', color: '#34D399' }]} height={280} />
        </ChartContainer>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {summaryStats.map((stat, i) => (
          <div key={i} className="glass-card p-4 animate-fade-up"
            style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'both', opacity: 0 }}>
            <p className="text-xs uppercase tracking-widest mb-1"
              style={{ color: 'var(--text-muted)', fontSize: '10px' }}>{stat.label}</p>
            <p className="font-display font-bold text-xl" style={{ color: 'var(--text-primary)' }}>{stat.value}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{stat.sub}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Demographics
