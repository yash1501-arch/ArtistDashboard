// Format numbers → 1,200,000 → "1.2M"
export function formatNumber(num) {
  if (!num && num !== 0) return '—'
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + 'B'
  if (num >= 1_000_000)     return (num / 1_000_000).toFixed(1) + 'M'
  if (num >= 1_000)         return (num / 1_000).toFixed(1) + 'K'
  return num.toLocaleString('en-IN')
}

// Format currency → 175000 → "₹1.75L"
export function formatCurrency(num, opts = {}) {
  if (!num && num !== 0) return '—'
  const { country, city } = opts

  // Helper list of common Indian cities (lowercase) for city-based detection
  const INDIAN_CITIES = ['mumbai', 'delhi', 'bangalore', 'chennai', 'kolkata', 'hyderabad', 'pune', 'ahmedabad', 'goa', 'kochi', 'jaipur', 'lucknow', 'surat']

  // If country is India (or unspecified but city is an Indian city), keep INR compact formatting
  const countryLower = country ? String(country).toLowerCase() : ''
  const cityLower = city ? String(city).toLowerCase() : ''
  if (!country && cityLower && INDIAN_CITIES.includes(cityLower)) {
    // treat as India
  }

  if (!country || countryLower.includes('india') || countryLower === 'in' || (cityLower && INDIAN_CITIES.includes(cityLower))) {
    if (num >= 10_000_000) return '₹' + (num / 10_000_000).toFixed(2) + 'Cr'
    if (num >= 100_000)    return '₹' + (num / 100_000).toFixed(2) + 'L'
    if (num >= 1_000)      return '₹' + (num / 1_000).toFixed(1) + 'K'
    return '₹' + num.toLocaleString('en-IN')
  }

  // Mapping of country -> currency code & locale
  const countryMap = {
    'united states': { currency: 'USD', locale: 'en-US' },
    'usa':           { currency: 'USD', locale: 'en-US' },
    'us':            { currency: 'USD', locale: 'en-US' },
    'united kingdom':{ currency: 'GBP', locale: 'en-GB' },
    'uk':            { currency: 'GBP', locale: 'en-GB' },
    'germany':       { currency: 'EUR', locale: 'de-DE' },
    'france':        { currency: 'EUR', locale: 'fr-FR' },
    'europe':        { currency: 'EUR', locale: 'en-IE' },
    'uae':           { currency: 'AED', locale: 'en-AE' },
    'singapore':     { currency: 'SGD', locale: 'en-SG' },
    'canada':        { currency: 'CAD', locale: 'en-CA' },
    'australia':     { currency: 'AUD', locale: 'en-AU' },
  }

  const lower = String(country).toLowerCase()
  const mapped = countryMap[lower] || { currency: 'USD', locale: 'en-US' }

  // NOTE: Currency conversion (INR -> target currency) has been intentionally
  // disabled per the current requirement: keep numeric values unchanged but
  // display the target currency symbol. The original exchange rate logic is
  // retained below as commented code for easy re-enabling in future.

  /*
  // Exchange rates: approximate INR -> target currency (static defaults)
  const exchangeRates = {
    USD: 0.012, // 1 INR ≈ 0.012 USD
    GBP: 0.0097,
    EUR: 0.011,
    AED: 0.044,
    SGD: 0.016,
    CAD: 0.016,
    AUD: 0.018,
  }

  const rate = exchangeRates[mapped.currency] || exchangeRates.USD
  const converted = Number(num) * rate
  */

  try {
    // Format the original numeric value but use the mapped currency symbol/locale.
    // This does NOT convert the numeric amount; it only changes the displayed
    // currency symbol/format per country.
    const nf = new Intl.NumberFormat(mapped.locale, { style: 'currency', currency: mapped.currency, notation: 'compact', maximumFractionDigits: 2 })
    return nf.format(Number(num))
  } catch (e) {
    return `${mapped.currency} ${Number(num).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  }
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