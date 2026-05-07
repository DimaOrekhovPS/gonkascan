interface TabBarProps<T extends string> {
  tabs: T[]
  activeTab: T
  onChange: (tab: T) => void
  label?: (tab: T) => string
  variant?: 'solid' | 'outline' | 'pill'
}

export function TabBar<T extends string>({
  tabs,
  activeTab,
  onChange,
  label,
  variant = 'pill',
}: TabBarProps<T>) {
  const getLabel = label ?? ((tab: T) => tab.charAt(0).toUpperCase() + tab.slice(1))

  if (variant === 'pill') {
    return (
      <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] no-scrollbar overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => onChange(tab)}
            className={`shrink-0 whitespace-nowrap text-[13px] font-medium px-3.5 h-8 rounded-lg transition-all duration-200 ease-out-expo ${
              activeTab === tab
                ? 'bg-white/[0.08] text-slate-50 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            {getLabel(tab)}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={`shrink-0 whitespace-nowrap text-sm font-medium rounded-lg border transition-colors ${
            variant === 'solid'
              ? `px-4 h-9 ${
                activeTab === tab
                  ? 'bg-white/10 text-slate-50 border-white/20'
                  : 'bg-transparent text-slate-400 border-white/10 hover:bg-white/5 hover:text-slate-200'
              }`
              : `px-3 py-1.5 ${
                activeTab === tab
                  ? 'border-white/30 text-slate-50'
                  : 'border-white/10 text-slate-500 hover:text-slate-300'
              }`
          }`}
        >
          {getLabel(tab)}
        </button>
      ))}
    </div>
  )
}
