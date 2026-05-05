interface EpochIdDisplayProps {
  epochId: number
  isCurrent: boolean
}

export function EpochIdDisplay({ epochId, isCurrent }: EpochIdDisplayProps) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500 leading-tight">
          Epoch
        </span>
        {isCurrent && (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-accent-500/12 border border-accent-400/30">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-400 shadow-[0_0_8px_rgba(62,229,177,0.7)] animate-live-pulse" />
            <span className="text-[10px] font-bold text-accent-300 tracking-wider">LIVE</span>
          </span>
        )}
      </div>
      <div className="text-xl sm:text-2xl font-bold leading-none tabular-nums tracking-tight text-slate-50">
        <span className="text-slate-500 font-semibold mr-0.5">#</span>
        {epochId}
      </div>
      <div className="text-[11.5px] text-slate-500 mt-2 min-h-[1.25rem]">
        {isCurrent ? 'Current epoch' : 'Historical snapshot'}
      </div>
    </div>
  )
}
