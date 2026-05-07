import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { HardwaresResponse, HardwareStats, HardwareEpochSeriesResponse } from '../types/inference'
import { apiFetch, buildEpochRows } from '../utils'
import { HardwareModal } from './HardwareModal'
import { EpochAreaChart } from './common/EpochAreaChart'
import { StatItem } from './common/StatItem'
import { EpochIdDisplay } from './common/EpochIdDisplay'
import { RefreshControlFooter } from './common/RefreshControlFooter'
import { Select, type SelectOption } from './common/Select'
import LoadingScreen from './common/LoadingScreen'
import ErrorScreen from './common/ErrorScreen'

export function Hardware() {
  const [selectedEpochId, setSelectedEpochId] = useState<number | null>(null)
  const [currentEpochId, setCurrentEpochId] = useState<number | null>(null)
  const [selectedHardwareId, setSelectedHardwareId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [extraHardwareId, setExtraHardwareId] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState<string | null>(null)

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery<HardwaresResponse>({
    queryKey: ['hardware', selectedEpochId === null ? 'current' : selectedEpochId],
    queryFn: () => apiFetch(selectedEpochId ? `/v1/hardware/epochs/${selectedEpochId}` : '/v1/hardware/current'),
    staleTime: 90000,
    refetchInterval: 90000,
    refetchOnMount: true,
    placeholderData: (previousData) => previousData,
  })

  const { data: metricsData, isLoading: metricsLoading } = useQuery<HardwareEpochSeriesResponse>({
    queryKey: ['hardware-metrics'],
    queryFn: () => apiFetch('/v1/metrics/hardware'),
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
    const hardwareParam = params.get('hardware')
    
    if (epochParam) {
      const epochId = parseInt(epochParam)
      if (!isNaN(epochId)) {
        setSelectedEpochId(epochId)
        if (hardwareParam) {
          setSelectedHardwareId(hardwareParam)
        }
        return
      }
    }
    
    if (hardwareParam) {
      setSelectedHardwareId(hardwareParam)
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    params.set('page', 'hardware')
    
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

  const handleHardwareSelect = (hardwareId: string | null) => {
    setSelectedHardwareId(hardwareId)
    
    const params = new URLSearchParams(window.location.search)
    if (hardwareId) {
      params.set('hardware', hardwareId)
    } else {
      params.delete('hardware')
    }
    
    const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname
    window.history.replaceState({}, '', newUrl)
  }

  const handleRowClick = (hardware: HardwareStats) => {
    handleHardwareSelect(hardware.id)
  }

  // NOTE: hooks must be called unconditionally on every render, so derived
  // memos go before any early returns.
  const allModels = useMemo(
    () => (data ? Array.from(new Set(data.hardware.flatMap((hardware) => hardware.models))).sort() : []),
    [data],
  )

  const modelOptions = useMemo<ReadonlyArray<SelectOption<string>>>(
    () => [
      { value: '', label: 'All models' },
      ...allModels.map((model) => ({ value: model, label: model })),
    ],
    [allModels],
  )

  if (isLoading && !data) {
    return <LoadingScreen label="Loading hardware..." />
  }

  if (error && !data) {
    return <ErrorScreen error={error} onRetry={handleRefresh} />
  }

  if (!data) return null

  let filteredHardwares = data.hardware

  if (selectedModel) {
    filteredHardwares = filteredHardwares.filter(hw =>
      hw.models.includes(selectedModel),
    )
  }
  const canExpand = filteredHardwares.length > 5
  const sortedByWeight = [...filteredHardwares].sort((a, b) => b.total_weight - a.total_weight)
  const sortedByAmount = [...filteredHardwares].sort((a, b) => b.amount - a.amount)

  const top5ByWeight = sortedByWeight.slice(0, 5)
  const top5ByAmount = sortedByAmount.slice(0, 5)

  let displayHardwares: HardwareStats[] = []
  
  if (showAll && canExpand) {
    displayHardwares = sortedByWeight
  } else {
    displayHardwares = [...top5ByWeight]
    if (
      extraHardwareId &&
        !displayHardwares.some(h => h.id === extraHardwareId)
    ) {
      const extra = data.hardware.find(h => h.id === extraHardwareId)
      if (extra) {
        displayHardwares.push(extra)
      }
    }
  }
  
  const top5WeightIds = top5ByWeight.map(h => h.id)
  const top5AmountIds = top5ByAmount.map(h => h.id)
  const totalWeightData = metricsData? buildEpochRows(
    Object.fromEntries(Object.entries(metricsData.series.total_weight).filter(([k]) => top5WeightIds.includes(k)))): []
  const amountData = metricsData? buildEpochRows(
    Object.fromEntries(Object.entries(metricsData.series.amount).filter(([k]) => top5AmountIds.includes(k)))): []

  const selectedHardware = selectedHardwareId 
    ? data.hardware.find(h => h.id === selectedHardwareId) || null
    : null
  
  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-in">
      <section className="surface border-gradient-top p-4 sm:p-5 md:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-5 mb-4">
          <div className="col-span-2 sm:col-span-1">
            <EpochIdDisplay epochId={data.epoch_id} isCurrent={data.is_current} />
          </div>

          <div className="border-t sm:border-t-0 sm:border-l border-white/[0.06] pt-5 sm:pt-0 sm:pl-5 lg:pl-6">
            <StatItem label="Total Weight" subText="">{data.total_weight.toLocaleString()}</StatItem>
          </div>

          <div className="border-t sm:border-t-0 sm:border-l border-white/[0.06] pt-5 sm:pt-0 sm:pl-5 lg:pl-6">
            <StatItem label="Total Hardware" subText="">{data.hardware.reduce((sum, hardware) => sum + hardware.amount, 0).toLocaleString()}</StatItem>
          </div>

          <div className="border-t sm:border-t-0 sm:border-l border-white/[0.06] pt-5 sm:pt-0 sm:pl-5 lg:pl-6">
            <StatItem label="Hardware Types" subText="">{data.hardware.length}</StatItem>
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h2 className="section-title">Hardware</h2>
            <p className="section-subtitle mt-1">Click on a hardware to view detailed information</p>
          </div>

          <Select
            value={selectedModel ?? ''}
            onChange={(next) => setSelectedModel(next || null)}
            options={modelOptions}
            placeholder="All models"
            className="w-full sm:w-56"
          />
        </div>

        <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
          <table className="min-w-[640px] w-full">
            <thead className="bg-white/[0.02]">
              <tr className="border-b border-white/[0.06]">
                <th className="px-4 py-3 text-left text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] whitespace-nowrap">Hardware</th>
                <th className="px-4 py-3 text-right text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] whitespace-nowrap">Total Weight</th>
                <th className="px-4 py-3 text-right text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] whitespace-nowrap">Amount</th>
              </tr>
            </thead>
            <tbody>
              {displayHardwares.map((hardware) => (
                <tr
                  key={hardware.id}
                  onClick={() => handleRowClick(hardware)}
                  className="group cursor-pointer border-t border-white/[0.05] hover:bg-white/[0.03] transition-colors duration-150"
                >
                  <td className="px-4 py-3.5 text-sm font-mono text-slate-100 whitespace-nowrap border-l-[2px] border-l-transparent group-hover:border-l-accent-400/40">
                    {hardware.id}
                  </td>
                  <td className="px-4 py-3.5 text-sm font-semibold text-slate-50 text-right whitespace-nowrap tabular-nums">
                    {hardware.total_weight.toLocaleString()}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-slate-300 text-right whitespace-nowrap tabular-nums">
                    {hardware.amount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canExpand && (
          <div className="w-full flex justify-center mt-4">
            <button
              onClick={() => {
                setShowAll(!showAll)
                setExtraHardwareId(null)
              }}
              className="btn-ghost"
            >
              <svg
                className={`w-3.5 h-3.5 transition-transform duration-200 ${showAll ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
              {showAll ? 'Collapse' : `Show all ${data.hardware.length}`}
            </button>
          </div>
        )}
      </section>

      <HardwareModal 
        hardware={selectedHardware}
        epochId={selectedEpochId ?? data.epoch_id}
        currentEpochId={currentEpochId}
        onClose={() => handleHardwareSelect(null)} 
      />

      {metricsData && !metricsLoading && (
        <div className="flex flex-col gap-6 sm:gap-8 md:gap-10 mb-8 md:mb-10">
          <EpochAreaChart title="Total Weight" data={totalWeightData} />
          <EpochAreaChart title="Amount" data={amountData} />
        </div>
      )}

    </div>
  )
}
