import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ModelsResponse, ModelInfo, ModelEpochSeriesResponse } from '../types/inference'
import { apiFetch, buildEpochRows } from '../utils'
import { ModelModal } from './ModelModal'
import { EpochAreaChart } from './common/EpochAreaChart'
import { StatItem } from './common/StatItem'
import { EpochIdDisplay } from './common/EpochIdDisplay'
import { RefreshControlFooter } from './common/RefreshControlFooter'
import LoadingScreen from './common/LoadingScreen'
import ErrorScreen from './common/ErrorScreen'

export function Models() {
  const [selectedEpochId, setSelectedEpochId] = useState<number | null>(null)
  const [currentEpochId, setCurrentEpochId] = useState<number | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery<ModelsResponse>({
    queryKey: ['models', selectedEpochId === null ? 'current' : selectedEpochId],
    queryFn: () => apiFetch(selectedEpochId ? `/v1/models/epochs/${selectedEpochId}` : '/v1/models/current'),
    staleTime: 90000,
    refetchInterval: 90000,
    refetchOnMount: true,
    placeholderData: (previousData) => previousData,
  })

  const { data: metricsData, isLoading: metricsLoading } = useQuery<ModelEpochSeriesResponse>({
    queryKey: ['models-metrics'],
    queryFn: () => apiFetch('/v1/metrics/models'),
    staleTime: 300000,
    refetchInterval: 300000,
    refetchOnMount: false,
  })

  useEffect(() => {
    if (data?.is_current) {
      setCurrentEpochId(data.epoch_id)
    }
  }, [data])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const epochParam = params.get('epoch')
    const modelParam = params.get('model')
    
    if (epochParam) {
      const epochId = parseInt(epochParam)
      if (!isNaN(epochId)) {
        setSelectedEpochId(epochId)
        if (modelParam) {
          setSelectedModelId(modelParam)
        }
        return
      }
    }
    
    if (modelParam) {
      setSelectedModelId(modelParam)
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    params.set('page', 'models')
    
    if (selectedEpochId === null) {
      params.delete('epoch')
    } else {
      params.set('epoch', selectedEpochId.toString())
    }
    
    const newUrl = params.toString() 
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname
    window.history.replaceState({}, '', newUrl)
  }, [selectedEpochId])

  const handleRefresh = () => {
    refetch()
  }

  const handleEpochSelect = (epochId: number | null) => {
    setSelectedEpochId(epochId)
  }

  const handleModelSelect = (modelId: string | null) => {
    setSelectedModelId(modelId)
    
    const params = new URLSearchParams(window.location.search)
    if (modelId) {
      params.set('model', modelId)
    } else {
      params.delete('model')
    }
    
    const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname
    window.history.replaceState({}, '', newUrl)
  }

  const handleRowClick = (model: ModelInfo) => {
    handleModelSelect(model.id)
  }

  if (isLoading && !data) {
    return <LoadingScreen label="Loading models..." />
  }

  if (error && !data) {
    return <ErrorScreen error={error} onRetry={handleRefresh} />
  }

  if (!data) return null

  const sortedModels = [...data.models].sort((a, b) => b.total_weight - a.total_weight)
  const statsMap = new Map(data.stats.map(s => [s.model, s]))
  
  const totalWeightData = metricsData? buildEpochRows(metricsData.series.total_weight): []
  const hostsData = metricsData? buildEpochRows(metricsData.series.hosts): []
  const inferencesData = metricsData? buildEpochRows(metricsData.series.inferences): []
  const aiTokensData = metricsData? buildEpochRows(metricsData.series.ai_tokens): []

  const selectedModel = selectedModelId 
    ? data.models.find(m => m.id === selectedModelId) || null
    : null
  
  const selectedStats = selectedModelId ? statsMap.get(selectedModelId) || null : null

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-in">
      <section className="surface border-gradient-top p-4 sm:p-5 md:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-5 mb-4">
          <div className="col-span-2 sm:col-span-1">
            <EpochIdDisplay epochId={data.epoch_id} isCurrent={data.is_current} />
          </div>

          <div className="border-t sm:border-t-0 sm:border-l border-white/[0.06] pt-5 sm:pt-0 sm:pl-5 lg:pl-6">
            <StatItem label="Block Height" subText="">{data.height.toLocaleString()}</StatItem>
          </div>

          <div className="border-t sm:border-t-0 sm:border-l border-white/[0.06] pt-5 sm:pt-0 sm:pl-5 lg:pl-6">
            <StatItem label="Total Models" subText="">{data.models.length}</StatItem>
          </div>
        </div>

        <RefreshControlFooter
          refreshInterval="90s"
          selectedEpochId={selectedEpochId}
          dataUpdatedAt={dataUpdatedAt}
          currentEpochId={currentEpochId || data.epoch_id}
          isLoading={isLoading}
          onSelectEpoch={handleEpochSelect}
          onRefresh={handleRefresh}
        />
      </section>

      <section className="surface p-4 sm:p-5 md:p-6">
        <div className="mb-4">
          <h2 className="section-title">Available Models</h2>
          <p className="section-subtitle mt-1">Click on a model to view detailed information</p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
          <table className="min-w-[720px] w-full">
            <thead className="bg-white/[0.02]">
              <tr className="border-b border-white/[0.06]">
                <th className="px-4 py-3 text-left text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] whitespace-nowrap">Model ID</th>
                <th className="px-4 py-3 text-right text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] whitespace-nowrap">Total Weight</th>
                <th className="px-4 py-3 text-right text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] whitespace-nowrap">Hosts</th>
                <th className="px-4 py-3 text-right text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] whitespace-nowrap">Inferences</th>
                <th className="px-4 py-3 text-right text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] whitespace-nowrap">AI Tokens</th>
              </tr>
            </thead>
            <tbody>
              {sortedModels.map((model) => {
                const stats = statsMap.get(model.id)
                return (
                  <tr
                    key={model.id}
                    onClick={() => handleRowClick(model)}
                    className="group cursor-pointer border-t border-white/[0.05] hover:bg-white/[0.03] transition-colors duration-150"
                  >
                    <td className="px-4 py-3.5 text-sm font-mono text-slate-100 whitespace-nowrap border-l-[2px] border-l-transparent group-hover:border-l-accent-400/40">
                      {model.id}
                    </td>
                    <td className="px-4 py-3.5 text-sm font-semibold text-slate-50 text-right whitespace-nowrap tabular-nums">
                      {model.total_weight.toLocaleString()}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-300 text-right whitespace-nowrap tabular-nums">
                      {model.participant_count}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-300 text-right whitespace-nowrap tabular-nums">
                      {stats ? stats.inferences.toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-300 text-right whitespace-nowrap tabular-nums">
                      {stats ? parseInt(stats.ai_tokens).toLocaleString() : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <ModelModal 
        model={selectedModel}
        stats={selectedStats}
        onClose={() => handleModelSelect(null)} 
      />

      {metricsData && !metricsLoading && (
        <div className="flex flex-col gap-6 md:gap-8">
          <EpochAreaChart title="Total Weight" data={totalWeightData} />
          <EpochAreaChart title="Hosts" data={hostsData} />
          <EpochAreaChart title="Inferences" data={inferencesData} />
          <EpochAreaChart title="AI Tokens" data={aiTokensData} />
        </div>
      )}

    </div>
  )
}

