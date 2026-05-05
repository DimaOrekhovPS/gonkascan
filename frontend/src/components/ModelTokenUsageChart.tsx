import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { formatCompact } from '../utils'
import { ChartTooltipProps } from '../types/inference'

interface TokenUsageRow {
  epoch: number
  prompt_token: number
  completion_token: number
}

function TokenUsageTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  const prompt = payload.find((p) => p.dataKey === 'prompt_token')?.value ?? 0
  const completion = payload.find((p) => p.dataKey === 'completion_token')?.value ?? 0
  const total = prompt + completion

  return (
    <div className="rounded-lg border border-white/[0.10] bg-night-300 overflow-hidden min-w-[160px] sm:min-w-[180px] max-w-[240px]">
      <div className="bg-black text-white text-[10px] sm:text-[11px] font-medium px-2 py-1">{label}</div>

      <div className="px-2 py-2 text-[11px] sm:text-[12px] space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-accent-300">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-600" />Prompt tokens
          </div>
          <div className="font-medium">{formatCompact(prompt)}</div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-accent-300">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-600" />Completion tokens
          </div>
          <div className="font-medium">{formatCompact(completion)}
          </div>
        </div>
      </div>

      <div className="border-t border-white/[0.06] px-2 py-1.5 flex justify-between text-[11px] sm:text-[12px] font-semibold">
        <span>Total</span>
        <span>{formatCompact(total)}</span>
      </div>
    </div>
  )
}

export function ModelTokenUsageChart({ data }: { data: TokenUsageRow[] }) {
  return (
    <div className="bg-transparent relative z-0">
      <h3 className="text-base sm:text-lg font-semibold text-slate-50 mb-1">Recent Activity</h3>
      <p className="text-xs sm:text-sm text-slate-400 mb-3 sm:mb-4 leading-relaxed">Token usage per epoch</p>

      <div className="h-64 sm:h-72 overflow-x-auto">
        <div className="h-full min-w-[640px] sm:min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <XAxis dataKey="epoch" tick={{ fontSize: 11 }} tickMargin={8} />
              <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11 }} width={48} />
              <Tooltip content={<TokenUsageTooltip />} cursor={{ fillOpacity: 0.08 }} />
              <Bar dataKey="prompt_token" stackId="tokens" fill="#3b82f6" name="Prompt tokens"/>
              <Bar dataKey="completion_token" stackId="tokens" fill="#10b981" name="Completion tokens"/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
