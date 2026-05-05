import { useQuery } from '@tanstack/react-query'
import { HardwareDetailsResponse, HardwareStats } from '../types/inference'
import { apiFetch } from '../utils'
import { BaseModal } from './common/BaseModal'
import { MLNodeCard } from './common/MLNodeCard'
import LoadingScreen from './common/LoadingScreen'
import ErrorScreen from './common/ErrorScreen'

interface HardwareModalProps {
  hardware: HardwareStats | null
  epochId: number
  currentEpochId: number | null
  onClose: () => void
}

export function HardwareModal({ hardware, epochId, currentEpochId, onClose }: HardwareModalProps) {
  const hardwareId = hardware?.id ?? ''

  const { data, isLoading, error } = useQuery<HardwareDetailsResponse>({
    queryKey: ['hardware-details', hardwareId, epochId],
    queryFn: () => apiFetch(`/v1/hardware/${encodeURIComponent(hardwareId)}?epoch_id=${epochId}`),
    enabled: !!hardware && !!currentEpochId && epochId >= currentEpochId - 1,
    staleTime: 60000,
  })

  if (!hardware) return null

  return (
    <BaseModal title="Hardware Details" onClose={onClose}>
      {isLoading ? (
        <LoadingScreen label="Loading hardware details..." className="py-10" />
      ) : error || !data ? (
        <ErrorScreen error={error} title="Failed to load hardware details" className="py-10" />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-12 mb-6 sm:mb-8">
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Hardware</div>
              <div className="text-sm font-mono text-slate-50 break-all leading-relaxed">{data.hardware}</div>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Amount</div>
              <div className="text-base sm:text-lg font-semibold text-slate-50 break-words">{data.amount.toLocaleString()}</div>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Total Weight</div>
              <div className="text-base sm:text-lg font-semibold text-slate-50 break-words">{data.total_weight.toLocaleString()}</div>
            </div>
          </div>

          <div className="border-t border-white/[0.06] pt-5 sm:pt-6">
            <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider mb-3 sm:mb-4">MLNodes</h3>
            {data.ml_nodes.length === 0 ? (
              <div className="text-sm text-slate-500">No MLNodes reported for this hardware</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
                {data.ml_nodes.map((node, idx) => (<MLNodeCard key={idx} node={node} />))}
              </div>
            )}
          </div>
        </>
      )}
    </BaseModal>
  )
}
