function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex items-start justify-between mb-6 animate-fade-up">
      <div>
        <h1 className="font-display font-bold text-3xl mb-1"
          style={{ color: 'var(--text-primary)' }}>
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>
        )}
      </div>
      {children && (
        <div className="flex items-center gap-3">{children}</div>
      )}
    </div>
  )
}

export default PageHeader