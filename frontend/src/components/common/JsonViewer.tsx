import { useState } from 'react'
import ReactJson from 'react-json-view'

export function JsonViewer({ data }: { data: object }) {
  return (
    <ReactJson
      src={data}
      name={false}
      collapsed={1}
      enableClipboard={false}
      displayDataTypes={false}
      displayObjectSize={false}
      theme="ocean"
      style={{
        fontSize: '12.5px',
        padding: '14px',
        borderRadius: '8px',
        backgroundColor: 'transparent',
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      }}
    />
  )
}

export function JsonSection({ data }: { data: object }) {
  const [copied, setCopied] = useState(false)
  const jsonString = JSON.stringify(data, null, 2)

  return (
    <section className="surface p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <h4 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500">JSON</h4>

        <div className="flex gap-3 flex-wrap">
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(jsonString)
              setCopied(true)
            }}
            onMouseLeave={() => setCopied(false)}
            className={`inline-flex items-center gap-1.5 text-xs font-medium transition-colors ${
              copied ? 'text-accent-300' : 'text-slate-400 hover:text-accent-300'
            }`}
          >
            {copied ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Copied
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
                </svg>
                Copy
              </>
            )}
          </button>
        </div>
      </div>

      <div className="rounded-lg overflow-auto max-h-[420px] sm:max-h-[600px] border border-white/[0.06] bg-night-0/60">
        <JsonViewer data={data} />
      </div>
    </section>
  )
}
