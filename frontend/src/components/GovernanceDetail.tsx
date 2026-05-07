import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { ProposalDetailResponse, CosmosMessage, ChartTooltipProps } from '../types/inference'
import { apiFetch, formatCompact, formatMessageTypes, formatInt, formatDateTime } from '../utils'
import { MessageBlock } from './common/StructRenderer'
import { JsonSection } from './common/JsonViewer'
import { ProposalMetadata } from './ProposalMetadata'
import { VoteBubblePack } from './VoteBubblePack'
import LoadingScreen from './common/LoadingScreen'
import ErrorScreen from './common/ErrorScreen'
import { BackNavigation } from './common/BackNavigation'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts'

type VoteTx = {
  height: string
  txhash: string
  timestamp: string
  tx: {
    body: {
      messages: Array<{
        '@type': string
        voter?: string
        option?: string
        weight?: string
      }>
    }
  }
}

function getVoteWeight(tx: VoteTx): number {
  const msg = tx.tx.body.messages[0]
  if (msg?.weight) {
    const w = Number(msg.weight)
    return Number.isFinite(w) ? w : 0
  }
  return 0
}

type VoteType = 'YES' | 'NO' | 'VETO' | 'ABSTAIN' | 'UNKNOWN'

function parseVoteType(tx: VoteTx): VoteType {
  const msg = tx?.tx?.body?.messages?.[0]
  const typeUrl = msg?.['@type'] as string | undefined

  if (!msg || !typeUrl || !typeUrl.endsWith('MsgVote')) return 'UNKNOWN'

  switch (msg.option) {
    case 'VOTE_OPTION_YES':
      return 'YES'
    case 'VOTE_OPTION_NO':
      return 'NO'
    case 'VOTE_OPTION_NO_WITH_VETO':
      return 'VETO'
    case 'VOTE_OPTION_ABSTAIN':
      return 'ABSTAIN'
    default:
      return 'UNKNOWN'
  }
}

const CustomTooltip = ({ active, payload }: ChartTooltipProps) => {
  if (!active || !payload?.length) return null

  const ts = payload[0]?.payload?.ts as string | number | undefined
  const timeLabel = ts ? formatDateTime(ts) : ''

  return (
    <div className="surface px-4 py-3 text-sm space-y-2">
      <div className="font-medium text-slate-100 border-b pb-1">{timeLabel}</div>

      {payload.map((p) => (
        <div
          key={p.dataKey}
          style={{ color: p.stroke }}
          className="flex justify-between gap-4"
        >
          <span>{p.dataKey}</span>
          <span>{p.value.toLocaleString('en-US')}</span>
        </div>
      ))}
    </div>
  )
}

function formatVotingTimeRange(start?: string, end?: string) {
  if (!start || !end) return null
  return `${formatDateTime(start)} ~ ${formatDateTime(end)}`
}

