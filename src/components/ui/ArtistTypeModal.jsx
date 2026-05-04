import useFilterStore from '../../store/useFilterStore'

function ArtistTypeModal() {
  const { artistType, setArtistType } = useFilterStore()

  if (artistType !== null) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(16px)' }}>
      <div className="w-full max-w-lg mx-4">
        <div className="rounded-3xl p-8 relative overflow-hidden"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-strong)' }}>

          {/* Ambient glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.2), transparent 70%)', filter: 'blur(20px)' }} />

          {/* Header */}
          <div className="text-center mb-8 relative z-10">
            <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center text-3xl"
              style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(129,140,248,0.1))', border: '1px solid rgba(99,102,241,0.3)' }}>
              🎵
            </div>
            <h2 className="font-display font-bold text-2xl mb-2" style={{ color: 'var(--text-primary)' }}>
              Welcome to ArtistIQ
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Select the artist market you want to explore
            </p>
          </div>

          {/* Choices */}
          <div className="grid grid-cols-2 gap-4 relative z-10">

            {/* Indian */}
            <button
              onClick={() => setArtistType('indian')}
              className="p-6 rounded-2xl text-left transition-all duration-300"
              style={{ background: 'rgba(255,153,51,0.06)', border: '1px solid rgba(255,153,51,0.25)' }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255,153,51,0.12)'
                e.currentTarget.style.borderColor = 'rgba(255,153,51,0.5)'
                e.currentTarget.style.transform = 'translateY(-3px)'
                e.currentTarget.style.boxShadow = '0 12px 32px rgba(255,153,51,0.15)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255,153,51,0.06)'
                e.currentTarget.style.borderColor = 'rgba(255,153,51,0.25)'
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <div className="text-4xl mb-3">🇮🇳</div>
              <h3 className="font-display font-bold text-lg mb-1" style={{ color: 'var(--text-primary)' }}>
                Indian
              </h3>
              <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                Bollywood, Classical, Regional & more
              </p>
              <div className="flex flex-wrap gap-1.5">
                {['Arijit Singh', 'AR Rahman', 'Shreya Ghoshal'].map(n => (
                  <span key={n} className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(255,153,51,0.15)', color: '#FF9933' }}>
                    {n}
                  </span>
                ))}
              </div>
            </button>

            {/* International */}
            <button
              onClick={() => setArtistType('international')}
              className="p-6 rounded-2xl text-left transition-all duration-300"
              style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.25)' }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(99,102,241,0.12)'
                e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'
                e.currentTarget.style.transform = 'translateY(-3px)'
                e.currentTarget.style.boxShadow = '0 12px 32px rgba(99,102,241,0.15)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(99,102,241,0.06)'
                e.currentTarget.style.borderColor = 'rgba(99,102,241,0.25)'
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <div className="text-4xl mb-3">🌍</div>
              <h3 className="font-display font-bold text-lg mb-1" style={{ color: 'var(--text-primary)' }}>
                International
              </h3>
              <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                Pop, R&B, Hip-Hop & more
              </p>
              <div className="flex flex-wrap gap-1.5">
                {['Dua Lipa', 'The Weeknd', 'Ed Sheeran'].map(n => (
                  <span key={n} className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(99,102,241,0.15)', color: '#818CF8' }}>
                    {n}
                  </span>
                ))}
              </div>
            </button>
          </div>

          <p className="text-center text-xs mt-6 relative z-10" style={{ color: 'var(--text-muted)' }}>
            You can switch between markets anytime using the toggle in the top bar
          </p>
        </div>
      </div>
    </div>
  )
}

export default ArtistTypeModal