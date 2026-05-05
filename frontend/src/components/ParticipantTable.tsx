import { Participant } from '../types/inference'
import { Badge } from './common/Badge'

interface ParticipantTableProps {
  participants: Participant[]
  epochId: number
  isCurrentEpoch: boolean
  currentEpochId: number | null
  selectedParticipantId?: string | null
  onParticipantSelect: (participantId: string | null) => void
}

const criticalThresholds = [
  { total: 5, critical: 3 },
  { total: 10, critical: 4 },
  { total: 20, critical: 5 },
  { total: 30, critical: 7 },
  { total: 50, critical: 10 },
  { total: 80, critical: 14 },
  { total: 100, critical: 16 },
  { total: 150, critical: 22 },
  { total: 200, critical: 28 },
  { total: 250, critical: 34 },
  { total: 300, critical: 40 },
  { total: 400, critical: 51 },
  { total: 500, critical: 62 },
  { total: 600, critical: 73 },
  { total: 700, critical: 84 },
  { total: 800, critical: 95 },
  { total: 900, critical: 106 },
  { total: 990, critical: 116 },
]

function missedStatTest(nMissed: number, nTotal: number): boolean {
  if (nTotal === 0) return true
  if (nMissed < 0 || nTotal < 0 || nMissed > nTotal) return true
  if (nTotal > 990) return nMissed * 10 <= nTotal
  if (nTotal < criticalThresholds[0].total) return true

  for (let i = 0; i < criticalThresholds.length - 1; i++) {
    const lower = criticalThresholds[i]
    const upper = criticalThresholds[i + 1]
    if (nTotal >= lower.total && nTotal <= upper.total) {
      const ratio = (nTotal - lower.total) / (upper.total - lower.total)
      const interpolatedCritical = lower.critical + ratio * (upper.critical - lower.critical)
      return nMissed <= interpolatedCritical
    }
  }
  const lastThreshold = criticalThresholds[criticalThresholds.length - 1]
  return nMissed <= lastThreshold.critical
}

interface StatusDotProps {
  state: 'ok' | 'bad' | 'unknown'
  title: string
}

function StatusDot({ state, title }: StatusDotProps) {
  const cls =
    state === 'ok'
      ? 'bg-accent-400 shadow-[0_0_0_3px_rgba(62,229,177,0.15),0_0_8px_rgba(62,229,177,0.6)]'
      : state === 'bad'
        ? 'bg-red-400 shadow-[0_0_0_3px_rgba(248,113,113,0.18),0_0_8px_rgba(248,113,113,0.5)]'
        : 'bg-slate-600 shadow-[0_0_0_3px_rgba(100,116,139,0.15)]'
  return <span className={`inline-block w-2 h-2 rounded-full ${cls}`} title={title} />
}

