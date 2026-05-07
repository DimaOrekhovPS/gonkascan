import { useQuery } from '@tanstack/react-query'
import { timeAgo, apiFetch, toGonka, formatDateTime } from '../utils'
import { TransactionDetailResponse } from '../types/inference'
import LoadingScreen from './common/LoadingScreen'
import ErrorScreen from './common/ErrorScreen'
import { BackNavigation } from './common/BackNavigation'
import { JsonSection } from './common/JsonViewer'
import { MessageBlock } from './common/StructRenderer'

interface DetailRowProps {
  label: string
  children: React.ReactNode
  span?: string
}

function DetailRow({ label, children, span }: DetailRowProps) {
  return (
    <div className={span}>
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500 mb-1.5">{label}</p>
      <div className="text-[14px] text-slate-100 break-all leading-relaxed font-medium">{children}</div>
    </div>
  )
}

export function TransactionDetail({ txHash }: { txHash: string }) {
  const { data, isLoading, error } = useQuery<TransactionDetailResponse>({
    queryKey: ['transaction', txHash],
    queryFn: () => apiFetch(`/v1/transaction/${txHash}`),
    enabled: !!txHash,
  })

  if (isLoading) return <LoadingScreen label="Loading transaction detail" />
  if (error || !data) return <ErrorScreen error={error} title="Failed to load transaction detail" />

  const fee =
    data.tx.auth_info.fee.amount.length > 0
      ? data.tx.auth_info.fee.amount
          .map((a) => `${toGonka(a.amount)} ${a.denom.replace(/^n/, '')}`)
          .join(', ')
      : '—'

  const isSuccess = data.code === 0

  return (
    <div className="w-full max-w-[1440px] mx-auto animate-fade-in">
      <div className="mb-5 sm:mb-6">
        <BackNavigation
          onBack={() => window.history.back()}
          backLabel="Back to Transactions"
          title={<span className="font-mono">{data.txhash.toUpperCase()}</span>}
        />
      </div>

      <div className="space-y-5 sm:space-y-6">
        <section className="surface p-4 sm:p-5 md:p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 pb-5 mb-5 border-b border-white/[0.06]">
            <div className="min-w-0">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500 mb-2">Transaction Hash</p>
              <p className="font-mono text-sm sm:text-[15px] break-all leading-relaxed text-slate-50">{data.txhash.toUpperCase()}</p>
            </div>
            <span
              className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-md tracking-wide ${
                isSuccess
                  ? 'bg-accent-500/12 text-accent-300 border border-accent-400/30'
                  : 'bg-red-500/10 text-red-300 border border-red-400/25'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isSuccess ? 'bg-accent-400' : 'bg-red-400'}`} />
              {isSuccess ? 'Success' : 'Failed'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5">
            <DetailRow label="Height">
              <a
                href={`?page=blocks&height=${data.height}`}
                className="font-mono text-accent-300 hover:text-accent-200 hover:underline tabular-nums"
              >
                #{Number(data.height).toLocaleString()}
              </a>
            </DetailRow>
            <DetailRow label="Time">
              <span className="tabular-nums">
                {formatDateTime(data.timestamp)}
                <span className="text-slate-500 ml-2">({timeAgo(data.timestamp)})</span>
              </span>
            </DetailRow>
            <DetailRow label="Memo">
              <span className="text-slate-300">{data.tx.body.memo || '—'}</span>
            </DetailRow>
            <DetailRow label="Gas (GNK)">
              <span className="font-mono tabular-nums">
                {toGonka(data.gas_used)} <span className="text-slate-500">/</span> {toGonka(data.gas_wanted)}
              </span>
            </DetailRow>
            <DetailRow label="Fee">
              <span className="font-mono tabular-nums">{fee}</span>
            </DetailRow>
          </div>
        </section>

        <section className="surface p-4 sm:p-5 md:p-6">
          <div className="flex items-center gap-2.5 mb-4">
            <h4 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500">Messages</h4>
            <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded text-[11px] font-bold tabular-nums bg-white/[0.06] text-slate-200 border border-white/[0.08]">
              {data.tx.body.messages.length}
            </span>
          </div>
          {data.tx.body.messages.map((msg, idx) => (
            <MessageBlock key={idx} msg={msg} />
          ))}
        </section>

        <JsonSection data={data} />
      </div>
    </div>
  )
}
