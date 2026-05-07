import { useState, useEffect, useCallback } from 'react'
import { FaGithub, FaDiscord } from 'react-icons/fa'
import { FiExternalLink } from 'react-icons/fi'
import { BackNavigation } from './common/BackNavigation'
import { TabBar } from './common/TabBar'
import { GITHUB_URL_OVERRIDES, REWARD_DATA, CONTRIBUTOR_SUMMARY } from '../data/bountyData'

const DISCORD_INVITE_CODE = 'RADwCT2U6R'

const iconClass = 'inline-block ml-0.5 align-baseline relative -top-px'
const GitHubSmallIcon = () => <FaGithub className={`text-[14px] ${iconClass}`} />
const ExternalLinkIcon = () => <FiExternalLink className={`text-[12px] ${iconClass}`} />
const DiscordSmallIcon = () => <FaDiscord className={`text-[14px] ${iconClass}`} />

function truncateAddress(addr: string) {
  if (addr.length <= 20) return addr
  return `${addr.slice(0, 12)}...${addr.slice(-6)}`
}

function useDiscordStats() {
  const [stats, setStats] = useState<{ online: number | null; total: number | null }>({ online: null, total: null })

  const fetchStats = useCallback(async () => {
    try {
      const resp = await fetch(
        `https://discord.com/api/v9/invites/${DISCORD_INVITE_CODE}?with_counts=true`,
      )
      if (resp.ok) {
        const data = await resp.json()
        setStats({
          online: data.approximate_presence_count ?? null,
          total: data.approximate_member_count ?? null,
        })
      }
    } catch {
      // silently fail
    }
  }, [])

  useEffect(() => {
    fetchStats()
    const interval = setInterval(fetchStats, 2 * 60 * 60 * 1000) // 2h
    return () => clearInterval(interval)
  }, [fetchStats])

  return stats
}

