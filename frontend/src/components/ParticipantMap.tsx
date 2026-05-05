import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as d3 from 'd3'
import { ParticipantMapResponse } from '../types/inference'
import { apiFetch } from '../utils'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import countries from 'i18n-iso-countries'
import enLocale from 'i18n-iso-countries/langs/en.json'
import LoadingScreen from './common/LoadingScreen'
import ErrorScreen from './common/ErrorScreen'

countries.registerLocale(enLocale)

type CountryStat = {
  code: string
  name: string
  count: number
}  

export function ParticipantMap() {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [geoData, setGeoData] = useState<FeatureCollection<Geometry> | null>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [countryStats, setCountryStats] = useState<CountryStat[]>([])

  const { data, isLoading, error, refetch } = useQuery<ParticipantMapResponse>({
    queryKey: ['participants-map'],
    queryFn: () => apiFetch('/v1/participants/map'),
    staleTime: 60000,
    refetchInterval: 60000,
    refetchOnMount: true,
    placeholderData: (previousData) => previousData,
  })

  useEffect(() => {
    fetch('/world.geojson')
      .then(res => res.json())
      .then(data => setGeoData(data))
      .catch(() => {})
  }, [])

  useEffect(() => {
    let frameId: number
    const measure = () => {
      if (containerRef.current) {
        const { width } = containerRef.current.getBoundingClientRect()
        if (width > 0) {
          const height = width * 0.52
          setDimensions({ width, height })
          return
        }
      }
      frameId = requestAnimationFrame(measure)
    }
    
    measure()
    
    const handleWindowResize = () => {
      if (!containerRef.current) return
      const { width } = containerRef.current.getBoundingClientRect()
      if (width > 0) {
        const height = width * 0.52
        setDimensions({ width, height })
      }
    }

    window.addEventListener('resize', handleWindowResize)
    return () => {
      if (frameId) cancelAnimationFrame(frameId)
      window.removeEventListener('resize', handleWindowResize)
    }
  }, [])    

  useEffect(() => {
    if (!geoData || !svgRef.current || !data || !dimensions.width || !dimensions.height) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const countryCounts: Record<string, CountryStat> = {}
    data.participants.forEach(p => {
      if (p.country_code) {
        const codeA2 = p.country_code.trim().toUpperCase()
        const codeA3 = countries.alpha2ToAlpha3(codeA2)
        if (!codeA3) return
        if (!countryCounts[codeA3]) {
          countryCounts[codeA3] = {
            code: codeA3,
            name: p.country || codeA3,
            count: 0,
          }
        }

        countryCounts[codeA3].count += 1
      }
    })
    const sorted = Object.values(countryCounts).sort((a, b) => b.count - a.count)
    setCountryStats(sorted)

    const filteredGeoData: FeatureCollection<Geometry> = {
      ...geoData,
      features: geoData.features.filter(
        (f: Feature) => f.properties?.name !== 'Antarctica',
      ),
    }

    const projection = d3.geoNaturalEarth1()
      .fitExtent(
        [
          [dimensions.width * 0.02, dimensions.height * 0.03],
          [dimensions.width * 0.98, dimensions.height * 0.97],
        ],
        filteredGeoData,
      )

    const pathGenerator = d3.geoPath().projection(projection)

    const maxCount = d3.max(Object.values(countryCounts), d => d.count) ?? 1
    const colorScale = d3.scaleSequential()
      .domain([1, maxCount])
      .interpolator(d3.interpolateRgbBasis([
        '#0c5946', // accent-900 — soft glow start
        '#0fb083', // accent-600
        '#3ee5b1', // accent-400
        '#a4f9d3', // accent-200 — bright peak
      ]))

    svg.append('g')
      .selectAll('path')
      .data(filteredGeoData.features)
      .enter()
      .append('path')
      .attr('d', d => pathGenerator(d)!)
      .attr('fill', d => {
        const countryId = d.id as string | undefined
        const count = countryId ? countryCounts[countryId]?.count ?? 0 : 0
        return count > 0 ? colorScale(count) : 'rgba(255,255,255,0.04)'
      })
      .attr('stroke', 'rgba(255,255,255,0.08)')
      .attr('stroke-width', 0.5)
      .style('cursor', 'pointer')
      .style('transition', 'fill 200ms ease')
      .on('mouseenter', function (_, d) {
        const countryId = d.id as string | undefined
        const count = countryId ? countryCounts[countryId]?.count ?? 0 : 0
        const countryName = d.properties?.name ?? 'Unknown'

        d3.select(this).attr('stroke', '#3ee5b1').attr('stroke-width', 1.4)

        const [x, y] = pathGenerator.centroid(d)
        const g = svg.append('g').attr('id', 'tooltip').attr('pointer-events', 'none')

        const text = g.append('text')
          .attr('x', x)
          .attr('y', y - 20)
          .attr('text-anchor', 'middle')
          .attr('fill', '#f7f8fa')
          .attr('font-size', 13)
          .attr('font-weight', 600)
          .attr('font-family', "'Inter', sans-serif")
          .text(`${countryName} · ${count}`)

        const bbox = (text.node() as SVGTextElement).getBBox()
        const paddingX = 12
        const paddingY = 7

        g.insert('rect', 'text')
          .attr('x', bbox.x - paddingX)
          .attr('y', bbox.y - paddingY)
          .attr('width', bbox.width + paddingX * 2)
          .attr('height', bbox.height + paddingY * 2)
          .attr('rx', 8)
          .attr('fill', 'rgba(20, 26, 38, 0.95)')
          .attr('stroke', 'rgba(62, 229, 177, 0.4)')
          .attr('stroke-width', 1)
      })
      .on('mouseleave', function () {
        d3.select(this).attr('stroke', 'rgba(255,255,255,0.08)').attr('stroke-width', 0.5)
        svg.select('#tooltip').remove()
      })

  }, [geoData, dimensions, data])

  const handleRefresh = () => {
    refetch()
  }

  if (isLoading && !data) {
    return <LoadingScreen label="Loading Participant Map..." />
  }

  if (error && !data) {
    return <ErrorScreen error={error} onRetry={handleRefresh} />
  }

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-in">
      <section className="surface p-4 sm:p-5 md:p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-5 gap-4">
          <div>
            <h2 className="section-title">Global Node Distribution</h2>
            <p className="section-subtitle mt-1 flex items-center gap-2">
              <span className="live-dot" aria-hidden />
              <span>Real-time geographic monitoring of active nodes</span>
            </p>
          </div>

          <div className="flex items-center gap-5 text-sm">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent-400 shadow-[0_0_8px_rgba(62,229,177,0.65)]" />
              <span className="font-semibold text-slate-200 tabular-nums">
                Active <span className="text-slate-500 font-medium ml-1">({data?.total_participant ?? 0})</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-white/[0.10]" />
              <span className="font-semibold text-slate-500">Offline</span>
            </div>
          </div>
        </div>

        <div
          ref={containerRef}
          className="w-full rounded-xl overflow-hidden relative border border-white/[0.06]"
          style={{
            height: dimensions.height || 450,
            background:
              'radial-gradient(ellipse at 50% 60%, rgba(20, 26, 38, 0.9) 0%, rgba(8, 11, 18, 0.95) 100%)',
          }}
        >
          {!geoData && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">
              Loading map…
            </div>
          )}

          <svg ref={svgRef} width={dimensions.width || '100%'} height={dimensions.height || 450} className="block" />
        </div>
      </section>

      <section className="surface p-4 sm:p-5 md:p-6">
        <div className="mb-4">
          <h3 className="section-title">Countries &amp; Regions</h3>
          <p className="section-subtitle mt-1">Distribution of nodes by country</p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.02]">
              <tr className="border-b border-white/[0.06]">
                <th className="px-4 py-3 text-left text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] w-[60%]">Region</th>
                <th className="px-4 py-3 text-right text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] w-[40%]">Count</th>
              </tr>
            </thead>

            <tbody>
              {countryStats.map((c) => (
                <tr key={c.code} className="group border-t border-white/[0.05] hover:bg-white/[0.03] transition-colors duration-150">
                  <td className="px-4 py-3.5 font-medium text-slate-100 w-[60%] border-l-[2px] border-l-transparent group-hover:border-l-accent-400/40">
                    {c.name}
                  </td>
                  <td className="px-4 py-3.5 text-right font-semibold text-slate-50 w-[40%] tabular-nums">
                    <span className="inline-flex items-center justify-center min-w-[64px] px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.06] text-[13px] font-semibold text-slate-100">
                      {c.count.toLocaleString()}
                    </span>
                  </td>
                </tr>
              ))}

              {countryStats.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-8 text-center text-slate-500 text-sm">
                    No data
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}