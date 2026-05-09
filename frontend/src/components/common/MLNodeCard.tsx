import type { MLNodeInfo } from '../../types/inference'
import { Badge } from './Badge'

interface MLNodeCardProps {
  node: MLNodeInfo
}

export function MLNodeCard({ node }: MLNodeCardProps) {
  const displayWeight = node.scaled_weight ?? node.poc_weight
  const showRawWeight = node.raw_poc_weight !== undefined &&
    node.raw_poc_weight !== null &&
    node.raw_poc_weight !== displayWeight

  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 font-semibold text-slate-50 break-all">{node.local_id}</div>
        <Badge variant={node.status === 'FAILED' ? 'red' : 'blue'} className="shrink-0">{node.status}</Badge>
      </div>

      <div className="space-y-2">
        {displayWeight !== undefined && displayWeight !== null && (
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Weight</div>
            <div className="mt-1 text-sm text-slate-50">{displayWeight.toLocaleString()}</div>
            {showRawWeight && (
              <div className="mt-0.5 text-xs text-slate-500">Raw: {node.raw_poc_weight!.toLocaleString()}</div>
            )}
          </div>
        )}

        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Models</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {node.models.length > 0 ? (
              node.models.map((model, modelIdx) => (
                <span key={modelIdx} className="inline-block px-2 py-0.5 text-xs font-medium bg-white/[0.06] text-slate-200 rounded-md break-all">
                  {model}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-500">No models</span>
            )}
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Hardware</div>
          <div className="mt-1 space-y-1">
            {node.hardware.length > 0 ? (
              node.hardware.map((hw, hwIdx) => (
                <div key={hwIdx} className="text-xs text-slate-200 break-words">{hw.count}x {hw.type}</div>
              ))
            ) : (
              <span className="text-xs text-slate-500 italic">Hardware not reported</span>
            )}
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Network</div>
          <div className="mt-1 text-xs font-mono text-slate-200 break-all">{node.host}:{node.port}</div>
        </div>
      </div>
    </div>
  )
}