// --- Discord ID map (built from CONTRIBUTOR_SUMMARY discord fields) ---
const DISCORD_ID_MAP: Record<string, string> = {}
for (const c of CONTRIBUTOR_SUMMARY) {
  if (!c.discord) continue
  const m = c.discord.match(/^(@[^"[]+)\["(\d+)"\]/)
  if (m) DISCORD_ID_MAP[m[1]] = m[2]
}

function resolveDiscordUrl(displayName: string): string | null {
  const id = DISCORD_ID_MAP[displayName]
  return id ? `https://discord.com/users/${id}` : null
}

// --- Shared link style ---
const linkClass = 'text-slate-50 hover:text-accent-300 underline decoration-gray-300 hover:decoration-blue-600 underline-offset-2'

// --- Contributor field parsing ---
// Fields use format: DisplayName["url_or_id"]

function parseGithubEntries(raw: string): { display: string; url: string }[] {
  const tokenRe = /(\S+)\["(https:\/\/github\.com\/[^"]+)"\]/g
  const entries: { display: string; url: string }[] = []
  let m
  while ((m = tokenRe.exec(raw)) !== null) {
    entries.push({ display: m[1], url: m[2] })
  }
  if (entries.length === 0) {
    return [{ display: raw, url: `https://github.com/${raw}` }]
  }
  return entries
}

function parseDiscordField(raw: string): { display: string; url: string | null } {
  const m = raw.match(/^(@[^"[]+)\["(\d+)"\]$/)
  if (m) return { display: m[1], url: `https://discord.com/users/${m[2]}` }
  return { display: raw, url: null }
}

type Tab = 'records' | 'rank'

export function BountyProgram() {
  const [activeTab, setActiveTab] = useState<Tab>('records')
  const discordStats = useDiscordStats()

  const handleBack = () => {
    window.history.pushState({}, '', '?page=resource')
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  const totalDistributed = REWARD_DATA.reduce(
    (sum, group) => sum + group.records.reduce((s, r) => s + r.amount, 0),
    0,
  )

  return (
    <div className="space-y-6">
      <BackNavigation onBack={handleBack} backLabel="Resource" title="Bounty Program"/>

      {/* Discord Community */}
      <div className="surface p-6">
        <h3 className="text-base font-semibold text-slate-50 mb-4">Discord community</h3>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src="/gonka.svg" alt="Gonka" className="w-10 h-10 rounded-full shrink-0" />
            <div>
              <div className="text-sm font-semibold text-slate-50">Gonka Official</div>
              <div className="text-xs text-slate-400">
                Live: {discordStats.online?.toLocaleString() ?? '...'} &bull;&nbsp;
                Total: {discordStats.total?.toLocaleString() ?? '...'}
              </div>
            </div>
          </div>
          <a
            href="https://discord.com/invite/RADwCT2U6R"
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2 bg-[#5865F2] text-white text-sm font-medium rounded-lg hover:bg-[#4752C4] transition-colors"
          >
            Join
          </a>
        </div>
        <p className="text-sm text-slate-400 mt-4">
          Join our Discord community to get the latest bounty program updates, technical support, and connect with other developers.
        </p>
      </div>

      {/* Tabs */}
      <TabBar
        tabs={['records', 'rank'] as Tab[]}
        activeTab={activeTab}
        onChange={setActiveTab}
        label={(tab) => tab === 'records' ? 'Reward Records' : 'Rank'}
      />

      {/* Tab Content */}
      {activeTab === 'records' ? (
        <div className="space-y-6">
          {REWARD_DATA.map((group, gi) => (
            <div key={gi} className="surface overflow-hidden">
              <div className="bg-white/[0.02] border-b border-white/[0.06] px-5 py-3">
                <div className="font-semibold text-slate-50">{group.title}</div>
                <div className="text-xs text-slate-400 mt-0.5">{group.time}</div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[860px]">
                  <colgroup>
                    <col className="w-[16%]" />
                    <col className="w-[12%]" />
                    <col className="w-[15%]" />
                    <col />
                    <col className="w-[16%]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="text-left py-2.5 px-4 font-medium text-slate-300">Address</th>
                      <th className="text-right py-2.5 px-4 font-medium text-slate-300">Amount (GNK)</th>
                      <th className="text-left py-2.5 px-4 font-medium text-slate-300">GitHub</th>
                      <th className="text-left py-2.5 px-4 font-medium text-slate-300">Task</th>
                      <th className="text-left py-2.5 px-4 font-medium text-slate-300">Discord</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.records.map((r, ri) => {
                      const discordUrl = r.discord ? resolveDiscordUrl(r.discord) : null
                      return (
                        <tr key={ri} className="border-b border-white/[0.05] last:border-0 hover:bg-white/[0.02] align-top">
                          <td className="py-2.5 px-4">
                            {r.address ? (
                              <a
                                href={`?page=address&address=${r.address}`}
                                className="text-accent-300 hover:text-accent-200 font-mono text-xs"
                                title={r.address}
                              >
                                {truncateAddress(r.address)}
                              </a>
                            ) : (
                              <span className="text-slate-500">-</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-slate-50 whitespace-nowrap">
                            {r.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-2.5 px-4">
                            {r.githubUsername ? (
                              r.githubUsername.includes(', ') ? (
                                <span className="inline-flex flex-wrap items-center gap-x-1.5">
                                  {r.githubUsername.split(', ').map((name, i, arr) => (
                                    <span key={name} className="inline-flex items-center">
                                      <a
                                        href={GITHUB_URL_OVERRIDES[name] ?? `https://github.com/${name}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={linkClass}
                                      >
                                        {name}
                                        <GitHubSmallIcon />
                                      </a>
                                      {i < arr.length - 1 && <span className="text-slate-500">,</span>}
                                    </span>
                                  ))}
                                </span>
                              ) : (
                                <a
                                  href={GITHUB_URL_OVERRIDES[r.githubUsername] ?? `https://github.com/${r.githubUsername}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={linkClass}
                                >
                                  {r.githubUsername}
                                  <GitHubSmallIcon />
                                </a>
                              )
                            ) : (
                              <span className="text-slate-500">-</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-slate-300 break-words">
                            {r.task ? (
                              r.taskUrl ? (
                                <a
                                  href={r.taskUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-slate-300 hover:text-accent-300 underline decoration-gray-300 hover:decoration-blue-600 underline-offset-2"
                                >
                                  {r.task}<ExternalLinkIcon />
                                </a>
                              ) : (
                                <span>{r.task}</span>
                              )
                            ) : (
                              <span className="text-slate-500">-</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4">
                            {r.discord ? (
                              discordUrl ? (
                                <a href={discordUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
                                  {r.discord}
                                  <DiscordSmallIcon />
                                </a>
                              ) : (
                                <span className="text-slate-50">{r.discord}</span>
                              )
                            ) : (
                              <span className="text-slate-500">-</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <colgroup>
                <col className="w-[10%]" />
                <col className="w-[30%]" />
                <col className="w-[30%]" />
                <col className="w-[30%]" />
              </colgroup>
              <thead>
                <tr className="bg-white/[0.02] border-b border-white/[0.06]">
                  <th className="text-left py-3 px-4 font-medium text-slate-300">#</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-300">Github / Name</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-300">Discord</th>
                  <th className="text-center py-3 px-4 font-medium text-slate-300">Amount (GNK)</th>
                </tr>
              </thead>
              <tbody>
                {CONTRIBUTOR_SUMMARY.map((c, i) => {
                  const ghEntries = c.github ? parseGithubEntries(c.github) : []
                  const dc = c.discord ? parseDiscordField(c.discord) : null
                  return (
                    <tr key={i} className="border-b border-white/[0.05] last:border-0 hover:bg-white/[0.02]">
                      <td className="py-2.5 px-4 text-slate-500">{i + 1}</td>
                      <td className="py-2.5 px-4 font-medium">
                        {ghEntries.length > 0 ? (
                          <span className="inline-flex flex-wrap items-center gap-x-1">
                            {c.name && <span className="text-slate-50">{c.name} </span>}
                            {ghEntries.map((gh, gi) => (
                              <span key={gi} className="inline-flex items-center">
                                <a href={gh.url} target="_blank" rel="noopener noreferrer" className={linkClass}>
                                  {gh.display}
                                  <GitHubSmallIcon />
                                </a>
                                {gi < ghEntries.length - 1 && <span className="text-slate-500">,</span>}
                              </span>
                            ))}
                          </span>
                        ) : c.name ? (
                          <span className="text-slate-50">{c.name}</span>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 font-medium">
                        {dc ? (
                          dc.url ? (
                            <a href={dc.url} target="_blank" rel="noopener noreferrer" className={linkClass}>
                              {dc.display}
                              <DiscordSmallIcon />
                            </a>
                          ) : (
                            <span className="text-slate-50">{dc.display}</span>
                          )
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-center text-slate-50 font-mono">
                        {c.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-white/[0.02] border-t border-white/[0.06]">
                  <td className="py-3 px-4" />
                  <td className="py-3 px-4 font-semibold text-slate-50" colSpan={2}>Total Distributed</td>
                  <td className="py-3 px-4 text-center font-semibold text-slate-50 font-mono">
                    {totalDistributed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