export function ParticipantTable({ participants, onParticipantSelect, selectedParticipantId }: ParticipantTableProps) {
  const sortedParticipants = [...participants].sort((a, b) => b.weight - a.weight)

  const shouldHighlightRed = (participant: Participant) => {
    const lowConfirmation = participant.confirmation_poc_ratio !== null
                            && participant.confirmation_poc_ratio !== undefined
                            && participant.confirmation_poc_ratio < 0.5

    const totalInferenced = parseInt(participant.current_epoch_stats.inference_count)
                           + parseInt(participant.current_epoch_stats.missed_requests)
    const missedCount = parseInt(participant.current_epoch_stats.missed_requests)
    const invalidCount = parseInt(participant.current_epoch_stats.invalidated_inferences)
    const validatedCount = parseInt(participant.current_epoch_stats.validated_inferences)
    const totalValidations = validatedCount + invalidCount

    const missedTestFails = !missedStatTest(missedCount, totalInferenced)
    const invalidTestFails = !missedStatTest(invalidCount, totalValidations)

    return missedTestFails || invalidTestFails || lowConfirmation
  }

  const hasCollateral = participants.length > 0 && participants[0].collateral_status != null

  const handleRowClick = (participant: Participant) => {
    onParticipantSelect(participant.index)
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
      <table className="min-w-full">
        <thead className="bg-white/[0.02] backdrop-blur sticky top-0 z-10">
          <tr className="border-b border-white/[0.06]">
            <th className="px-4 py-3 text-left text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em]">Participant</th>
            <th className="px-4 py-3 text-right text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em]">Weight</th>
            <th className="px-4 py-3 text-left text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em]">Models</th>
            <th className="px-4 py-3 text-right text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em]">Total</th>
            <th className="px-4 py-3 text-right text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em]">Missed</th>
            <th className="px-4 py-3 text-right text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em]">Validated</th>
            <th className="px-4 py-3 text-right text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em]">Invalid</th>
            <th className="px-4 py-3 text-right text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em]">Missed %</th>
            <th className="px-4 py-3 text-right text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em]">Invalid %</th>
            {hasCollateral && (
              <th className="px-4 py-3 text-right text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em]">Collateral</th>
            )}
            <th className="px-2 py-3 text-center text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] w-16">Jail</th>
            <th className="px-2 py-3 text-center text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] w-16">Health</th>
          </tr>
        </thead>
        <tbody>
          {sortedParticipants.map((participant) => {
            const totalInferenced = parseInt(participant.current_epoch_stats.inference_count)
                                   + parseInt(participant.current_epoch_stats.missed_requests)

            const isHighlighted = shouldHighlightRed(participant)
            const isSelected = selectedParticipantId === participant.index

            return (
              <tr
                key={participant.index}
                onClick={() => handleRowClick(participant)}
                className={`group cursor-pointer border-t border-white/[0.05] transition-colors duration-150 ${
                  isHighlighted
                    ? 'bg-red-500/[0.06] hover:bg-red-500/[0.10]'
                    : isSelected
                      ? 'bg-accent-500/[0.08] hover:bg-accent-500/[0.12]'
                      : 'hover:bg-white/[0.03]'
                }`}
              >
                <td
                  className={`px-4 py-3.5 text-sm font-mono text-slate-100 whitespace-nowrap relative ${
                    isHighlighted
                      ? 'border-l-[2px] border-l-red-400'
                      : 'border-l-[2px] border-l-transparent group-hover:border-l-accent-400/40'
                  }`}
                >
                  {participant.index}
                </td>
                <td className="px-4 py-3.5 text-sm font-semibold text-slate-50 text-right whitespace-nowrap tabular-nums">
                  {participant.weight.toLocaleString()}
                </td>
                <td className="px-4 py-3.5 text-sm">
                  {participant.models.length > 0 ? (
                    <div className="flex flex-wrap gap-1 max-w-xs">
                      {participant.models.slice(0, 3).map((model, idx) => (
                        <Badge key={idx} variant="gray" className="font-medium whitespace-nowrap">{model}</Badge>
                      ))}
                      {participant.models.length > 3 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 text-[11px] text-slate-500 font-medium whitespace-nowrap">
                          +{participant.models.length - 3}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-slate-600 text-xs">—</span>
                  )}
                </td>
                <td className="px-4 py-3.5 text-sm text-slate-200 text-right font-medium whitespace-nowrap tabular-nums">
                  {totalInferenced.toLocaleString()}
                </td>
                <td className="px-4 py-3.5 text-sm text-right whitespace-nowrap tabular-nums">
                  <span className={parseInt(participant.current_epoch_stats.missed_requests) > 0 ? 'text-red-300 font-semibold' : 'text-slate-400'}>
                    {parseInt(participant.current_epoch_stats.missed_requests).toLocaleString()}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-sm text-slate-200 text-right whitespace-nowrap tabular-nums">
                  {parseInt(participant.current_epoch_stats.validated_inferences).toLocaleString()}
                </td>
                <td className="px-4 py-3.5 text-sm text-right whitespace-nowrap tabular-nums">
                  <span className={parseInt(participant.current_epoch_stats.invalidated_inferences) > 0 ? 'text-red-300 font-semibold' : 'text-slate-400'}>
                    {parseInt(participant.current_epoch_stats.invalidated_inferences).toLocaleString()}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-sm text-right whitespace-nowrap tabular-nums">
                  <span className={`font-semibold ${
                    !missedStatTest(
                      parseInt(participant.current_epoch_stats.missed_requests),
                      totalInferenced,
                    ) ? 'text-red-300' : 'text-slate-200'
                  }`}>
                    {(participant.missed_rate * 100).toFixed(2)}%
                  </span>
                </td>
                <td className="px-4 py-3.5 text-sm text-right whitespace-nowrap tabular-nums">
                  <span className={`font-semibold ${
                    !missedStatTest(
                      parseInt(participant.current_epoch_stats.invalidated_inferences),
                      parseInt(participant.current_epoch_stats.validated_inferences)
                      + parseInt(participant.current_epoch_stats.invalidated_inferences),
                    ) ? 'text-red-300' : 'text-slate-200'
                  }`}>
                    {(participant.invalidation_rate * 100).toFixed(2)}%
                  </span>
                </td>
                {hasCollateral && participant.collateral_status && (
                  <td className="px-4 py-3.5 text-sm text-right whitespace-nowrap tabular-nums">
                    <span
                      className={`font-semibold ${
                        participant.collateral_status.collateral_ratio < 0.90 ? 'text-red-300' : 'text-slate-200'
                      }`}
                    >
                      {(participant.collateral_status.collateral_ratio * 100).toFixed(2)}%
                    </span>
                  </td>
                )}
                <td className="px-2 py-3.5 text-center whitespace-nowrap">
                  <div className="flex justify-center">
                    {participant.participant_status === 'INACTIVE' ? (
                      <StatusDot state="unknown" title="Not a validator" />
                    ) : participant.is_jailed === true ? (
                      <StatusDot state="bad" title="Jailed" />
                    ) : participant.is_jailed === false ? (
                      <StatusDot state="ok" title="Active" />
                    ) : (
                      <StatusDot state="unknown" title="Unknown" />
                    )}
                  </div>
                </td>
                <td className="px-2 py-3.5 text-center whitespace-nowrap">
                  <div className="flex justify-center">
                    {participant.node_healthy === true ? (
                      <StatusDot state="ok" title="Healthy" />
                    ) : participant.node_healthy === false ? (
                      <StatusDot state="bad" title="Unhealthy" />
                    ) : (
                      <StatusDot state="unknown" title="Unknown" />
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
