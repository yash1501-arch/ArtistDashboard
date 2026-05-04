import {
  PieChart as RePieChart, Pie, Cell,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'

const COLORS = ['#818CF8', '#FBBF24', '#34D399', '#F87171', '#A78BFA', '#38BDF8', '#FB923C']

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl p-3 text-xs shadow-2xl"
      style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }}>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full" style={{ background: payload[0].payload.fill || payload[0].color }} />
        <span style={{ color: 'var(--text-secondary)' }}>{payload[0].name}:</span>
        <span className="font-bold">{payload[0].value}%</span>
      </div>
    </div>
  )
}

function PieChart({ data = [], nameKey = 'name', valueKey = 'value', innerRadius = 60, height = 280 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RePieChart>
        <Pie data={data} dataKey={valueKey} nameKey={nameKey}
          cx="50%" cy="50%"
          innerRadius={innerRadius} outerRadius={innerRadius + 48}
          paddingAngle={3} strokeWidth={0}>
          {data.map((entry, index) => (
            <Cell key={index} fill={entry.color || COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend iconType="circle" iconSize={7}
          wrapperStyle={{ fontSize: '11px', paddingTop: '12px', fontFamily: 'Satoshi', color: 'var(--text-secondary)' }} />
      </RePieChart>
    </ResponsiveContainer>
  )
}

export default PieChart