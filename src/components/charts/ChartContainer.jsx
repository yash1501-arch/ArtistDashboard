import { Download } from 'lucide-react'

function ChartContainer({ title, subtitle, children, onExport, delay = 0 }) {
  return (
    <div
      className="glass-card p-5 animate-fade-up"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both', opacity: 0 }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h3 className="font-display font-semibold text-sm"
            style={{ color: 'var(--text-primary)' }}>
            {title}
          </h3>
          {subtitle && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>
          )}
        </div>
        {onExport && (
          <button
            onClick={onExport}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-all duration-200"
            style={{ color: 'var(--text-muted)', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
          >
            <Download size={12} />
            Export
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

export default ChartContainer