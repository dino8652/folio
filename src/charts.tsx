import { CountUp } from './unlumen/primitives.tsx'
import { useCallback, useState } from 'react'
import { dateText, monthOffset, spendingByCategory, totals, currencyText, type Currency, type Transaction } from './ledger.ts'

const palette = ['#333d32', '#a9c15d', '#bcb4df', '#dd9d72', '#729992', '#bdab69', '#81889b', '#9da48e']

export function Count({ cents, currency }: { cents: number; currency: Currency }) {
  const format = useCallback((value: number) => currencyText(value, currency), [currency])
  return <><CountUp to={cents} format={format} /><span className="sr-only">{format(cents)}</span></>
}

function bucketsFor(rows: Transaction[], month: string, count: number) {
  if (count !== 1) {
    return Array.from({ length: count }, (_, i) => {
      const key = monthOffset(month, i - count + 1)
      return { label: dateText(key, { month: 'short' }), name: dateText(key, { month: 'long', year: 'numeric' }), observed: rows.some(r => r.date.startsWith(key)), ...totals(rows.filter(r => r.date.startsWith(key))) }
    }).filter(bucket => bucket.observed)
  }
  const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate()
  return Array.from({ length: Math.ceil(days / 7) }, (_, i) => {
    const start = 1 + i * 7
    const last = Math.min(start + 6, days)
    const day = String(start).padStart(2, '0')
    return { label: dateText(month + '-' + day, { month: 'short', day: 'numeric' }),
      name: `${dateText(month, { month: 'long' })} ${start}–${last}`,
      ...totals(rows.filter(r => r.date.startsWith(month) && Number(r.date.slice(8)) >= start && Number(r.date.slice(8)) <= last)) }
  })
}

export function FlowChart({ rows, month, months, currency, context = false }: { rows: Transaction[]; month: string; months: number; currency: Currency; context?: boolean }) {
  const [point, setPoint] = useState<number | null>(null)
  const buckets = bucketsFor(rows, month, months)
  const max = Math.max(200, ...buckets.flatMap(bucket => [bucket.moneyIn, bucket.spending]))
  const exponent = 10 ** Math.floor(Math.log10(max))
  const step = [.25, .5, 1, 1.25, 2, 2.5, 5, 10].map(n => n * exponent).find(n => n * 3 >= max) ?? exponent * 10
  const y = (cents: number) => 143 - 129 * cents / (step * 3)
  const selected = point === null ? null : buckets[point]
  return <section className="panel flow-panel" aria-labelledby="flow-heading">
    <div className="panel-heading"><div><h2 id="flow-heading">Cash flow</h2><p>{context ? 'Imported months only · missing months are not counted as zero' : 'Money in and out over time'}</p></div>
      </div>
    {rows.length ? <>
      <div className="chart-legend"><span><i className="legend-dot blue" /> Earned income</span><span><i className="legend-dot" style={{ background: '#a896c2' }} /> Other deposits</span><span><i className="legend-dot amber" /> Spending</span></div>
      <div className="plot">
        <div className="plot-axis" aria-hidden="true">{[3, 2, 1, 0].map(n => <span key={n}>{Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n * step / 100)}</span>)}</div>
        <div className="plot-main">
          <svg className="plot-grid" viewBox="0 0 100 158" preserveAspectRatio="none" aria-hidden="true">
            {[0, 1, 2, 3].map(n => <line key={n} x1="0" x2="100" y1={y(step * n)} y2={y(step * n)} vectorEffect="non-scaling-stroke" />)}
          </svg>
          <svg className="plot-bars" viewBox={`0 0 ${buckets.length * 100} 158`} preserveAspectRatio="none" aria-hidden="true">
            {buckets.map((bucket, i) => <g key={bucket.name} style={{ animationDelay: `${i * 55}ms` }} className={point !== null && i !== point ? 'bar-muted' : ''}>
              <rect x={i * 100 + 22} y={y(bucket.income)} width="25" height={143 - y(bucket.income)} rx="5" fill="#c5df78" />
              {bucket.otherDeposits > 0 && <rect x={i * 100 + 22} y={y(bucket.moneyIn)} width="25" height={y(bucket.income) - y(bucket.moneyIn)} rx="3" fill="#a896c2" />}
              <rect x={i * 100 + 53} y={y(bucket.spending)} width="25" height={143 - y(bucket.spending)} rx="5" fill="#374338" />
            </g>)}
          </svg>
          <div className="plot-points" onMouseLeave={() => setPoint(null)}>
            {buckets.map((bucket, i) => <button key={bucket.name} onMouseEnter={() => setPoint(i)} onFocus={() => setPoint(i)} onBlur={() => setPoint(null)}
              onClick={() => setPoint(i)} aria-label={`${bucket.name}, earned income ${currencyText(bucket.income, currency)}, other deposits ${currencyText(bucket.otherDeposits, currency)}, spending ${currencyText(bucket.spending, currency)}`}>
              <span>{bucket.label}</span>
            </button>)}
          </div>
          {selected && <div className="plot-tooltip" aria-hidden="true"><strong>{selected.name}</strong><span>Earned income {currencyText(selected.income, currency)}</span><span>Other deposits {currencyText(selected.otherDeposits, currency)}</span><span>Spending {currencyText(selected.spending, currency)}</span></div>}
        </div>
      </div>
    </> : <div className="chart-empty">Cash flow will appear when you import transactions for this period.</div>}
  </section>
}

export function SpendingChart({ rows, currency, onCategory, expanded }: { rows: Transaction[]; currency: Currency; onCategory: (category: string) => void; expanded?: boolean }) {
  const all = spendingByCategory(rows)
  const sum = all.reduce((total, entry) => total + entry.cents, 0)
  const items = !expanded && all.length > 5 ? [...all.slice(0, 4), { category: 'Other spending', cents: all.slice(4).reduce((total, entry) => total + entry.cents, 0) }] : all
  return <section className="panel spending-panel" aria-labelledby="spend-heading">
    <div className="panel-heading"><div><h2 id="spend-heading">Where you spent</h2><p>Spending by category · click to see transactions</p></div></div>
    {sum > 0 ? <div className="breakdown">
      <div className="category-key sector-chart">{items.map(({ category, cents }, i) =>
        <button key={category} onClick={() => onCategory(category === 'Other spending' ? '' : category)} title={currencyText(cents, currency)}>
          <i className="legend-dot" style={{ backgroundColor: palette[i % palette.length] }} /><span>{category === 'Other' ? 'Uncategorized · review' : category}</span><strong>{currencyText(cents, currency)}</strong><span className="sector-track" aria-hidden="true"><span style={{width:`${cents / sum * 100}%`,backgroundColor:palette[i % palette.length]}} /></span><small>{(cents / sum * 100).toFixed(1)}% of spending</small>
        </button>)}</div>
    </div> : <div className="chart-empty">No expenses in this period.</div>}
  </section>
}

export function Metrics({ rows, currency, showNet = false }: { rows: Transaction[]; currency: Currency; showNet?: boolean }) {
  const { income, spending, otherDeposits, net } = totals(rows)
  const movement = showNet ? net : spending
  return <div className="metrics">
    <div className="metric"><div><span>Earned income</span><strong><Count key={income} cents={income} currency={currency} /></strong></div></div>
    <div className="metric"><div><span>{showNet ? 'Net cash flow' : 'Spending'}</span><strong><Count key={movement} cents={movement} currency={currency} /></strong></div></div>
    <div className="metric"><div><span>Other deposits</span><strong><Count key={otherDeposits} cents={otherDeposits} currency={currency} /></strong></div></div>
  </div>
}
