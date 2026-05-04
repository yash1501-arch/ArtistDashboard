import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

function RoGBadge({ value, size = 'sm' }) {
  if (!value && value !== 0) return <span style={{ color: 'var(--text-muted)' }} className="text-xs">—</span>

  const isPositive = value > 0
  const isZero     = value === 0

  const colors = isZero
    ? { bg: 'var(--border)', color: 'var(--text-muted)' }
    : isPositive
    ? { bg: 'rgba(16,185,129,0.15)', color: 'var(--accent-green)' }
    : { bg: 'rgba(239,68,68,0.15)',  color: 'var(--accent-red)'   }

  return (
    <span className="inline-flex items-center gap-1 font-semibold rounded-full px-2 py-0.5"
      style={{ background: colors.bg, color: colors.color, fontSize: '11px' }}>
      {isZero     ? <Minus size={10} /> :
       isPositive ? <TrendingUp size={10} /> :
                    <TrendingDown size={10} />}
      {isPositive ? '+' : ''}{value.toFixed(1)}%
    </span>
  )
}

export default RoGBadge 