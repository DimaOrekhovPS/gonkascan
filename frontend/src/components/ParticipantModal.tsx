import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { ParticipantDetailsResponse, ParticipantInferencesResponse, InferenceDetail, AssetsResponse } from '../types/inference'
import { InferenceDetailModal } from './InferenceDetailModal'
import { AddressTransactionsTable } from './AddressTransactionsTable'
import { TransfersTable } from './TransfersTable'
import { formatGNK, apiFetch, toGonka, formatDateTime } from '../utils'
import { StatCard } from './common/StatCard'
import { Badge } from './common/Badge'
import { MLNodeCard } from './common/MLNodeCard'
import { TabBar } from './common/TabBar'
import { InferenceTable } from './common/InferenceTable'
import { BackNavigation } from './common/BackNavigation'
import LoadingScreen from './common/LoadingScreen'
import ErrorScreen from './common/ErrorScreen'

interface ParticipantModalProps {
  participantId: string
  epochId: number
  currentEpochId: number | null
}

type TabType = 'details' | 'inferences' | 'transactions' | 'transfers'

function getInitialTab(): TabType {
  const tab = new URLSearchParams(window.location.search).get('tab')
  if (tab === 'transfers' || tab === 'transactions' || tab === 'inferences' || tab === 'details') return tab
  return 'details'
}

