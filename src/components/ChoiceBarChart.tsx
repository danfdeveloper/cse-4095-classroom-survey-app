import { useEffect, useRef, useState } from 'react'
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatPercent, type ChoiceResult } from '../lib/results.ts'

// Single series → one validated color (slot 1, passes contrast vs white); no legend.
const BAR_COLOR = '#2a78d6'
const TEXT_PRIMARY = '#0f172a' // slate-900
const TEXT_SECONDARY = '#475569' // slate-600
const BAR_THICKNESS = 24
const ROW_HEIGHT = 60 // choice name above + bar + gap
const VALUE_GUTTER = 112 // room at the bar tip for "123 · 100.0%"

interface Row {
  name: string
  count: number
  percentage: number
}

const rowLabel = (r: Row) => `${r.count} · ${formatPercent(r.percentage)}`

/** Choice name drawn above its bar across the full chart width; "…" if it still doesn't fit. */
function NameLabel(props: {
  x?: number | string
  y?: number | string
  value?: unknown
  chartWidth: number
}) {
  const x = Number(props.x ?? 0)
  const y = Number(props.y ?? 0)
  const text = String(props.value ?? '')
  const maxChars = Math.max(12, Math.floor(props.chartWidth / 8.5))
  const shown = text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text
  return (
    <text x={x} y={y - 8} fill={TEXT_PRIMARY} fontSize={15} fontWeight={500}>
      {shown !== text && <title>{text}</title>}
      {shown}
    </text>
  )
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  const row = active ? payload?.[0]?.payload : undefined
  if (!row) return null
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-md">
      <p className="text-base font-semibold text-slate-900">
        {row.count} {row.count === 1 ? 'response' : 'responses'} · {formatPercent(row.percentage)}
      </p>
      <p className="text-slate-600">{row.name}</p>
    </div>
  )
}

/** Horizontal bars for one question. Every bar shows its count and percentage (UI.md §9). */
export default function ChoiceBarChart({
  choices,
  label,
}: {
  choices: ChoiceResult[]
  label: string
}) {
  const data: Row[] = choices.map((c) => ({
    name: c.choice_text,
    count: c.count,
    percentage: c.percentage,
  }))
  const max = Math.max(1, ...data.map((d) => d.count))
  const summary = data.map((d) => `${d.name}: ${rowLabel(d)}`).join('; ')

  // Track the rendered width so choice names can use the whole row.
  const ref = useRef<HTMLElement>(null)
  const [width, setWidth] = useState(320)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <figure ref={ref} className="w-full">
      <figcaption className="sr-only">{`${label}. ${summary}`}</figcaption>
      <ResponsiveContainer width="100%" height={data.length * ROW_HEIGHT + 8}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 22, right: VALUE_GUTTER, bottom: 0, left: 0 }}
          barCategoryGap={ROW_HEIGHT - BAR_THICKNESS - 22}
        >
          <XAxis type="number" domain={[0, max]} hide />
          <YAxis type="category" dataKey="name" hide />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ fill: '#f1f5f9' }}
            isAnimationActive={false}
          />
          <Bar
            dataKey="count"
            fill={BAR_COLOR}
            barSize={BAR_THICKNESS}
            radius={[0, 4, 4, 0]}
            minPointSize={2}
            isAnimationActive={false}
          >
            <LabelList dataKey="name" content={<NameLabel chartWidth={width} />} />
            <LabelList
              dataKey="count"
              content={(p) => {
                const i = Number((p as { index?: number }).index)
                const x = Number(p.x) + Number(p.width) + 10
                const y = Number(p.y) + Number(p.height) / 2
                return (
                  <text x={x} y={y} dominantBaseline="central" fill={TEXT_PRIMARY} fontSize={15}>
                    <tspan fontWeight={600}>{data[i]?.count}</tspan>
                    <tspan fill={TEXT_SECONDARY}>
                      {' '}
                      · {formatPercent(data[i]?.percentage ?? 0)}
                    </tspan>
                  </text>
                )
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </figure>
  )
}
