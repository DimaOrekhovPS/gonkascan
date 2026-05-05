import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AssetsResponse } from '../types/inference'
import { AddressTransactionsTable } from './AddressTransactionsTable'
import { TransfersTable } from './TransfersTable'
import { TabBar } from './common/TabBar'
import { formatGNK, apiFetch, toGonka } from '../utils'
import { BackNavigation } from './common/BackNavigation'

interface AddressProps {
  address: string
}

type TabType = 'transfers' | 'transactions'

function getInitialTab(): TabType {
  const tab = new URLSearchParams(window.location.search).get('tab')
  if (tab === 'transfers' || tab === 'transactions') return tab
  return 'transfers'
}

export function Address({ address }: AddressProps) {
  const [activeTab, setActiveTab] = useState<TabType>(getInitialTab)

  const { data: assets, isLoading: assetsLoading } = useQuery<AssetsResponse>({
    queryKey: ['address-assets', address],
    queryFn: () => apiFetch(`/v1/address/assets/${address}`),
    enabled: !!address,
  })

  const balance = assets?.balances?.find(b => b.denom === 'ngonka')
    ? toGonka(assets.balances.find(b => b.denom === 'ngonka')!.amount) : 0

  const vesting = assets?.total_vesting?.find(v => v.denom === 'ngonka')
    ? toGonka(assets.total_vesting.find(v => v.denom === 'ngonka')!.amount) : 0

  const mined = assets?.total_rewarded?.amount ? toGonka(assets.total_rewarded.amount) : 0

  const total = balance + vesting

  const handleBack = () => {
    const params = new URLSearchParams(window.location.search)
    params.delete('page')
    params.delete('address')

    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname

    window.history.pushState({}, '', newUrl)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  const cards: { label: string; value: number; accent?: boolean }[] = [
    { label: 'Total', value: total },
    { label: 'Balance', value: balance },
    { label: 'Mined', value: mined, accent: true },
    { label: 'Vesting', value: vesting },
  ]

  return (
    <div className="w-full max-w-[1440px] mx-auto animate-fade-in">
      <div className="surface overflow-hidden">

        <div className="border-b border-white/[0.06] px-4 sm:px-5 md:px-6 py-4 sm:py-5">
          <BackNavigation
            onBack={handleBack}
            backLabel="Back to Dashboard"
            title={<span className="font-mono">{address}</span>}
            badge={{ label: 'Wallet', color: 'blue' }}
          />
        </div>

        <div className="px-4 sm:px-5 md:px-6 py-5 sm:py-6 md:py-7">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            {cards.map(({ label, value, accent }) => (
              <div key={label} className="surface-inset p-4 sm:p-5">
                <div className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] mb-2">
                  {label}
                </div>
                <div className={`text-xl sm:text-2xl font-bold tabular-nums break-words tracking-tight ${
                  accent ? 'text-accent-300' : 'text-slate-50'
                }`}>
                  {assetsLoading ? '—' : formatGNK(value)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="px-4 sm:px-5 md:px-6 pb-3">
          <TabBar
            tabs={['transfers', 'transactions'] as TabType[]}
            activeTab={activeTab}
            onChange={setActiveTab}
            variant="pill"
          />
        </div>

        <div className="border-t border-white/[0.06] px-4 sm:px-5 md:px-6 py-5 sm:py-6">
          {activeTab === 'transfers' && (
            <TransfersTable address={address} />
          )}
          {activeTab === 'transactions' && (
            <AddressTransactionsTable address={address} />
          )}
        </div>

      </div>
    </div>
  )
}
