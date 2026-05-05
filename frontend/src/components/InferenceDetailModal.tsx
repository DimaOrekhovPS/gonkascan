import { useState } from 'react'
import { formatDateTime } from '../utils'
import { InferenceDetail } from '../types/inference'
import { Badge } from './common/Badge'
import { BaseModal } from './common/BaseModal'

interface InferenceDetailModalProps {
  inference: InferenceDetail | null
  onClose: () => void
}

export function InferenceDetailModal({ inference, onClose }: InferenceDetailModalProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null)

  if (!inference) {
    return null
  }

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(fieldName)
      setTimeout(() => setCopiedField(null), 2000)
    })
  }

  const formatTimestamp = (timestamp: string) => {
    const ts = parseInt(timestamp) / 1000
    return formatDateTime(ts * 1000)
  }

  return (
    <BaseModal title="Inference Details" onClose={onClose}>
      <div>
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Inference ID</label>
        <div className="mt-1 flex items-center justify-between bg-white/[0.02] p-2 rounded">
          <code className="text-sm font-mono text-slate-50 break-all">{inference.inference_id}</code>
          <button
            onClick={() => copyToClipboard(inference.inference_id, 'inference_id')}
            className="ml-2 px-2 py-1 text-xs bg-accent-500/[0.12] text-accent-300 rounded hover:bg-accent-500/20 flex-shrink-0"
          >
            {copiedField === 'inference_id' ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</label>
          <div className="mt-1">
            <Badge
              variant={
                inference.status === 'FINISHED' || inference.status === 'VALIDATED'
                  ? 'green'
                  : inference.status === 'EXPIRED'
                    ? 'yellow'
                    : 'red'
              }
              className="py-1"
            >
              {inference.status}
            </Badge>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Model</label>
          <div className="mt-1 text-sm text-slate-50">{inference.model || '-'}</div>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Block Height</label>
          <div className="mt-1 text-sm font-mono text-slate-50">{inference.start_block_height}</div>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Timestamp</label>
          <div className="mt-1 text-sm text-slate-50">{formatTimestamp(inference.start_block_timestamp)}</div>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Prompt Tokens</label>
          <div className="mt-1 text-sm text-slate-50">{inference.prompt_token_count || '0'}</div>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Completion Tokens</label>
          <div className="mt-1 text-sm text-slate-50">{inference.completion_token_count || '0'}</div>
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Validated By ({inference.validated_by.length})</label>
        {inference.validated_by.length > 0 ? (
          <div className="mt-2 space-y-1">
            {inference.validated_by.map((validator, idx) => (
              <div key={idx} className="text-sm font-mono text-slate-200 bg-white/[0.02] p-2 rounded break-all">{validator}</div>
            ))}
          </div>
        ) : (
          <div className="mt-1 text-sm text-slate-500">No validators</div>
        )}
      </div>

      {inference.prompt_hash && (
        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Prompt Hash</label>
          <div className="mt-1 flex items-center justify-between bg-white/[0.02] p-2 rounded">
            <code className="text-sm font-mono text-slate-50 break-all">{inference.prompt_hash}</code>
            <button
              onClick={() => copyToClipboard(inference.prompt_hash!, 'prompt_hash')}
              className="ml-2 px-2 py-1 text-xs bg-accent-500/[0.12] text-accent-300 rounded hover:bg-accent-500/20 flex-shrink-0"
            >
              {copiedField === 'prompt_hash' ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {inference.response_hash && (
        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Response Hash</label>
          <div className="mt-1 flex items-center justify-between bg-white/[0.02] p-2 rounded">
            <code className="text-sm font-mono text-slate-50 break-all">{inference.response_hash}</code>
            <button
              onClick={() => copyToClipboard(inference.response_hash!, 'response_hash')}
              className="ml-2 px-2 py-1 text-xs bg-accent-500/[0.12] text-accent-300 rounded hover:bg-accent-500/20 flex-shrink-0"
            >
              {copiedField === 'response_hash' ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}
    </BaseModal>
  )
}
