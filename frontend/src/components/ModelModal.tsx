import { useQuery } from '@tanstack/react-query'
import { ModelInfo, ModelStats, ModelEpochTokenUsageResponse } from '../types/inference'
import { apiFetch } from '../utils'
import { BaseModal } from './common/BaseModal'
import { ModelTokenUsageChart } from './ModelTokenUsageChart'

interface ModelModalProps {
  model: ModelInfo | null
  stats: ModelStats | null
  onClose: () => void
}

export function ModelModal({ model, stats, onClose }: ModelModalProps) {
  const modelId = model?.id ?? ''

  const { data: tokenUsage } = useQuery<ModelEpochTokenUsageResponse>({
    queryKey: ['model-token-usage', modelId],
    queryFn: () => apiFetch(`/v1/models/token-usage?model=${encodeURIComponent(modelId)}`),
    enabled: !!model,
  })

  if (!model) return null

  return (
    <BaseModal title="Model Details" onClose={onClose}>
      <div>
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Model ID</h3>
        <p className="text-sm sm:text-base font-mono text-slate-50 break-all">{model.id}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        <div>
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Total Weight</h3>
          <p className="text-base text-slate-50">{model.total_weight.toLocaleString()}</p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Participant Count</h3>
          <p className="text-base text-slate-50">{model.participant_count}</p>
        </div>
      </div>

      {stats && (
        <div className="border-t border-white/[0.06] pt-5 sm:pt-6">
          <h3 className="text-base sm:text-lg font-semibold text-slate-50 mb-3 sm:mb-4">Usage Statistics</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div>
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Total Inferences</h3>
              <p className="text-base text-slate-50">{stats.inferences.toLocaleString()}</p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">AI Tokens</h3>
              <p className="text-base text-slate-50">{parseInt(stats.ai_tokens).toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}

      {tokenUsage && tokenUsage.data.length > 0 && (
        <ModelTokenUsageChart data={tokenUsage.data} />
      )}

      <div className="border-t border-white/[0.06] pt-5 sm:pt-6">
        <h3 className="text-base sm:text-lg font-semibold text-slate-50 mb-3 sm:mb-4">Technical Details</h3>

        <div className="space-y-3 sm:space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Proposed By</h3>
            <p className="text-sm sm:text-base font-mono text-slate-50 break-all">{model.proposed_by}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
            <div>
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">VRAM</h3>
              <p className="text-base text-slate-50">{model.v_ram} GB</p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Throughput</h3>
              <p className="text-base text-slate-50">{model.throughput_per_nonce}</p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Compute Units</h3>
              <p className="text-base text-slate-50">{model.units_of_compute_per_token}</p>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">HuggingFace Repository</h3>
            <a
              href={`https://huggingface.co/${model.hf_repo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm sm:text-base text-accent-300 hover:text-accent-200 hover:underline break-all"
            >
              {model.hf_repo}
            </a>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">HuggingFace Commit</h3>
            <p className="text-sm sm:text-base font-mono text-slate-50 break-all">{model.hf_commit}</p>
          </div>

          {model.model_args.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Model Arguments</h3>
              <div className="surface-inset rounded-md p-2.5 sm:p-3 font-mono text-xs sm:text-sm text-slate-50 break-all overflow-x-auto">
                {model.model_args.join(' ')}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Validation Threshold</h3>
            <p className="text-sm sm:text-base font-mono text-slate-50 break-words">
              {model.validation_threshold.value} × 10^{model.validation_threshold.exponent}
            </p>
          </div>
        </div>
      </div>
    </BaseModal>
  )
}
