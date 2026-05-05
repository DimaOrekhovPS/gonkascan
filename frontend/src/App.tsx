import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Toaster, toast } from 'react-hot-toast'
import { InferenceResponse } from './types/inference'
import { ParticipantTable } from './components/ParticipantTable'
import { Timeline } from './components/Timeline'
import { Models } from './components/Models'
import { EpochTimer } from './components/EpochTimer'
import { Blocks } from './components/Blocks'
import LoadingScreen from './components/common/LoadingScreen'
import ErrorScreen from './components/common/ErrorScreen'
import { BlockDetail } from './components/BlockDetail'
import { Transactions } from './components/Transactions'
import { TransactionDetail } from './components/TransactionDetail'
import { ParticipantMap } from './components/ParticipantMap'
import { AddressRoute } from './components/AddressRoute'
import { Hardware } from './components/Hardware'
import { Governance } from './components/Governance'
import { GovernanceDetail } from './components/GovernanceDetail'
import { ActiveProposals } from './components/ActiveProposals'
import { MarketStats } from './components/MarketStats'
import { Resource } from './components/Resource'
import { BountyProgram } from './components/BountyProgram'
import { StatItem } from './components/common/StatItem'
import { EpochIdDisplay } from './components/common/EpochIdDisplay'
import { RefreshControlFooter } from './components/common/RefreshControlFooter'
import { NavTab, NavDropdown } from './components/common/NavTab'
import { isValidGonkaAddress, isHex64, isBlockHeight, apiFetch } from './utils'
import { usePrefetch } from './hooks/usePrefetch'
import { useEstimatedBlock } from './hooks/useEstimatedBlock'
import { useScrolled } from './hooks/useScrolled'
import { MeshBackground } from './components/common/MeshBackground'
import { Select, type SelectOption } from './components/common/Select'

type Page =
  | 'dashboard'
  | 'models'
  | 'hardware'
  | 'timeline'
  | 'transactions'
  | 'nodemap'
  | 'address'
  | 'blocks'
  | 'governance'
  | 'resource'
  | 'bounty'

const EPOCH_AWARE_PAGES: Page[] = ['dashboard', 'address']

type AddressParticipantStatus = {
  isParticipant: boolean
  epochId: number
} | null

