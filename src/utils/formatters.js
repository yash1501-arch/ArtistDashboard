// Format numbers → 1,200,000 → "1.2M"
export function formatNumber(num) {
  if (!num && num !== 0) return '—'
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + 'B'
  if (num >= 1_000_000)     return (num / 1_000_000).toFixed(1) + 'M'
  if (num >= 1_000)         return (num / 1_000).toFixed(1) + 'K'
  return num.toLocaleString('en-IN')
}

// Format currency → 175000 → "₹1.75L"
export function formatCurrency(num) {
  if (!num && num !== 0) return '—'
  if (num >= 10_000_000) return '₹' + (num / 10_000_000).toFixed(2) + 'Cr'
  if (num >= 100_000)    return '₹' + (num / 100_000).toFixed(2) + 'L'
  if (num >= 1_000)      return '₹' + (num / 1_000).toFixed(1) + 'K'
  return '₹' + num.toLocaleString('en-IN')
}

// Format RoG → 12.4 → "+12.4%"
export function formatRoG(value) {
  if (!value && value !== 0) return '—'
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

// Format date → "2024-03-15" → "15 Mar 2024"
export function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day:   '2-digit',
    month: 'short',
    year:  'numeric',
  })
}

// Format percentage → 0.742 → "74.2%"
export function formatPercent(value) {
  if (!value && value !== 0) return '—'
  return `${(value * 100).toFixed(1)}%`
}

// Sell-through % → tickets sold / capacity
export function sellThrough(sold, capacity) {
  if (!capacity) return '—'
  return `${((sold / capacity) * 100).toFixed(1)}%`
}

// Truncate long text
export function truncate(str, maxLength = 40) {
  if (!str) return '—'
  return str.length > maxLength ? str.slice(0, maxLength) + '...' : str
}

// Platform display names & colours
export const PLATFORM_META = {
  instagram:   { label: 'Instagram',   color: '#E1306C', bg: '#FDE8F1' },
  youtube:     { label: 'YouTube',     color: '#FF0000', bg: '#FFE5E5' },
  spotify:     { label: 'Spotify',     color: '#1DB954', bg: '#E5F8EC' },
  facebook:    { label: 'Facebook',    color: '#1877F2', bg: '#E7F0FD' },
  twitter:     { label: 'Twitter/X',   color: '#000000', bg: '#F0F0F0' },
  apple_music: { label: 'Apple Music', color: '#FC3C44', bg: '#FFE9EA' },
  reddit:      { label: 'Reddit',      color: '#FF4500', bg: '#FFF0E8' },
  quora:       { label: 'Quora',       color: '#B92B27', bg: '#FAEAEA' },
}

// Genre colours for charts
export const GENRE_COLORS = [
  '#2563EB', '#F97316', '#0D9488', '#7C3AED',
  '#15803D', '#DC2626', '#0891B2', '#D97706',
]