import { useState, useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { formatCompact } from '../../utils'
import { ChartTooltipProps } from '../../types/inference'

interface EpochAreaChartProps {
  title: string
  data: Array<{ epoch: number; [key: string]: number }>
}

const COLORS = ['#3ee5b1', '#60a5fa', '#c084fc', '#fbbf24', '#fb7185']

function safeId(input: string) {
  return input.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function stringHash(str: string) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function buildStableColorMap(names: string[]) {
  const sorted = [...names].sort((a, b) => stringHash(a) - stringHash(b))
  const map: Record<string, string> = {}
  sorted.forEach((name, index) => {
    map[name] = COLORS[index % COLORS.length]
  })
  return map
}

const AreaTooltip = ({ active, payload, label }: ChartTooltipProps) => {
  if (!active || !payload || !payload.length) return null

  const sorted = [...payload].sort((a, b) => {
    const va = Number(a.value ?? 0)
    const vb = Number(b.value ?? 0)
    return vb - va
  })

  return (
    <div className="rounded-lg p-3 text-xs shadow-pop max-w-[280px] backdrop-blur-xl"
      style={{
        background: 'rgba(19, 23, 28, 0.96)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div className="font-bold mb-2 text-slate-50 tracking-tight">Epoch {label}</div>
      {sorted.map((item) => {
        const value = Number(item.value ?? 0)
        const isZero = value === 0

        return (
          <div
            key={item.dataKey}
            className={`flex justify-between gap-3 mb-0.5 ${isZero ? 'opacity-40' : ''}`}
            style={{ color: item.color }}
          >
            <span className="truncate max-w-[150px] sm:max-w-[180px] font-medium">{item.dataKey}</span>
            <span className="font-mono tabular-nums">{value.toLocaleString()}</span>
          </div>
        )
      })}
    </div>
  )
}

export function EpochAreaChart({ title, data }: EpochAreaChartProps) {
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set())
  const [activeEpoch, setActiveEpoch] = useState<number | null>(null)

  const keys = data.length ? Object.keys(data[0]).filter((k) => k !== 'epoch') : []
  const keysKey = keys.join(',')

  const colorMap = useMemo(() => buildStableColorMap(keys), [keysKey]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!data.length) return null

  const toggleKeys = (key: string) => {
    setHiddenKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const getSortedKeys = () => {
    const epoch = activeEpoch ?? data[data.length - 1]?.epoch
    if (epoch == null) return keys
    const row = data.find((d) => d.epoch === epoch)
    if (!row) return keys
    return [...keys].sort((a, b) => {
      const va = row[a] ?? 0
      const vb = row[b] ?? 0
      return vb - va
    })
  }

  return (
    <div className="surface p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <h3 className="text-base sm:text-lg font-bold text-slate-50 shrink-0 leading-tight tracking-tight">{title}</h3>

        <div className="flex flex-wrap sm:justify-end gap-x-3 sm:gap-x-4 gap-y-2 w-full sm:w-auto sm:max-w-[70%]">
          {getSortedKeys().map((key) => {
            const hidden = hiddenKeys.has(key)
            const color = colorMap[key]

            return (
              <button
                key={key}
                className={`group inline-flex items-center gap-1.5 cursor-pointer text-xs font-medium select-none transition-all duration-150 ${
                  hidden ? 'text-slate-600' : 'text-slate-300 hover:text-slate-50'
                }`}
                onClick={() => toggleKeys(key)}
              >
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full transition-transform duration-200 group-hover:scale-110"
                  style={{
                    backgroundColor: hidden ? 'rgba(255,255,255,0.10)' : color,
                    boxShadow: hidden ? 'none' : `0 0 8px ${color}66`,
                  }}
                />
                <span className="truncate max-w-[120px] sm:max-w-[180px]">{key}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="h-72 sm:h-80 overflow-x-auto">
        <div className="h-full min-w-[640px] sm:min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              onMouseMove={(state) => {
                if (state?.activeLabel != null) {
                  setActiveEpoch(Number(state.activeLabel))
                }
              }}
              onMouseLeave={() => setActiveEpoch(null)}
            >
              <defs>
                {keys.map((key) => {
                  const gid = safeId(key)
                  return (
                    <linearGradient key={gid} id={`gradient-${gid}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={colorMap[key]} stopOpacity={0.45} />
                      <stop offset="95%" stopColor={colorMap[key]} stopOpacity={0.02} />
                    </linearGradient>
                  )
                })}
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="epoch"
                tick={{ fontSize: 11, fill: 'rgb(115,124,140)' }}
                axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                tickLine={false}
                tickMargin={8}
              />
              <YAxis
                domain={[0, 'dataMax * 1.1']}
                tickFormatter={formatCompact}
                tick={{ fontSize: 11, fill: 'rgb(115,124,140)' }}
                axisLine={false}
                tickLine={false}
                width={48}
              />

              <Tooltip
                content={<AreaTooltip />}
                cursor={{ stroke: 'rgba(62,229,177,0.35)', strokeWidth: 1, strokeDasharray: '2 2' }}
                labelFormatter={(label) => label}
              />

              {keys.map((key) => {
                if (hiddenKeys.has(key)) return null
                const gid = safeId(key)
                return (
                  <Area
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={colorMap[key]}
                    strokeWidth={2}
                    fill={`url(#gradient-${gid})`}
                    isAnimationActive={false}
                  />
                )
              })}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