function splitMessageTypeTags(label: string | null) {
  if (!label) return []
  return label
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function dedupeLatestVotesByVoter(votes: VoteTx[]): VoteTx[] {
  const map = new Map<string, VoteTx>()

  for (const tx of votes) {
    const msg = tx.tx.body.messages[0]
    const voter = msg?.voter
    if (!voter) continue

    const prev = map.get(voter)
    if (!prev) {
      map.set(voter, tx)
      continue
    }

    const prevTs = new Date(prev.timestamp).getTime()
    const currTs = new Date(tx.timestamp).getTime()

    if (currTs > prevTs) {
      map.set(voter, tx)
    }
  }

  return Array.from(map.values())
}

export function GovernanceDetail({ proposalId }: { proposalId: string }) {
  const [tab, setTab] = useState<'details' | 'vote' | 'json'>('details')
  const [voteFilter, setVoteFilter] = useState<
    'ALL' | 'YES' | 'NO' | 'VETO' | 'ABSTAIN'
  >('ALL')
  const [voterKeyword, setVoterKeyword] = useState('')
  const [sortKey, setSortKey] = useState<'weight' | 'height'>('weight')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const { data: proposalData, isLoading, error: proposalError } = useQuery<ProposalDetailResponse>({
    queryKey: ['proposal', proposalId],
    queryFn: () => apiFetch(`/v1/proposals/${proposalId}`),
  })

  const { data: txData } = useQuery<{ vote: { txs: VoteTx[] } }>({
    queryKey: ['proposal-transactions', proposalId],
    queryFn: () => apiFetch(`/v1/proposals/${proposalId}/transactions`),
    enabled: !!proposalId,
  })

  if (isLoading) {
    return <LoadingScreen label="Loading proposal..." />
  }

  if (proposalError || !proposalData) {
    return <ErrorScreen error={proposalError} title="Failed to load proposal" />
  }

  const proposal = proposalData.proposal
  const diff_params = proposalData.diff_params || []
  const messages: CosmosMessage[] = proposal.messages || []
  const updateMsgs = messages.filter((m) =>
    m['@type']?.endsWith('MsgUpdateParams'),
  )
  const otherMsgs = messages.filter(
    (m) => !m['@type']?.endsWith('MsgUpdateParams'),
  )

  const VOTE_COLOR_MAP: Record<VoteType, string> = {
    YES: '#22c55e', // green-500
    NO: '#ef4444', // red-500
    VETO: '#f59e0b', // amber-500
    ABSTAIN: '#3b82f6', // blue-500
    UNKNOWN: '#9ca3af', // gray-400
  }

  const messageTypesLabel = formatMessageTypes(messages)
  const messageTypeTags = splitMessageTypeTags(messageTypesLabel)

  const votingTimeText = formatVotingTimeRange(
    proposal.voting_start_time,
    proposal.voting_end_time,
  )

  return (
    <div className="w-full max-w-[1440px] mx-auto animate-fade-in">
      <div className="mb-5 sm:mb-6">
        <BackNavigation onBack={() => window.history.back()} backLabel="Back to Governance" title={<><span className="font-mono text-slate-500">#{proposal.id}</span> {proposal.title}</>} />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <section className="surface p-4 sm:p-6 flex flex-col">
          {messageTypeTags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {messageTypeTags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold
                                        bg-accent-500/[0.06] text-accent-300 border border-accent-400/30"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
          <h2 className="text-base sm:text-lg font-bold text-slate-50 break-words tracking-tight">
            <span className="font-mono text-slate-500 mr-1">#{proposal.id}</span>
            {proposal.title}
          </h2>
          {votingTimeText && (
            <div className="mt-1 mb-5 text-[12.5px] text-slate-400 leading-relaxed break-words">
              <span className="text-slate-500">Voting period</span> · {votingTimeText}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-4 mb-5">
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500 mb-1.5">Status</p>
              <p className="font-bold text-accent-300 text-base sm:text-lg break-words tracking-tight">{proposal.status.replace('PROPOSAL_STATUS_', '')}</p>
            </div>
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500 mb-1.5">Epoch</p>
              <p className="font-bold text-slate-50 text-base sm:text-lg break-words tabular-nums tracking-tight">#{proposal.epoch_id}</p>
            </div>
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500 mb-1.5">Turnout / Quorum</p>
              <p className="font-bold text-slate-50 text-base sm:text-lg break-words tabular-nums tracking-tight">
                {proposal.total_weight > 0
                  ? ((proposal.voted_weight / proposal.total_weight) * 100).toFixed(2)
                  : '—'}
                <span className="text-slate-500 mx-1">/</span>
                {(Number(proposal.tally_params?.quorum || 0) * 100).toFixed(2)}%
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4 pt-4 border-t border-white/[0.06]">
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500 mb-1.5">Weight</p>
              <p className="font-bold text-slate-100 break-words tabular-nums">
                {proposal.total_weight > 0
                  ? <>{formatCompact(proposal.voted_weight)}<span className="text-slate-500 mx-1">/</span>{formatCompact(proposal.total_weight)}</>
                  : <>{formatCompact(proposal.voted_weight)}<span className="text-slate-500 mx-1">/</span>—</>
                }
              </p>
            </div>
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500 mb-1.5">Voters</p>
              <p className="font-bold text-slate-100 break-words tabular-nums">{proposal.total_voters}<span className="text-slate-500 mx-1">/</span>{proposal.total_participants}</p>
            </div>
          </div>
        </section>

        <section className="surface p-4 sm:p-6">
          <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500 mb-4">Tally</h3>

          {(() => {
            const tally = proposal.final_tally_result || {}
            const yes = Number(tally.yes_count || 0)
            const no = Number(tally.no_count || 0)
            const veto = Number(tally.no_with_veto_count || 0)
            const abstain = Number(tally.abstain_count || 0)
            const total = yes + no + veto + abstain
            const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0)

            const rows = [
              { label: 'Yes', value: yes, fill: 'bg-accent-400', text: 'text-accent-300' },
              { label: 'No', value: no, fill: 'bg-red-400', text: 'text-red-300' },
              { label: 'No With Veto', value: veto, fill: 'bg-violet-400', text: 'text-violet-300' },
              { label: 'Abstain', value: abstain, fill: 'bg-amber-400', text: 'text-amber-300' },
            ]

            return (
              <div className="space-y-4 text-sm">
                {rows.map((row) => (
                  <div key={row.label}>
                    <div className="flex justify-between items-baseline mb-1.5">
                      <span className="inline-flex items-center gap-2 text-slate-200 font-medium">
                        <span className={`w-2 h-2 rounded-full ${row.fill}`} />
                        {row.label}
                      </span>
                      <span className={`text-[12.5px] tabular-nums font-semibold ${row.text}`}>
                        {pct(row.value).toFixed(2)}%
                      </span>
                    </div>
                    <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden">
                      <div
                        className={`h-full ${row.fill} rounded-full transition-all duration-500 ease-out-expo`}
                        style={{ width: `${pct(row.value)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}
        </section>
      </div>

      {/* Tabs */}
      <div className="mt-5 mb-5 inline-flex items-center gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06]">
        {['details', 'vote', 'json'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t as 'details' | 'vote' | 'json')}
            className={`shrink-0 whitespace-nowrap text-[13px] font-medium px-4 h-8 rounded-lg transition-all duration-200 ease-out-expo ${
              tab === t
                ? 'bg-white/[0.08] text-slate-50 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            {t === 'json' ? 'JSON' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Details */}
      {tab === 'details' && (
        <div className="space-y-6">
          {/* Description */}
          <section className="surface p-5 sm:p-6">
            <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500 mb-3">Description</h3>

            {proposal.summary ? (
              <p className="text-slate-200 text-sm sm:text-[15px] leading-relaxed mb-4">
                {proposal.summary}
              </p>
            ) : (
              <p className="text-slate-500 text-sm italic mb-4">No description provided.</p>
            )}

            {proposal.metadata && proposal.metadata.trim() && (
              <a
                href={proposal.metadata.trim()}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                View related documentation
              </a>
            )}
          </section>

          {/* Messages / Diff */}
          {((Array.isArray(diff_params) && diff_params.length > 0) || updateMsgs.length > 0 || otherMsgs.length > 0) && (
            <section className="surface p-4 sm:p-6 space-y-6">
              {Array.isArray(diff_params) && diff_params.length > 0 ? (
                diff_params.map((msg, i) => (
                  <MessageBlock key={`diff-${i}`} msg={msg} />
                ))
              ) : (
                updateMsgs.map((msg, i) => (
                  <MessageBlock key={`update-${i}`} msg={msg} />
                ))
              )}

              {otherMsgs.map((msg, i) => (
                <MessageBlock key={i} msg={msg} />
              ))}
            </section>
          )}

          {/* Metadata (README) */}
          <ProposalMetadata
            metadata={proposal.metadata}
            summary={proposal.summary}
          />
        </div>
      )}

      {/* Vote */}
      {tab === 'vote' && txData && (
        <section className="surface p-4 sm:p-6 space-y-6">
          {(() => {
            const rawVoteTxs: VoteTx[] = txData.vote?.txs ?? []
            const voteTxs: VoteTx[] = dedupeLatestVotesByVoter(rawVoteTxs)

            const groups = {
              YES: [] as VoteTx[],
              NO: [] as VoteTx[],
              VETO: [] as VoteTx[],
              ABSTAIN: [] as VoteTx[],
            }

            for (const tx of voteTxs) {
              const type = parseVoteType(tx)
              if (type !== 'UNKNOWN') {
                groups[type].push(tx)
              }
            }

            let filteredVotes =
              voteFilter === 'YES'
                ? groups.YES
                : voteFilter === 'NO'
                  ? groups.NO
                  : voteFilter === 'VETO'
                    ? groups.VETO
                    : voteFilter === 'ABSTAIN'
                      ? groups.ABSTAIN
                      : voteTxs

            filteredVotes = [...filteredVotes].sort((a, b) => {
              if (sortKey === 'weight') {
                const wa = getVoteWeight(a)
                const wb = getVoteWeight(b)
                return sortOrder === 'desc' ? wb - wa : wa - wb
              }

              const ha = Number(a.height)
              const hb = Number(b.height)
              return sortOrder === 'desc' ? hb - ha : ha - hb
            })

            if (voterKeyword.trim()) {
              filteredVotes = filteredVotes.filter((tx) =>
                tx.tx.body.messages[0]?.voter
                  ?.toLowerCase()
                  .includes(voterKeyword.toLowerCase()),
              )
            }

            const bubbleData = voteTxs
              .map((tx) => {
                const type = parseVoteType(tx)
                const weight = getVoteWeight(tx)

                if (type === 'UNKNOWN' || weight <= 0) return null

                return {
                  id: tx.txhash,
                  value: weight,
                  color: VOTE_COLOR_MAP[type],
                }
              })
              .filter(Boolean) as {
              id: string
              value: number
              color: string
            }[]

            if (voteTxs.length === 0) {
              return (
                <div className="h-full flex items-center justify-center text-slate-500">No vote data</div>
              )
            }

            // sort by time
            const sorted = [...voteTxs].sort(
              (a, b) =>
                new Date(a.timestamp).getTime() -
                new Date(b.timestamp).getTime(),
            )

            const cumulative = {
              YES: 0,
              NO: 0,
              VETO: 0,
              ABSTAIN: 0,
            }

            const data = sorted.map((tx) => {
              const type = parseVoteType(tx)
              const weight = getVoteWeight(tx)

              if (type !== 'UNKNOWN') {
                cumulative[type] += weight
              }

              return {
                ts: new Date(tx.timestamp).getTime(),
                YES: cumulative.YES,
                NO: cumulative.NO,
                VETO: cumulative.VETO,
                ABSTAIN: cumulative.ABSTAIN,
              }
            })

            const allTs = data.map((d) => d.ts)

            const minTs = Math.min(...allTs)
            const maxTs = Math.max(...allTs)

            // one tick every 3 hours
            const HOUR = 60 * 60 * 1000
            const ticks: number[] = []

            let t = Math.floor(minTs / HOUR) * HOUR
            while (t <= maxTs) {
              ticks.push(t)
              t += 3 * HOUR
            }

            return (
              <>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
                  {/* Vote Distribution */}
                  <div className="surface-inset p-4 sm:p-6 h-[320px] sm:h-[420px] overflow-hidden">
                    <h4 className="text-center text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500 mb-3 shrink-0">Vote Distribution</h4>

                    <div className="flex-1 flex items-center justify-center">
                      {bubbleData.length === 0 ? (
                        <div className="text-slate-500">No votes</div>
                      ) : (
                        <VoteBubblePack
                          data={bubbleData}
                          width={280}
                          height={280}
                        />
                      )}
                    </div>
                  </div>

                  {/* Voting Power Timeline */}
                  <div className="surface-inset p-4 sm:p-6 h-[320px] sm:h-[420px] flex flex-col">
                    <h4 className="text-center text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500 mb-4 shrink-0">Voting Power Timeline</h4>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data}>
                        <XAxis
                          dataKey="ts"
                          type="number"
                          domain={['dataMin', 'dataMax']}
                          ticks={ticks}
                          tickFormatter={(v) => {
                            const d = new Date(v)
                            return `${d.getHours()}:00`
                          }}
                          stroke="rgba(255,255,255,0.20)"
                          tick={{ fontSize: 11, fill: 'rgb(125,134,150)' }}
                          tickLine={false}
                          axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                          tickMargin={10}
                        />

                        <YAxis
                          stroke="rgba(255,255,255,0.20)"
                          tick={{ fontSize: 11, fill: 'rgb(125,134,150)' }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v) => Number(v).toLocaleString()}
                          width={80}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(62,229,177,0.3)', strokeDasharray: '2 2' }} />
                        <Legend wrapperStyle={{ fontSize: '11px', color: 'rgb(165,173,187)' }} />

                        <Line type="stepAfter" dataKey="YES" stroke="#3ee5b1" strokeWidth={2} dot={false} />
                        <Line type="stepAfter" dataKey="NO" stroke="#f87171" strokeWidth={2} dot={false} />
                        <Line type="stepAfter" dataKey="VETO" stroke="#c084fc" strokeWidth={2} dot={false} />
                        <Line type="stepAfter" dataKey="ABSTAIN" stroke="#fbbf24" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="surface px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex flex-wrap gap-2 sm:gap-3">
                    {(['ALL', 'YES', 'NO', 'VETO', 'ABSTAIN'] as const).map(
                      (f) => (
                        <button
                          key={f}
                          onClick={() => setVoteFilter(f)}
                          className={`shrink-0 whitespace-nowrap px-3.5 h-8 text-[13px] rounded-lg font-medium transition-all duration-200 ease-out-expo ${
                            voteFilter === f
                              ? 'bg-white/[0.08] text-slate-50 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] border border-white/[0.10]'
                              : 'text-slate-400 hover:text-slate-100 border border-transparent'
                          }`}
                        >
                          {f}
                        </button>
                      ),
                    )}
                  </div>

                  <input
                    value={voterKeyword}
                    onChange={(e) => setVoterKeyword(e.target.value)}
                    placeholder="Search voter…"
                    className="input w-full sm:w-64"
                  />
                </div>

                {/* vote table */}
                <div className="rounded-xl overflow-hidden overflow-x-auto border border-white/[0.06]">
                  <div className="grid min-w-[720px] grid-cols-[3fr_1fr_1fr_1fr] bg-white/[0.02] px-4 py-3 text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em]">
                    <div>Voter</div>
                    <div>Option</div>
                    <button
                      onClick={() => {
                        setSortKey('height')
                        setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'))
                      }}
                      className="text-left hover:text-slate-200 transition-colors inline-flex items-center gap-1"
                    >
                      Height
                      {sortKey === 'height' && (
                        <span className="text-accent-400">{sortOrder === 'desc' ? '↓' : '↑'}</span>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setSortKey('weight')
                        setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'))
                      }}
                      className="text-left hover:text-slate-200 transition-colors inline-flex items-center gap-1"
                    >
                      Power
                      {sortKey === 'weight' && (
                        <span className="text-accent-400">{sortOrder === 'desc' ? '↓' : '↑'}</span>
                      )}
                    </button>
                  </div>

                  {filteredVotes.map((tx) => {
                    const msg = tx.tx.body.messages[0]
                    const option = parseVoteType(tx)

                    return (
                      <div
                        key={tx.txhash}
                        className="grid min-w-[720px] grid-cols-[3fr_1fr_1fr_1fr] px-4 py-3.5 border-t border-white/[0.05] text-sm hover:bg-white/[0.03] transition-colors"
                      >
                        <div className="font-mono text-slate-100 truncate pr-4">{msg?.voter || '—'}</div>
                        <div className="font-semibold tabular-nums" style={{ color: VOTE_COLOR_MAP[option] }}>{option}</div>
                        <div className="text-slate-300 tabular-nums">{formatInt(tx.height)}</div>
                        <div className="font-mono text-slate-200 truncate pr-2 tabular-nums">{formatInt(getVoteWeight(tx))}</div>
                      </div>
                    )
                  })}
                  {filteredVotes.length === 0 && (
                    <div className="py-8 px-4 text-center text-sm text-slate-500">No votes found in this category</div>
                  )}
                </div>
              </>
            )
          })()}
        </section>
      )}

      {/* JSON */}
      {tab === 'json' && (
        <JsonSection data={proposal} />
      )}
    </div>
  )
}
