import { useEffect, useMemo, useState } from 'react'
import { toGonka } from '../../utils'

function isPrimitive(v: unknown): v is string | number | boolean | null {
  return v === null || ['string', 'number', 'boolean'].includes(typeof v)
}

function displayPrimitive(v: unknown) {
  if (v === null) return 'null'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return String(v)
}

function keyLabel(k: string) {
  if (!k) return k
  if (k === '@type') return '@Type'
  return k.replace(/[_-]+/g, ' ').split(' ')
    .map((word) => word.length > 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word)
    .join(' ')
}

function VerticalTable({ data, level }: { data: Record<string, unknown>, level: number }) {
  return (
    <div className="rounded-md">
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="grid grid-cols-1 md:grid-cols-[minmax(150px,max-content)_1fr] border-b border-white/[0.05] last:border-b-0">
          <div className="px-3 md:px-4 py-2.5 text-slate-500 flex items-center bg-white/[0.015] md:bg-transparent">
            <span className="break-words whitespace-normal leading-snug text-[12.5px] font-medium uppercase tracking-wider">{keyLabel(key)}</span>
          </div>
          <div className="px-3 md:px-4 py-2.5 min-w-0 text-slate-100">
            <StructRenderer data={value} level={level + 1} />
          </div>
        </div>
      ))}
    </div>
  )
}

function TabbedObject({ data, level }: { data: Record<string, unknown>, level: number }) {
  const keys = useMemo(() => Object.keys(data), [data])
  const [activeKey, setActiveKey] = useState<string>(() => keys[0] ?? '')

  const keysKey = keys.join('|')
  useEffect(() => {
    if (!activeKey || !keys.includes(activeKey)) {
      setActiveKey(keys[0] ?? '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset tab when keys change
  }, [keysKey])

  if (keys.length === 0) {
    return <span className="text-slate-500">{'{}'}</span>
  }

  const activeValue = data[activeKey]

  return (
    <div>
      <div className="pt-3">
        <div className="flex gap-4 md:gap-6 overflow-x-auto pb-1 text-sm [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {keys.map((k) => {
            const isActive = k === activeKey
            return (
              <button key={k} type="button" onClick={() => setActiveKey(k)}
                className={[
                  'text-sm whitespace-nowrap shrink-0 font-medium pb-1.5 transition-colors',
                  isActive
                    ? 'border-b-2 border-accent-400/70 text-slate-50'
                    : 'border-b-2 border-transparent text-slate-500 hover:text-slate-200',
                ].join(' ')}
              >
                {keyLabel(k)}
              </button>
            )
          })}
        </div>
      </div>

      <div className="py-2 overflow-x-hidden">
        <div className="space-y-4">
          {isPrimitive(activeValue) ? (
            <div className="text-sm break-all text-slate-400">{displayPrimitive(activeValue)}</div>
          ) : (
            <StructRenderer data={activeValue} level={level + 1} />
          )}
        </div>
      </div>
    </div>
  )
}

export function StringArray({data, collapseCount = 30}: {
  data: string[]
  collapseCount?: number
}) {
  const [expanded, setExpanded] = useState(false)

  if (data.length === 0) {
    return <span className="text-slate-400">[]</span>
  }

  const visible = expanded ? data : data.slice(0, collapseCount)
  const hiddenCount = data.length - visible.length

  return (
    <div className="font-mono text-sm text-slate-300">
      <span>[</span>

      <div className="flex flex-wrap gap-x-3 gap-y-1 pl-2 md:pl-4">
        {visible.map((v, i) => (
          <span key={i} className="break-all">
            "{v}"
            {i < visible.length - 1 || hiddenCount > 0 ? ',' : ''}
          </span>
        ))}

        {!expanded && hiddenCount > 0 && (
          <span className="text-slate-500 italic whitespace-nowrap"> … {hiddenCount} more</span>
        )}
      </div>

      <span>]</span>

      {data.length > collapseCount && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="mt-2 text-xs text-accent-300 hover:underline"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

function StructArray({ data, level }: { data: unknown[], level: number }) {
  if (data.length === 0) {
    return <span className="text-slate-400">[]</span>
  }

  const first = data[0]

  if (typeof first === 'object' && first !== null && !Array.isArray(first)) {
    const columns = Object.keys(first as Record<string, unknown>)
    const rows = data as Record<string, unknown>[]

    return (
      <div className="max-h-[360px] overflow-y-auto overflow-x-auto">
        <table className="min-w-[640px] w-max md:min-w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-night-200/95 backdrop-blur">
            <tr>
              {columns.map((col) => (
                <th key={col} className="px-3 md:px-4 py-2 text-left whitespace-nowrap text-slate-400 font-normal">{col}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t align-top">
                {columns.map((col) => (
                  <td key={col} className="px-3 md:px-4 py-2 break-all align-middle">
                    {(() => {
                      let value = row[col]
                      if (row?.denom === 'ngonka') {
                        if (col === 'amount') {
                          value = row.amount + ' ( ' + toGonka(row.amount as string).toString() + ' gonka )'
                        }
                      }
                      return <StructRenderer data={value} level={level + 1} />
                    })()}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="border rounded-md">
      {data.map((v, i) => (
        <div key={i} className="border-b last:border-b-0 px-3 md:px-4 py-2">
          <StructRenderer data={v} level={level + 1} />
        </div>
      ))}
    </div>
  )
}

export function StructRenderer({ data, level }: { data: unknown, level: number }) {
  if (data === null || typeof data !== 'object') {
    return (<span className="break-all font-normal text-sm leading-relaxed text-slate-400">{String(data)}</span>)
  }
  if (Array.isArray(data)) {
    if (data.every(v => typeof v === 'string')) {
      return <StringArray data={data} />
    }
    return (<StructArray data={data} level={level} />)
  }
  if (level % 2 === 1) {
    return <VerticalTable data={data as Record<string, unknown>} level={level} />
  }
  return <TabbedObject data={data as Record<string, unknown>} level={level} />
}

export function MessageBlock({ msg }: { msg: Record<string, unknown> & { '@type'?: string } }) {
  return (
    <div className="surface-inset mb-4 md:mb-5 overflow-hidden">
      <div className="bg-white/[0.03] border-b border-white/[0.06] px-3 md:px-4 py-2.5 font-mono text-xs flex flex-wrap gap-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500">@Type</span>
        <span className="font-medium text-slate-200 break-all">{msg['@type']}</span>
      </div>

      <div className="p-3 md:p-4">
        <StructRenderer data={msg} level={1} />
      </div>
    </div>
  )
}
