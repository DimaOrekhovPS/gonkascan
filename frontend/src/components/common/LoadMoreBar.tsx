interface LoadMoreBarProps {
  loaded: number
  total: number
  loading?: boolean
  label?: string
  onLoadMore: () => void
}

export function LoadMoreBar({ loaded, total, loading, label = 'Transactions', onLoadMore }: LoadMoreBarProps) {
  const hasMore = loaded < total

  if (!hasMore) {
    return (
      <div className="mt-3 py-3 text-center text-xs text-slate-500 bg-white/[0.02] border border-white/[0.06] rounded-lg">
        All {total.toLocaleString()} {label.toLowerCase()} loaded
      </div>
    )
  }

  return (
    <button
      onClick={onLoadMore}
      disabled={loading}
      className="w-full mt-3 py-3 text-center text-sm font-medium text-accent-300 bg-white/[0.02] border border-white/[0.06] rounded-lg hover:bg-white/[0.04] transition-colors disabled:opacity-60 cursor-pointer"
    >
      {loading ? (
        'Loading...'
      ) : (
        <>Load More {label} ({loaded.toLocaleString()} loaded, more available)</>
      )}
    </button>
  )
}
