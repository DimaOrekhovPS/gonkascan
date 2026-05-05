import type { InferenceDetail } from '../../types/inference'

interface InferenceTableProps {
  title: string
  data: InferenceDetail[]
  emptyText: string
  onSelect: (inference: InferenceDetail) => void
}

export function InferenceTable({ title, data, emptyText, onSelect }: InferenceTableProps) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider mb-3">{title}</h3>
      {data.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/[0.05]">
            <thead className="bg-white/[0.02]">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Inference ID</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Block Height</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Validated By</th>
              </tr>
            </thead>
            <tbody>
              {data.map((inf) => (
                <tr
                  key={inf.inference_id}
                  className="hover:bg-white/[0.02] cursor-pointer"
                  onClick={() => onSelect(inf)}
                >
                  <td className="px-4 py-2 text-sm font-mono text-slate-200 truncate max-w-xs">{inf.inference_id}</td>
                  <td className="px-4 py-2 text-sm text-slate-50">{inf.start_block_height}</td>
                  <td className="px-4 py-2 text-sm text-slate-50">{inf.validated_by.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-sm text-slate-500 surface-inset p-4">{emptyText}</div>
      )}
    </div>
  )
}