export function ParticipantModal({ participantId, epochId, currentEpochId }: ParticipantModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>(getInitialTab)
  const [selectedInference, setSelectedInference] = useState<InferenceDetail | null>(null)

  const { data: assets } = useQuery<AssetsResponse>({
    queryKey: ['participant-assets', participantId],
    queryFn: () => apiFetch(`/v1/address/assets/${participantId}`),
    enabled: !!participantId,
  })

  const { data: details, isLoading: detailsLoading } = useQuery<ParticipantDetailsResponse>({
    queryKey: ['participant', participantId, epochId],
    queryFn: () => apiFetch(`/v1/participants/${participantId}?epoch_id=${epochId}`),
    enabled: !!participantId && !!epochId,
    staleTime: 60000,
  })

  const {
    data: inferences,
    isLoading: inferencesLoading,
    error: inferencesQueryError,
  } = useQuery<ParticipantInferencesResponse>({
    queryKey: ['participant-inferences', participantId, epochId],
    queryFn: () => apiFetch(`/v1/participants/${participantId}/inferences?epoch_id=${epochId}`),
    enabled: !!participantId && !!currentEpochId && epochId >= currentEpochId - 1,
    staleTime: 60000,
    refetchInterval: false,
  })

  const inferencesError = inferencesQueryError

  const participant = details?.participant

  useEffect(() => {
    setSelectedInference(null)
    setActiveTab(getInitialTab())
    window.scrollTo(0, 0)
  }, [participantId])

  if (!participant) {
    return <LoadingScreen label="Loading participant..." />
  }

  const collateralStatus = participant?.collateral_status ?? null

  const handleBack = () => {
    const params = new URLSearchParams(window.location.search)
    params.delete('page')
    params.delete('participant')

    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname

    window.history.pushState({}, '', newUrl)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  const totalInferenced = parseInt(participant.current_epoch_stats.inference_count) + 
                         parseInt(participant.current_epoch_stats.missed_requests)

  const balance_gonka = assets?.balances?.find(b => b.denom === 'ngonka')
    ? toGonka(assets.balances.find(b => b.denom === 'ngonka')!.amount) : 0

  const vesting_gonka = assets?.total_vesting?.find(v => v.denom === 'ngonka')
    ? toGonka(assets.total_vesting.find(v => v.denom === 'ngonka')!.amount) : 0

  const total_rewards = assets?.total_rewarded?.amount ? toGonka(assets.total_rewarded.amount) : 0

  const vestingEpochData = assets?.epoch_amounts?.map((epoch, idx) => {
    const coin = epoch.coins.find(c => c.denom === 'ngonka')
    return {
      epoch: idx + 1,
      amount: coin ? toGonka(coin.amount) : 0,
    }
  }) ?? []

  return (
    <div className="w-full max-w-[1440px] mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-5 md:py-6">
      <div className="surface">

        <div className="border-b border-white/[0.06] px-3 sm:px-4 md:px-6 py-3 sm:py-4">
          <BackNavigation onBack={handleBack} backLabel="Dashboard" title={participant.index} badge={{ label: 'Participant', color: 'orange' }} />
        </div>

        <div className="px-3 sm:px-4 md:px-6 py-4 sm:py-5 md:py-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
            <StatCard label="Total" size="lg">{formatGNK(balance_gonka + vesting_gonka)}</StatCard>
            <StatCard label="Balance" size="lg">{formatGNK(balance_gonka)}</StatCard>
            <StatCard label="Mined" size="lg">{formatGNK(total_rewards)}</StatCard>
            <StatCard label="Vesting" size="lg">{formatGNK(vesting_gonka)}</StatCard>
          </div>
        </div>

        <div className="px-3 sm:px-4 md:px-6 py-2">
          <TabBar
            tabs={['details', 'inferences', 'transfers', 'transactions'] as TabType[]}
            activeTab={activeTab}
            onChange={setActiveTab}
          />
        </div>

        {activeTab === 'details' && (
          <div className="px-3 sm:px-4 md:px-6 py-4 space-y-6">
            {vestingEpochData.length > 0 && (
              <div>
                <div className="text-sm font-semibold text-slate-200">Next 180 Epochs Vesting Release</div>
                <div className="w-full h-[220px] sm:h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={vestingEpochData} barCategoryGap={1} margin={{top: 10, right: 10, bottom: 0, left: 0}}>
                      <XAxis dataKey="epoch" tick={{ fontSize: 10 }} ticks={[10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180]} tickFormatter={(v) => v.toString()}/>
                      <YAxis tick={{ fontSize: 10 }} width={36}/>
                      <Tooltip formatter={(value: number) => formatGNK(value)} labelFormatter={(label: number) => `Epoch +${label}`}/>
                      <Bar dataKey="amount" fill="#16a34a"/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Participant Address</label>
                <div className="mt-1 text-sm font-mono text-slate-50 break-all">{participant.index}</div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Consensus Key</label>
                {participant.consensus_key_mismatch ? (
                  <div className="mt-1 space-y-1">
                    <div className="text-sm font-mono text-red-300 break-all">
                      <span className="font-semibold">Participant Key:</span> {participant.validator_key || '-'}
                    </div>
                    <div className="text-sm font-mono text-red-300 break-all">
                      <span className="font-semibold">Validator Key:</span> {participant.validator_consensus_key || '-'}
                    </div>
                    <div className="text-xs text-red-300 font-semibold">Key mismatch detected - potential configuration error</div>
                  </div>
                ) : (
                  <div className="mt-1 text-sm font-mono text-slate-50 break-all">
                    {participant.validator_key || <span className="text-slate-500">Not available</span>}
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">URL</label>
                <div className="mt-1 text-sm text-slate-50 break-all">
                  {participant.inference_url ? (
                    <a href={participant.inference_url} target="_blank" rel="noopener noreferrer" className="text-accent-300 hover:underline">
                      {participant.inference_url}
                    </a>
                  ) : (
                    <span className="text-slate-500">Not available</span>
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Name</label>
                <div className="mt-1">
                  {participant.keybase_picture_url ? (
                    <div className="flex items-center gap-2">
                      <img 
                        src={participant.keybase_picture_url} 
                        alt={participant.keybase_username || 'Keybase avatar'} 
                        className="w-8 h-8 rounded-full"
                      />
                      <span className="text-sm text-slate-50">{participant.keybase_username || participant.moniker || '-'}</span>
                    </div>
                  ) : (
                    <div className="text-sm text-slate-50">{participant.moniker || '-'}</div>
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Website</label>
                <div className="mt-1 text-sm text-slate-50 break-all">
                  {participant.website ? (
                    <a href={participant.website} target="_blank" rel="noopener noreferrer" className="text-accent-300 hover:underline">
                      {participant.website}
                    </a>
                  ) : (
                    <span className="text-slate-500">-</span>
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Warm Keys</label>
                {detailsLoading ? (
                  <div className="mt-1 text-sm text-slate-500">Loading...</div>
                ) : details && details.warm_keys && details.warm_keys.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    {details.warm_keys.map((warmKey, idx) => (
                      <div key={idx} className="text-sm">
                        <div className="font-mono text-slate-50 break-all">{warmKey.grantee_address}</div>
                        <div className="text-xs text-slate-400">Granted: {formatDateTime(warmKey.granted_at)}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-1 text-sm text-slate-500">No warm keys configured</div>
                )}
              </div>
            
              <div className="border-t border-white/[0.06] pt-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3 sm:gap-4">
                  <StatCard label="Weight">{participant.weight.toLocaleString()}</StatCard>

                  <StatCard label="Weight to Confirm">
                    {participant.weight_to_confirm !== null && participant.weight_to_confirm !== undefined
                      ? participant.weight_to_confirm.toLocaleString()
                      : '-'}
                  </StatCard>

                  <StatCard
                    label="Confirmation Ratio"
                    valueClassName={
                      participant.confirmation_poc_ratio !== null &&
                    participant.confirmation_poc_ratio !== undefined &&
                    participant.confirmation_poc_ratio < 0.5
                        ? 'text-red-300'
                        : undefined
                    }
                  >
                    {participant.confirmation_poc_ratio !== null && participant.confirmation_poc_ratio !== undefined
                      ? `${(participant.confirmation_poc_ratio * 100).toFixed(2)}%`
                      : '-'}
                  </StatCard>

                  <StatCard label="Node Health">
                    <div className="flex items-center gap-2 flex-wrap">
                      {participant.node_healthy === true ? (
                        <>
                          <div className="w-3 h-3 bg-accent-500 rounded-full"></div>
                          <span className="text-base font-medium text-slate-50">Healthy</span>
                        </>
                      ) : participant.node_healthy === false ? (
                        <>
                          <div className="w-3 h-3 bg-red-400 rounded-full"></div>
                          <span className="text-base font-medium text-slate-50">Unhealthy</span>
                        </>
                      ) : (
                        <>
                          <div className="w-3 h-3 bg-white/[0.08] rounded-full"></div>
                          <span className="text-base font-medium text-slate-500">Unknown</span>
                        </>
                      )}
                    </div>
                  </StatCard>

                  <StatCard label="Validator Jail">
                    {participant.participant_status === 'INACTIVE' ? (
                      <Badge variant="gray">NOT VALIDATOR</Badge>
                    ) : participant.is_jailed === true ? (
                      <Badge variant="red">JAILED</Badge>
                    ) : participant.is_jailed === false ? (
                      <Badge variant="green">NOT JAILED</Badge>
                    ) : (
                      <span className="text-slate-500 text-sm">Unknown</span>
                    )}
                  </StatCard>

                  <StatCard label="Host Status">
                    {participant.status === 'INACTIVE' ? (
                      <Badge variant="orange">INACTIVE</Badge>
                    ) : participant.status === 'ACTIVE' ? (
                      <Badge variant="green">ACTIVE</Badge>
                    ) : (
                      <span className="text-slate-500 text-sm">Unknown</span>
                    )}
                  </StatCard>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Models</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {participant.models.length > 0 ? (
                    participant.models.map((model, idx) => (
                      <Badge key={idx} variant="gray" className="py-1 font-medium">{model}</Badge>
                    ))
                  ) : (
                    <span className="text-slate-500 text-sm">No models</span>
                  )}
                </div>
              </div>
            </div>

            {collateralStatus && (
              <div className="border-t border-white/[0.06] pt-6">
                <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider mb-4">Collateral Status</h3>
              
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
                  <StatCard label="Potential Weight">{collateralStatus.potential_weight.toLocaleString()}</StatCard>
                  <StatCard label="Effective Weight">{collateralStatus.effective_weight.toLocaleString()}</StatCard>
                  <StatCard label="Collateral Rate" valueClassName={collateralStatus.collateral_ratio < 0.90 ? 'text-red-300' : 'text-accent-400'}>
                    {(collateralStatus.collateral_ratio * 100).toFixed(2)}%
                  </StatCard>
                  <StatCard label="Needed Collateral">{collateralStatus.needed_ngonka.toLocaleString()} ngonka</StatCard>
                </div>
              </div>
            )}

            <div className="border-t border-white/[0.06] pt-6">
              <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider mb-4">Inference Statistics</h3>
            
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3 sm:gap-4">
                <StatCard label="Total Inferenced">{totalInferenced.toLocaleString()}</StatCard>
                <StatCard label="Missed Requests" valueClassName={parseInt(participant.current_epoch_stats.missed_requests) > 0 ? 'text-red-300' : undefined}>
                  {parseInt(participant.current_epoch_stats.missed_requests).toLocaleString()}
                </StatCard>
                <StatCard label="Validated Inferences">
                  {parseInt(participant.current_epoch_stats.validated_inferences).toLocaleString()}
                </StatCard>
                <StatCard label="Invalidated Inferences" valueClassName={parseInt(participant.current_epoch_stats.invalidated_inferences) > 0 ? 'text-red-300' : undefined}>
                  {parseInt(participant.current_epoch_stats.invalidated_inferences).toLocaleString()}
                </StatCard>
                <StatCard label="Missed Rate" valueClassName={participant.missed_rate > 0.10 ? 'text-red-300' : undefined}>
                  {(participant.missed_rate * 100).toFixed(2)}%
                </StatCard>
                <StatCard label="Invalidation Rate" valueClassName={participant.invalidation_rate > 0.10 ? 'text-red-300' : undefined}>
                  {(participant.invalidation_rate * 100).toFixed(2)}%
                </StatCard>
              </div>
            </div>

            <div className="border-t border-white/[0.06] pt-6">
              <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider mb-4">Rewards</h3>
            
              <div className="mb-4">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Seed</label>
                <div className="mt-1 text-xs font-mono text-slate-200 break-all bg-white/[0.02] p-2 rounded">
                  {detailsLoading ? (
                    <span className="text-slate-500">Loading...</span>
                  ) : details?.seed ? (
                    details.seed.signature
                  ) : (
                    <span className="text-slate-500">-</span>
                  )}
                </div>
              </div>
            
              {detailsLoading ? (
                <div className="text-slate-500 text-sm">Loading rewards...</div>
              ) : details && details.rewards && details.rewards.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-[640px] w-full">
                    <thead className="bg-white/[0.02]">
                      <tr className="border-b border-white/[0.06]">
                        <th className="px-4 py-3 text-left text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] whitespace-nowrap">Epoch</th>
                        <th className="px-4 py-3 text-right text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] whitespace-nowrap">Assigned Reward</th>
                        <th className="px-4 py-3 text-right text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] whitespace-nowrap">Claimed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {details.rewards.map((reward) => (
                        <tr key={reward.epoch_id} className="border-t border-white/[0.05] hover:bg-white/[0.03] transition-colors">
                          <td className="px-4 py-3 text-sm font-mono text-slate-100 whitespace-nowrap tabular-nums">#{reward.epoch_id}</td>
                          <td className="px-4 py-3 text-sm text-right text-slate-100 whitespace-nowrap tabular-nums">
                            {reward.assigned_reward_gnk > 0 ? <>{reward.assigned_reward_gnk} <span className="text-slate-500">GNK</span></> : <span className="text-slate-600">—</span>}
                          </td>
                          <td className="px-4 py-3 text-sm text-right whitespace-nowrap">
                            {reward.claimed ? <Badge variant="green">Yes</Badge> : <Badge variant="red">No</Badge>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-slate-300 text-sm surface-inset p-4 border border-white/[0.06]">
                  Rewards not available for current epoch. Check back after epoch ends.
                </div>
              )}
            </div>

            <div className="border-t border-white/[0.06] pt-6">
              <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider mb-4">MLNodes</h3>
            
              {detailsLoading ? (
                <div className="text-slate-500 text-sm">Loading MLNodes...</div>
              ) : details && details.ml_nodes && details.ml_nodes.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {details.ml_nodes.map((node, idx) => (
                    <MLNodeCard key={idx} node={node} />
                  ))}
                </div>
              ) : (
                <div className="text-slate-500 text-sm">No MLNodes configured</div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'inferences' && (
          <div className="px-3 sm:px-4 md:px-6 py-4 space-y-6">
            {(!currentEpochId || epochId < currentEpochId - 1) ? (
              <div className="text-center py-12 text-slate-400">
                <p className="text-base font-medium">Data not available for older epochs</p>
                <p className="text-sm text-slate-500 mt-2">Inference details are only available for current and previous epoch</p>
              </div>
            ) : inferencesLoading ? (
              <LoadingScreen label="Loading inferences..." className="py-10" />
            ) : inferencesError ? (
              <ErrorScreen error={inferencesError} title="Failed to load inferences" className="py-10" />
            ) : !inferences ? (
              <div className="text-center py-8 text-slate-500">No data available</div>
            ) : !inferences.cached_at ? (
              <div className="text-center py-12 text-slate-400">
                <p className="text-base font-medium">Inference data not yet available</p>
                <p className="text-sm text-slate-500 mt-2">Backend is collecting data. Please wait a few moments and refresh.</p>
              </div>
            ) : (
              <>
                <InferenceTable
                  title="Successful (Top 10)"
                  data={inferences.successful}
                  emptyText="No successful inferences"
                  onSelect={setSelectedInference}
                />

                <InferenceTable
                  title="Expired (Top 10)"
                  data={inferences.expired}
                  emptyText="No expired inferences"
                  onSelect={setSelectedInference}
                />

                <InferenceTable
                  title="Invalidated (Top 10)"
                  data={inferences.invalidated}
                  emptyText="No invalidated inferences"
                  onSelect={setSelectedInference}
                />

                {inferences.cached_at && (
                  <div className="text-xs text-slate-500 text-right pt-4 border-t border-white/[0.06]">
                    Cached at: {formatDateTime(inferences.cached_at)}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'transactions' && (
          <div className="px-3 sm:px-4 md:px-6 py-4 space-y-6">
            <AddressTransactionsTable address={participantId} />
          </div>
        )}

        {activeTab === 'transfers' && (
          <div className="px-3 sm:px-4 md:px-6 py-4 space-y-6">
            <TransfersTable address={participantId} />
          </div>
        )}

      </div>

      <InferenceDetailModal 
        inference={selectedInference}
        onClose={() => setSelectedInference(null)}
      />
    </div>
  )
}

