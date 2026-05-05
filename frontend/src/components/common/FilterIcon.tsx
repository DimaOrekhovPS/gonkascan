export function FilterIcon({ active, onClick }: { active: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center justify-center w-6 h-6 rounded ml-1 transition-colors ${
        active ? 'bg-accent-500/[0.12] text-accent-300' : 'bg-white/[0.04] text-slate-500 hover:bg-white/[0.06] hover:text-slate-400'
      }`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
      </svg>
    </button>
  )
}
