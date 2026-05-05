interface LoadingScreenProps {
  label?: string
  className?: string
}

export default function LoadingScreen({
  label = 'Loading',
  className = 'min-h-screen',
}: LoadingScreenProps) {
  return (
    <div className={`${className} flex items-center justify-center px-4`}>
      <div className="flex flex-col items-center gap-6 animate-fade-in">
        <div className="relative h-16 w-16">
          {/* Outer ring */}
          <div className="absolute inset-0 rounded-full border border-white/5" />
          {/* Spinning arc */}
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-accent-400 border-r-accent-400/40 animate-spin"
            style={{ animationDuration: '1.2s' }}
          />
          {/* Inner glow */}
          <div className="absolute inset-3 rounded-full bg-accent-400/20 blur-xl animate-pulse-soft" />
          {/* Center dot */}
          <div className="absolute inset-[42%] rounded-full bg-accent-400 shadow-[0_0_18px_rgba(62,229,177,0.6)]" />
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-sm font-medium text-slate-100 tracking-tight">{label}</p>
          <p className="text-xs text-slate-500 tracking-wide">Connecting to the Gonka network</p>
        </div>
      </div>
    </div>
  )
}
