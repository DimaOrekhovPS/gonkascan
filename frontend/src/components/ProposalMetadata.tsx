import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MarkdownViewer } from './common/MarkdownViewer'
import LoadingScreen from './common/LoadingScreen'

type GithubMetadataCandidates = {
  rawMain: string
  rawCommit?: string
  blobMain: string
  blobCommit?: string
}

function extractMetadataLikeUrl(
  metadata?: string | null,
  summary?: string | null,
): { url: string; source: 'metadata' | 'summary' } | null {
  if (metadata && metadata.trim()) {
    return { url: metadata.trim(), source: 'metadata' }
  }

  if (!summary) return null

  const s = summary.trim()
  if (!/^https?:\/\/\S+$/.test(s)) {
    return null
  }

  try {
    const u = new URL(s)
    if (
      u.hostname === 'github.com' ||
      u.hostname === 'raw.githubusercontent.com' ||
      u.hostname.includes('forum') ||
      u.hostname.includes('discourse')
    ) {
      return { url: s, source: 'summary' }
    }
  } catch {
    return null
  }

  return null
}

function normalizeGithubMetadataCandidates(
  input: string,
): GithubMetadataCandidates | null {
  try {
    const u = new URL(input)

    let owner = ''
    let repo = ''
    let filePath = ''
    let commit: string | undefined

    if (u.hostname === 'raw.githubusercontent.com') {
      const parts = u.pathname.split('/').filter(Boolean)
      if (parts.length < 3) return null

      owner = parts[0]
      repo = parts[1]
      const ref = parts[2]
      filePath = parts.slice(3).join('/')
      if (!filePath) {
        filePath = 'README.md'
      }

      if (ref !== 'main') {
        commit = ref
      }
    } else if (u.hostname === 'github.com') {
      const parts = u.pathname.split('/').filter(Boolean)
      if (parts.length < 4) return null

      owner = parts[0]
      repo = parts[1]
      const type = parts[2] // blob | tree | commit
      const ref = parts[3]
      filePath = parts.slice(4).join('/')

      if (!filePath) {
        filePath = 'README.md'
      }

      if (
        (type === 'blob' || type === 'commit' || type === 'tree') &&
        ref !== 'main'
      ) {
        commit = ref
      }
    } else {
      return null
    }

    return {
      rawMain: `https://raw.githubusercontent.com/${owner}/${repo}/main/${filePath}`,
      rawCommit: commit
        ? `https://raw.githubusercontent.com/${owner}/${repo}/${commit}/${filePath}`
        : undefined,

      blobMain: `https://github.com/${owner}/${repo}/blob/main/${filePath}`,
      blobCommit: commit
        ? `https://github.com/${owner}/${repo}/blob/${commit}/${filePath}`
        : undefined,
    }
  } catch {
    return null
  }
}

type ProposalMetadataProps = {
  metadata?: string | null
  summary?: string | null
}

type ResolvedMetadata = {
  content: string
  raw: string
  blob: string
  source: 'main' | 'commit'
  from: 'metadata' | 'summary'
}

export function ProposalMetadata({ metadata, summary }: ProposalMetadataProps) {
  const metaLike = useMemo(() => {
    return extractMetadataLikeUrl(metadata, summary)
  }, [metadata, summary])

  const candidates = useMemo(() => {
    return metaLike ? normalizeGithubMetadataCandidates(metaLike.url) : null
  }, [metaLike])

  const { data, isLoading } = useQuery<ResolvedMetadata | null>({
    queryKey: ['proposal-metadata', metaLike, candidates],
    queryFn: async () => {
      if (!candidates || !metaLike) return null

      const tryFetch = async (raw: string) => {
        const r = await fetch(raw)
        if (!r.ok) throw new Error('not found')
        return r.text()
      }

      try {
        const text = await tryFetch(candidates.rawMain)
        return {
          content: text,
          raw: candidates.rawMain,
          blob: candidates.blobMain,
          source: 'main',
          from: metaLike.source,
        }
      } catch { /* fetch failed, try commit fallback */ }

      if (candidates.rawCommit && candidates.blobCommit) {
        try {
          const text = await tryFetch(candidates.rawCommit)
          return {
            content: text,
            raw: candidates.rawCommit,
            blob: candidates.blobCommit,
            source: 'commit',
            from: metaLike.source,
          }
        } catch { /* commit fetch failed */ }
      }

      return null
    },
    enabled: !!candidates,
  })

  if (!metaLike || !candidates) return null
  if (isLoading) {
    return <LoadingScreen label="Loading metadata..." className="py-10" />
  }
  if (!data) return null

  return (
    <section className="surface p-4 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-slate-50">METADATA</h3>

          {data.from === 'summary' && (
            <span className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-md bg-white/[0.05] text-slate-300 border border-white/[0.08] font-semibold tracking-wide">summary</span>
          )}

          {data.source === 'commit' && (
            <span className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-400/25 font-semibold tracking-wide">commit</span>
          )}
        </div>

        <a
          href={data.blob}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-accent-300 hover:underline break-all"
        >
          Open original ↗
        </a>
      </div>

      <MarkdownViewer content={data.content} />
    </section>
  )
}
