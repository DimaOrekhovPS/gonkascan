import { useQuery } from '@tanstack/react-query'
import { apiFetch, formatDecimal, formatInt, timeAgo } from '../utils'

type MarketResponse = {
  market_stats: {
    price: number
    best_ask: number
    best_bid: number
    spread_percent: number
    updated_at: string
  }
  token_stats: {
    user_circulating: number
    total_supply: number
    total_mining_rewards: number
    genesis_total: number
    module_balance: number
    community_pool: number
    updated_at: string
  }
}

export function MarketStats() {
  const { data } = useQuery<MarketResponse>({
    queryKey: ['market-stats'],
    queryFn: () => apiFetch('/v1/stats/market'),
    refetchInterval: 600000,
  })

  if (!data) return null

  const { market_stats, token_stats } = data
  const askRatio = 50 + market_stats.spread_percent / 2
  const bidRatio = 100 - askRatio

  return (
    <section className="surface p-4 sm:p-5 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <div>
          <h2 className="section-title">Market &amp; Token Data</h2>
          <p className="section-subtitle mt-0.5">Live GNK market depth and supply metrics</p>
        </div>

        <a
          href="https://hex.exchange/otc/gonka38261660"
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-accent-300 hover:text-accent-200 transition-colors"
        >
          Powered by HEX
          <svg className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
        </a>
      </div>

      {/* Price + OrderBook */}
      <div className="surface-inset p-4 sm:p-5 mb-5">
        <div className="flex flex-col lg:flex-row lg:items-center gap-5 lg:gap-6">
          <div className="shrink-0 lg:min-w-[240px]">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500">GNK Price</span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-accent-500/12 border border-accent-400/30">
                <span className="w-1.5 h-1.5 bg-accent-400 rounded-full animate-live-pulse shadow-[0_0_6px_rgba(62,229,177,0.7)]" />
                <span className="text-[9.5px] font-bold text-accent-300 tracking-widest">LIVE</span>
              </span>
              <span className="text-slate-500 text-[11px]">· {timeAgo(market_stats.updated_at)}</span>
            </div>

            <div className="text-3xl sm:text-4xl font-extrabold text-slate-50 tracking-tight tabular-nums break-words">
              <span className="text-slate-500 font-semibold mr-0.5">$</span>
              {formatDecimal(market_stats.price)}
            </div>
          </div>

          <div className="flex-1">
            <div className="rounded-xl p-4 sm:p-5 bg-white/[0.02] border border-white/[0.06]">
              <div className="flex justify-between text-base sm:text-lg font-bold mb-3">
                <span className="inline-flex items-baseline gap-1.5 text-red-400 tabular-nums">
                  <span className="text-[10.5px] uppercase tracking-[0.14em] font-semibold text-red-400/70">Sell</span>
                  <span>${formatDecimal(market_stats.best_ask)}</span>
                </span>
                <span className="inline-flex items-baseline gap-1.5 text-accent-300 tabular-nums">
                  <span>${formatDecimal(market_stats.best_bid)}</span>
                  <span className="text-[10.5px] uppercase tracking-[0.14em] font-semibold text-accent-300/70">Buy</span>
                </span>
              </div>

              <div className="relative h-2 bg-white/[0.04] rounded-full overflow-hidden mb-2">
                <div
                  className="absolute left-0 top-0 h-full transition-all duration-500 ease-out-expo"
                  style={{
                    width: `${askRatio}%`,
                    background: 'linear-gradient(90deg, rgba(248,113,113,0.85) 0%, rgba(248,113,113,0.55) 100%)',
                  }}
                />
                <div
                  className="absolute right-0 top-0 h-full transition-all duration-500 ease-out-expo"
                  style={{
                    width: `${bidRatio}%`,
                    background: 'linear-gradient(270deg, rgba(62,229,177,0.85) 0%, rgba(62,229,177,0.55) 100%)',
                  }}
                />
                <div className="absolute top-0 bottom-0 left-1/2 w-px bg-night-50" aria-hidden />
              </div>

              <div className="flex justify-between text-[11px] text-slate-500 font-mono tabular-nums">
                <span>Ask {askRatio.toFixed(0)}%</span>
                <span className="text-slate-600">spread</span>
                <span>Bid {bidRatio.toFixed(0)}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Token stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {[
          { label: 'Circulating supply', value: token_stats.user_circulating },
          { label: 'Total supply', value: token_stats.total_supply },
          { label: 'Mining rewards', value: token_stats.total_mining_rewards },
          { label: 'Genesis allocation', value: token_stats.genesis_total },
          { label: 'System tokens', value: token_stats.module_balance },
          { label: 'Community pool', value: token_stats.community_pool },
        ].map((item) => (
          <div key={item.label}>
            <div className="text-[10px] sm:text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500 mb-1.5">
              {item.label}
            </div>
            <div className="text-[15px] sm:text-base lg:text-lg font-bold text-slate-50 tabular-nums break-words tracking-tight">
              {formatInt(item.value)}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
