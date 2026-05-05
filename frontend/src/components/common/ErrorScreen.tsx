interface ErrorScreenProps {
  error: string | Error | null
  title?: string
  onRetry?: () => void
  className?: string
}

export default function ErrorScreen({
  error,
  title = 'Something went wrong',
  onRetry,
  className = 'min-h-screen',
}: ErrorScreenProps) {
  const message = error instanceof Error ? error.message : (error || 'An unknown error occurred')

  return (
    <div className={`${className} flex items-center justify-center px-4`}>
      <div className="surface p-6 sm:p-8 max-w-md w-full animate-fade-in">
        <div className="flex items-start gap-4">
          <div className="shrink-0 w-11 h-11 rounded-xl bg-red-500/10 border border-red-400/25 flex items-center justify-center">
            <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-slate-50 tracking-tight">{title}</h2>
            <p className="mt-1.5 text-sm text-slate-400 leading-relaxed break-words">{message}</p>
            {onRetry && (
              <button onClick={onRetry} className="btn-primary mt-5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                Try again
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