function weightToH100(weight: number, epoch: number) {
  let BASELINE: number

  if (epoch <= 158) {
    BASELINE = 437
  } else if (epoch <= 176) {
    BASELINE = 292.88
  } else {
    BASELINE = 254.5
  }

  return weight / BASELINE
}

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard')
  const [selectedEpochId, setSelectedEpochId] = useState<number | null>(null)
  const [currentEpochId, setCurrentEpochId] = useState<number | null>(null)
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null)
  const [globalSearch, setGlobalSearch] = useState('')
  const [appReady, setAppReady] = useState(false)
  const [addressParticipantStatus, setAddressParticipantStatus] = useState<AddressParticipantStatus>(null)
  const [participantFilter, setParticipantFilter] = useState<string[] | null>(null)
  const [selectedHardware, setSelectedHardware] = useState<string>('ALL')

  const { prefetchAll } = usePrefetch()
  const { scrolled, progress: scrollProgress } = useScrolled(8, 140)

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery<InferenceResponse>({
    queryKey: ['inference', selectedEpochId === null ? 'current' : selectedEpochId],
    queryFn: () => apiFetch(selectedEpochId ? `/v1/inference/epochs/${selectedEpochId}` : '/v1/inference/current'),
    staleTime: 0,
    refetchInterval: 30000,
    refetchOnMount: true,
    enabled: appReady && currentPage === 'dashboard',
  })

  const { data: currentData } = useQuery<InferenceResponse>({
    queryKey: ['inference', 'current'],
    queryFn: () => apiFetch('/v1/inference/current'),
    staleTime: 30000,
    enabled: currentPage === 'dashboard' && selectedEpochId !== null,
  })

  const estimatedBlock = useEstimatedBlock(
    data?.current_block_height || 0,
    data?.current_block_timestamp || new Date().toISOString(),
    data?.avg_block_time || 6,
  )

  const shouldShowEstimatedBlock = data?.current_block_height && data?.current_block_timestamp && data?.avg_block_time

  useEffect(() => {
    if (data?.is_current) {
      setCurrentEpochId(data.epoch_id)
    }
  }, [data])

  useEffect(() => {
    if (currentData) {
      setCurrentEpochId(currentData.epoch_id)
    }
  }, [currentData])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const pageParam = params.get('page') as Page | null
    const epochParam = params.get('epoch')
    const addressParam = params.get('address')
    const participantsParam = params.get('participants')

    const page = pageParam ?? 'dashboard'
    setCurrentPage(page)

    if (EPOCH_AWARE_PAGES.includes(page) && epochParam) {
      const epochId = parseInt(epochParam)
      setSelectedEpochId(isNaN(epochId) ? null : epochId)
    } else {
      setSelectedEpochId(null)
    }

    if (participantsParam && page === 'dashboard') {
      const list = participantsParam
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)

      setParticipantFilter(list.length > 0 ? list : null)
    } else {
      setParticipantFilter(null)
    }

    if (page === 'address' && addressParam) {
      setSelectedAddress(addressParam)
      setAddressParticipantStatus(null)
      setGlobalSearch(addressParam)
    } else {
      setSelectedAddress(null)
    }
    setAppReady(true)
  }, [])

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search)

      const pageParam = params.get('page') as Page | null
      const addressParam = params.get('address')
      const epochParam = params.get('epoch')

      if (epochParam) {
        const epochId = parseInt(epochParam)
        setSelectedEpochId(isNaN(epochId) ? null : epochId)
      } else {
        setSelectedEpochId(null)
      }

      if (pageParam === 'address' && addressParam) {
        setCurrentPage('address')
        setSelectedAddress(addressParam)
        setAddressParticipantStatus(null)
        setGlobalSearch(addressParam)
        return
      }

      if (
        pageParam === 'timeline' ||
        pageParam === 'models' ||
        pageParam === 'hardware' ||
        pageParam === 'governance' ||
        pageParam === 'blocks' ||
        pageParam === 'transactions' ||
        pageParam === 'nodemap' ||
        pageParam === 'bounty' ||
        pageParam === 'resource'
      ) {
        setCurrentPage(pageParam)
        setSelectedAddress(null)
        setGlobalSearch('')
        return
      }

      setCurrentPage('dashboard')
      setSelectedAddress(null)
      setGlobalSearch('')
      window.history.replaceState({}, '', window.location.pathname)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)

    if (EPOCH_AWARE_PAGES.includes(currentPage)) {
      if (selectedEpochId !== null) {
        params.set('epoch', selectedEpochId.toString())
      } else {
        params.delete('epoch')
      }
    } else {
      params.delete('epoch')
    }

    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname
    window.history.replaceState({}, '', newUrl)
  }, [selectedEpochId, currentPage])

  useEffect(() => {
    if (currentPage === 'dashboard' && data) {
      prefetchAll()
    }
  }, [currentPage, data, prefetchAll])

  useEffect(() => {
    setSelectedHardware('ALL')
  }, [selectedEpochId])

  const handleRefresh = () => {
    refetch()
  }

  const handleEpochSelect = (epochId: number | null) => {
    setSelectedEpochId(epochId)
  }

  const handleParticipantSelect = (address: string | null) => {
    if (!address) {
      setSelectedAddress(null)
      setAddressParticipantStatus(null)
      setCurrentPage('dashboard')
      return
    }

    if (!data) return

    setSelectedAddress(address)
    setAddressParticipantStatus({
      isParticipant: true,
      epochId: selectedEpochId ?? currentEpochId ?? data.epoch_id,
    })
    setCurrentPage('address')

    const params = new URLSearchParams()
    params.set('page', 'address')
    params.set('address', address)

    window.history.pushState({}, '', `?${params.toString()}`)
  }

  const handlePageChange = (page: Page) => {
    setCurrentPage(page)

    if (page === 'dashboard') {
      setParticipantFilter(null)
    }

    const params = new URLSearchParams()
    if (page !== 'dashboard') {
      params.set('page', page)
    }

    window.history.pushState({}, '', params.toString() ? `?${params}` : '/')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleGlobalSearch = () => {
    const input = globalSearch.trim()
    if (!input) {
      toast.error('Please enter address / tx hash / height')
      return
    }

    if (isValidGonkaAddress(input)) {
      setSelectedAddress(input)
      setAddressParticipantStatus(null)
      setCurrentPage('address')

      const params = new URLSearchParams()
      params.set('page', 'address')
      params.set('address', input)

      window.history.pushState({}, '', `?${params.toString()}`)
      return
    }

    if (isHex64(input)) {
      const params = new URLSearchParams()
      params.set('page', 'transactions')
      params.set('tx', input.toUpperCase())

      setCurrentPage('transactions')
      window.history.pushState({}, '', `?${params.toString()}`)
      return
    }

    if (isBlockHeight(input)) {
      const params = new URLSearchParams()
      params.set('page', 'blocks')
      params.set('height', input)

      setCurrentPage('blocks')
      window.history.pushState({}, '', `?${params.toString()}`)
      return
    }

    toast.error('Invalid Address / Tx Hash / Height')
  }

  const hardwareOptions = useMemo(() => {
    if (!data?.hardware) return []
    return Array.from(new Set(data.hardware.map(h => h.hardware))).sort()
  }, [data?.hardware])

  const hardwareSelectOptions = useMemo<ReadonlyArray<SelectOption<string>>>(() => {
    return [
      { value: 'ALL', label: 'All hardware' },
      ...hardwareOptions.map((hardware) => ({ value: hardware, label: hardware })),
    ]
  }, [hardwareOptions])

  const selectedHardwareParticipantSet = useMemo(() => {
    if (selectedHardware === 'ALL') return null
    const hardware_list = data?.hardware ?? []

    const item = hardware_list.find(h => h.hardware === selectedHardware)
    return new Set(item?.participants ?? [])
  }, [data?.hardware, selectedHardware])

  const filteredParticipants = useMemo(() => {
    if (!data) return []

    let participants_list = data.participants

    if (participantFilter && participantFilter.length > 0) {
      const set = new Set(participantFilter)
      participants_list = participants_list.filter(p => set.has(p.index))
    }

    if (selectedHardwareParticipantSet) {
      participants_list = participants_list.filter(p => selectedHardwareParticipantSet.has(p.index))
    }

    return participants_list
  }, [data, participantFilter, selectedHardwareParticipantSet])

  const searchParams = new URLSearchParams(window.location.search)
  const blockHeight = searchParams.get('height')
  const txHash = searchParams.get('tx')
  const proposalId = searchParams.get('proposal_id')

  if (isLoading && !data) {
    return <LoadingScreen label="Loading inference statistics" />
  }

  if (error && !data) {
    return <ErrorScreen error={error} onRetry={handleRefresh} />
  }

  // Header opacity ramp
  const headerInnerScale = 1 - 0.04 * scrollProgress
  const heroFadeOpacity = 1 - scrollProgress * 0.6

  return (
    <>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: {
            background: 'rgba(19, 23, 28, 0.95)',
            color: 'rgb(247, 248, 250)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(20px)',
            fontSize: '13px',
            fontWeight: 500,
            borderRadius: '10px',
            boxShadow: '0 12px 32px -8px rgba(0,0,0,0.5)',
          },
          iconTheme: {
            primary: 'rgb(62, 229, 177)',
            secondary: 'rgb(7, 8, 10)',
          },
        }}
      />

      <div className="min-h-screen flex flex-col relative">
        {/* Animated WebGL mesh-gradient background (with reduced-motion + visibility + DPR safeguards) */}
        <MeshBackground />

        {/* Foreground overlays — kept thin since the shader provides the main atmosphere */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
        >
          <div className="absolute inset-0 grid-overlay opacity-25" />
          {/* Top vignette to lift readability under fixed header */}
          <div className="absolute top-0 inset-x-0 h-40 bg-gradient-to-b from-night-50/60 to-transparent" />
          {/* Bottom vignette for cinematic framing */}
          <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-night-50/40 to-transparent" />
        </div>

        {/* === Fixed scroll-aware header === */}
        <header
          className={`fixed top-0 inset-x-0 z-40 transition-all duration-300 ease-out-expo border-b ${
            scrolled ? 'header-scrolled' : 'header-rest'
          }`}
        >
          <div
            className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 md:px-8 transition-all duration-300 ease-out-expo"
            style={{
              paddingTop: scrolled ? '12px' : '20px',
              paddingBottom: scrolled ? '12px' : '20px',
            }}
          >
            <div className="flex items-center gap-3 sm:gap-5">
              {/* Brand */}
              <button
                onClick={() => handlePageChange('dashboard')}
                className="group relative flex items-center gap-2.5 sm:gap-3 shrink-0"
              >
                <div className="relative">
                  <div className="absolute -inset-2 rounded-full bg-accent-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" aria-hidden />
                  <div
                    className="relative flex items-center justify-center rounded-xl bg-gradient-to-br from-white/[0.10] to-white/[0.02] border border-white/[0.10] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] transition-all duration-300"
                    style={{
                      width: scrolled ? '32px' : '38px',
                      height: scrolled ? '32px' : '38px',
                    }}
                  >
                    <img src="/gonka.svg" alt="Gonka" className="h-[55%] w-auto invert opacity-95" />
                  </div>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span
                    className="font-extrabold text-slate-50 tracking-tight transition-all duration-300"
                    style={{ fontSize: scrolled ? '15px' : '17px' }}
                  >
                    Gonka<span className="text-accent-400">scan</span>
                  </span>
                </div>
              </button>

              {/* Nav (desktop) */}
              <nav className="hidden md:flex items-center gap-0.5 ml-2">
                <NavTab active={currentPage === 'dashboard'} onClick={() => handlePageChange('dashboard')}>
                  Dashboard
                </NavTab>
                <NavDropdown
                  label="Network"
                  active={['blocks', 'transactions', 'timeline'].includes(currentPage)}
                  items={[
                    { page: 'blocks', label: 'Blocks' },
                    { page: 'transactions', label: 'Transactions' },
                    { page: 'timeline', label: 'Timeline' },
                  ]}
                  activePage={currentPage}
                  onSelect={(page) => handlePageChange(page as Page)}
                />
                <NavDropdown
                  label="Participants"
                  active={['models', 'hardware', 'nodemap'].includes(currentPage)}
                  items={[
                    { page: 'models', label: 'Models' },
                    { page: 'hardware', label: 'Hardware' },
                    { page: 'nodemap', label: 'Node Map' },
                  ]}
                  activePage={currentPage}
                  onSelect={(page) => handlePageChange(page as Page)}
                />
                <NavTab active={currentPage === 'governance'} onClick={() => handlePageChange('governance')}>
                  Governance
                </NavTab>
                <NavTab active={currentPage === 'resource'} onClick={() => handlePageChange('resource')}>
                  Resources
                </NavTab>
              </nav>

              {/* Status + search */}
              <div className="ml-auto flex items-center gap-2 sm:gap-3">
                <div
                  className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] transition-opacity duration-300"
                  style={{ opacity: scrolled ? 0.7 : 1 }}
                >
                  <span className="live-dot" aria-hidden />
                  <span className="text-[11px] font-medium text-slate-300 tracking-wide">Mainnet</span>
                </div>

                <div className="relative w-44 sm:w-64 md:w-80">
                  <input
                    type="text"
                    placeholder="Search address, tx, height…"
                    value={globalSearch}
                    onChange={e => setGlobalSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleGlobalSearch()}
                    className="input pl-9 pr-12 h-9 text-[13px]"
                  />
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.4}
                    viewBox="0 0 24 24"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
                  </svg>
                  <kbd className="hidden md:inline-flex absolute right-2.5 top-1/2 -translate-y-1/2 items-center gap-1 px-1.5 h-5 text-[10px] font-mono font-medium text-slate-500 bg-white/[0.04] border border-white/[0.08] rounded">
                    ⏎
                  </kbd>
                </div>
              </div>
            </div>

            {/* Mobile nav row */}
            <nav className="md:hidden flex items-center gap-0.5 mt-3 -mx-1 overflow-x-auto no-scrollbar">
              <NavTab active={currentPage === 'dashboard'} onClick={() => handlePageChange('dashboard')}>Dashboard</NavTab>
              <NavDropdown
                label="Network"
                active={['blocks', 'transactions', 'timeline'].includes(currentPage)}
                items={[
                  { page: 'blocks', label: 'Blocks' },
                  { page: 'transactions', label: 'Transactions' },
                  { page: 'timeline', label: 'Timeline' },
                ]}
                activePage={currentPage}
                onSelect={(page) => handlePageChange(page as Page)}
              />
              <NavDropdown
                label="Participants"
                active={['models', 'hardware', 'nodemap'].includes(currentPage)}
                items={[
                  { page: 'models', label: 'Models' },
                  { page: 'hardware', label: 'Hardware' },
                  { page: 'nodemap', label: 'Node Map' },
                ]}
                activePage={currentPage}
                onSelect={(page) => handlePageChange(page as Page)}
              />
              <NavTab active={currentPage === 'governance'} onClick={() => handlePageChange('governance')}>Governance</NavTab>
              <NavTab active={currentPage === 'resource'} onClick={() => handlePageChange('resource')}>Resources</NavTab>
            </nav>
          </div>
        </header>

        {/* === Main content === */}
        <main className="flex-1 mx-auto w-full max-w-[1440px] px-4 sm:px-6 md:px-8 pt-28 sm:pt-32 md:pt-32 pb-12 sm:pb-16">
          {currentPage === 'timeline' ? (
            <Timeline />
          ) : currentPage === 'models' ? (
            <Models />
          ) : currentPage === 'hardware' ? (
            <Hardware />
          ) : currentPage === 'governance' ? (
            proposalId ? <GovernanceDetail proposalId={proposalId}/> : <Governance />
          ) : currentPage === 'blocks' ? (
            blockHeight ? <BlockDetail height={blockHeight}/> : <Blocks />
          ) : currentPage === 'transactions' ? (
            txHash ? <TransactionDetail txHash={txHash}/> : <Transactions />
          ) : currentPage === 'nodemap' ? (
            <ParticipantMap />
          ) : currentPage === 'resource' ? (
            <Resource onNavigate={(page) => handlePageChange(page as Page)} />
          ) : currentPage === 'bounty' ? (
            <BountyProgram />
          ) : currentPage === 'address' ? (
            selectedAddress ? (
              <AddressRoute
                address={selectedAddress}
                status={addressParticipantStatus}
                onResolved={setAddressParticipantStatus}
              />
            ) : null
          ) : (
            data && (
              <div className="space-y-5 sm:space-y-6 animate-fade-in">
                {/* Hero title */}
                <div
                  className="relative pt-1 sm:pt-2 pb-2"
                  style={{
                    opacity: heroFadeOpacity,
                    transform: `translateY(${(1 - heroFadeOpacity) * -8}px) scale(${headerInnerScale})`,
                    transformOrigin: 'top left',
                  }}
                >
                  <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                    <div>
                      <div className="inline-flex items-center gap-2 mb-3">
                        <span className="chip border-accent-400/30 bg-accent-500/10 text-accent-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-accent-400" />
                          Live network monitor
                        </span>
                      </div>
                      <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-slate-50 leading-tight">
                        Decentralized AI compute,
                        <br className="hidden sm:block" />
                        <span className="text-gradient-accent"> observed in real time.</span>
                      </h1>
                      <p className="mt-3 text-sm sm:text-[15px] text-slate-400 max-w-2xl leading-relaxed">
                        Participant performance, model availability, governance flow, and on-chain activity across the Gonka network.
                      </p>
                    </div>
                  </div>
                </div>

                <MarketStats />
                <ActiveProposals />

                {/* Network summary card */}
                <section className="surface aurora-bg border-gradient-top p-4 sm:p-5 md:p-6 live-shine relative overflow-hidden">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-x-5 gap-y-5 mb-4">
                    <div className="col-span-2 sm:col-span-1">
                      <EpochIdDisplay epochId={data.epoch_id} isCurrent={data.is_current} />
                    </div>

                    <div className="border-t sm:border-t-0 sm:border-l border-white/[0.06] pt-5 sm:pt-0 sm:pl-5 lg:pl-6">
                      <StatItem
                        label="Current Block"
                        subText={shouldShowEstimatedBlock ? <>Last confirmed: {data.height.toLocaleString()}</> : ''}
                      >
                        {shouldShowEstimatedBlock ? estimatedBlock.toLocaleString() : data.height.toLocaleString()}
                      </StatItem>
                    </div>

                    <div className="border-t sm:border-t-0 sm:border-l border-white/[0.06] pt-5 sm:pt-0 sm:pl-5 lg:pl-6">
                      <StatItem label="Participants" subText="">{data.participants.length}</StatItem>
                    </div>

                    <div className="border-t lg:border-t-0 lg:border-l border-white/[0.06] pt-5 lg:pt-0 lg:pl-6">
                      <StatItem label="Total Weight">
                        {data.participants.reduce((sum, p) => sum + p.weight, 0).toLocaleString()}
                      </StatItem>
                    </div>

                    <div className="border-t lg:border-t-0 lg:border-l border-white/[0.06] pt-5 lg:pt-0 lg:pl-6">
                      <StatItem label="Equivalent H100" subText="">
                        {Math.round(weightToH100(
                          data.participants.reduce((sum, p) => sum + p.weight, 0), data.epoch_id,
                        )).toLocaleString()}{' '}
                        <span className="text-sm font-semibold text-slate-500">GPUs</span>
                      </StatItem>
                    </div>

                    <div className="border-t lg:border-t-0 lg:border-l border-white/[0.06] pt-5 lg:pt-0 lg:pl-6 col-span-2 sm:col-span-3 lg:col-span-1">
                      <StatItem
                        label="Assigned Rewards"
                        subText={
                          (data.total_assigned_rewards_gnk === undefined
                            || data.total_assigned_rewards_gnk === null
                            || data.total_assigned_rewards_gnk === 0)
                            ? <>{isLoading ? 'Loading...' : data.is_current
                              ? 'Pending settlement' : 'Calculating...'}</>
                            : ''
                        }
                      >
                        {data.total_assigned_rewards_gnk !== undefined
                          && data.total_assigned_rewards_gnk !== null
                          && data.total_assigned_rewards_gnk > 0
                          ? <>{data.total_assigned_rewards_gnk.toLocaleString()} <span className="text-sm font-semibold text-slate-500">GNK</span></>
                          : '—'
                        }
                      </StatItem>
                    </div>

                    <div className="border-t lg:border-t-0 lg:border-l border-white/[0.06] pt-5 lg:pt-0 lg:pl-6 col-span-2 sm:col-span-3 lg:col-span-1">
                      <EpochTimer data={data} />
                    </div>
                  </div>

                  <RefreshControlFooter
                    refreshInterval="30s"
                    selectedEpochId={selectedEpochId}
                    dataUpdatedAt={dataUpdatedAt}
                    currentEpochId={currentEpochId || data.epoch_id}
                    isLoading={isLoading}
                    onSelectEpoch={handleEpochSelect}
                    onRefresh={handleRefresh}
                  />
                </section>

                {/* Participant table card */}
                <section className="surface p-4 sm:p-5 md:p-6">
                  <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <h2 className="section-title">Participant Statistics</h2>
                      <p className="section-subtitle mt-1">
                        Rows highlighted in red indicate missed or invalidation rate above 10%
                      </p>
                    </div>

                    <div className="w-full sm:w-auto">
                      <Select
                        value={selectedHardware}
                        onChange={setSelectedHardware}
                        options={hardwareSelectOptions}
                        disabled={!data || hardwareOptions.length === 0}
                        className="w-full sm:w-auto"
                        triggerClassName="sm:min-w-[260px]"
                      />
                    </div>
                  </div>
                  {participantFilter && filteredParticipants.length === 0 ? (
                    <div className="surface-inset py-12 text-center">
                      <div className="text-sm text-slate-400">No matching participants in this epoch</div>
                    </div>
                  ) : (
                    <div className="overflow-x-auto -mx-4 sm:-mx-5 md:-mx-6 px-4 sm:px-5 md:px-6">
                      <ParticipantTable
                        participants={filteredParticipants}
                        epochId={data.epoch_id}
                        isCurrentEpoch={data.is_current}
                        currentEpochId={currentEpochId}
                        selectedParticipantId={selectedAddress &&
                          filteredParticipants.some(p => p.index === selectedAddress)
                          ? selectedAddress
                          : null
                        }
                        onParticipantSelect={handleParticipantSelect}
                      />
                    </div>
                  )}
                </section>
              </div>
            )
          )}
        </main>

        {/* Footer */}
        <footer className="border-t border-white/[0.05] bg-night-50/50 backdrop-blur-md py-6 sm:py-8 mt-8">
          <div className="container mx-auto px-4 sm:px-6 max-w-[1440px]">
            <div className="flex flex-col sm:flex-row items-center justify-center sm:justify-between gap-4 text-sm">
              <div className="flex items-center gap-2.5 text-slate-500">
                <img src="/gonka.svg" alt="" className="h-3.5 w-auto opacity-50 invert" />
                <span className="text-[12.5px]">Gonkascan · Real-time Gonka network explorer</span>
              </div>
              <a
                href="https://github.com/6block/gonkascan"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-2 text-slate-400 hover:text-slate-100 transition-colors"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
                <span className="font-medium text-[12.5px]">View source on GitHub</span>
                <svg className="w-3 h-3 transition-transform duration-200 group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </a>
            </div>
          </div>
        </footer>
      </div>
    </>
  )
}

export default App
