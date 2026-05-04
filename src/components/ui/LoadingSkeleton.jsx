function SkeletonBox({ className }) {
  return (
    <div className={`animate-pulse bg-gray-200 rounded-lg ${className}`} />
  )
}

export function KpiSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <SkeletonBox className="h-3 w-24 mb-3" />
      <SkeletonBox className="h-8 w-32 mb-2" />
      <SkeletonBox className="h-3 w-16" />
    </div>
  )
}

export function ChartSkeleton({ height = 'h-64' }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-5 shadow-sm ${height}`}>
      <SkeletonBox className="h-4 w-32 mb-4" />
      <SkeletonBox className="h-full w-full" />
    </div>
  )
}

export function TableSkeleton({ rows = 5 }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-gray-100">
        <SkeletonBox className="h-4 w-40" />
      </div>
      <div className="divide-y divide-gray-100">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4">
            <SkeletonBox className="w-9 h-9 rounded-full" />
            <SkeletonBox className="h-3 w-32" />
            <SkeletonBox className="h-3 w-20 ml-auto" />
            <SkeletonBox className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function CardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-center gap-4 mb-4">
        <SkeletonBox className="w-12 h-12 rounded-full" />
        <div className="flex-1">
          <SkeletonBox className="h-4 w-32 mb-2" />
          <SkeletonBox className="h-3 w-20" />
        </div>
      </div>
      <SkeletonBox className="h-3 w-full mb-2" />
      <SkeletonBox className="h-3 w-4/5" />
    </div>
  )
}

export default SkeletonBox