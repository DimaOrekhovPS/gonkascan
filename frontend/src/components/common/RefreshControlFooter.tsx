import { EpochSelector } from '../EpochSelector'

interface RefreshControlFooterProps {
  refreshInterval: string
  dataUpdatedAt: number
  isLoading: boolean
  onRefresh: () => void
  selectedEpochId?: number | null
  currentEpochId?: number
  onSelectEpoch?: (epochId: number | null) => void
}

export function RefreshControlFooter({
  refreshInterval,
  dataUpdatedAt,
  isLoading,
  onRefresh,
  selectedEpochId,
  currentEpochId,
  onSelectEpoch,
}: RefreshControlFooterProps) {
  const showEpochSelector = currentEpochId !== undefined && onSelectEpoch !== undefined
  const isLive = selectedEpochId === null || selectedEpochId === undefined
  const secondsAgo = dataUpdatedAt ? Math.floor((Date.now() - dataUpdatedAt) / 1000) : null

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-4 border-t border-white/[0.06]">
      <div className="flex-1 flex items-center justify-center sm:justify-start gap-2">
        {isLive && (
          <>
            <span className="live-dot" aria-hidden />
            <span className="text-[12px] text-slate-400 text-center sm:text-left">
              Auto-refresh every <span className="font-semibold text-slate-200">{refreshInterval}</span>
              {secondsAgo !== null && (
                <span className="text-slate-500"> · synced {secondsAgo}s ago</span>
              )}
            </span>
          </>
        )}
      </div>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
        {showEpochSelector && (
          <div className="w-full sm:w-auto">
            <EpochSelector
              currentEpochId={currentEpochId}
              selectedEpochId={selectedEpochId ?? null}
              onSelectEpoch={onSelectEpoch}
              disabled={isLoading}
            />
          </div>
        )}
        <button onClick={onRefresh} disabled={isLoading} className="btn-primary w-full sm:w-auto">
          <svg
            className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          {isLoading ? 'Refreshing' : 'Refresh'}
        </button>
      </div>
    </div>
  )
}
