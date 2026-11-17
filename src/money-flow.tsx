import { ArrowRight } from 'lucide-react'
import { currencyText, spendingByCategory, totals, type Currency, type Transaction } from './ledger.ts'

export function MoneyFlow({ rows, currency, onCategory }: { rows: Transaction[]; currency: Currency; onCategory: (category: string) => void }) {
  const { income, otherDeposits, moneyIn, spending, net } = totals(rows)
  const categories = spendingByCategory(rows)
  const destinations = [
    ...categories.slice(0, 5).map(item => ({ ...item, label: item.category, color: '#9caa82' })),
    ...(categories.length > 5 ? [{ label: 'Other categories', cents: categories.slice(5).reduce((sum, item) => sum + item.cents, 0), color: '#b4a2ca' }] : []),
    ...(net > 0 ? [{ label: 'Net surplus', cents: net, color: '#374338' }] : []),
  ]
  const scale = Math.max(moneyIn, spending)
  const available = 175
  const gap = 6
  let offset = 0
  return <section className="panel money-flow" aria-labelledby="money-flow-heading">
    <div className="panel-heading"><div><h2 id="money-flow-heading">Money flow</h2><p>Deposits and spending in the selected period</p></div></div>
    {scale ? <div className="money-flow-layout">
      <div className="flow-sources"><span>Earned income<strong>{currencyText(income, currency)}</strong></span>
        {otherDeposits > 0 && <span>Other deposits<strong>{currencyText(otherDeposits, currency)}</strong></span>}
        {net < 0 && <span>Spending above deposits<strong>{currencyText(-net, currency)}</strong></span>}
      </div>
      <svg className="flow-ribbons" viewBox="0 0 360 240" preserveAspectRatio="none" aria-hidden="true">
        <rect x="0" y="24" width="7" height={available * income / scale} rx="3" fill="#80994b" />
        {otherDeposits > 0 && <rect x="0" y={24 + available * income / scale} width="7" height={available * otherDeposits / scale} rx="3" fill="#a896c2" />}
        {net < 0 && <rect x="0" y={24 + available * moneyIn / scale} width="7" height={available * -net / scale} rx="3" fill="#95545c" />}
        {destinations.map((item, index) => {
          const start = 24 + offset
          const end = start + index * gap
          const height = available * item.cents / scale
          offset += height
          return <g key={item.label}>
            <path d={`M7 ${start} C132 ${start} 222 ${end} 353 ${end} V${end + height} C222 ${end + height} 132 ${start + height} 7 ${start + height} Z`} fill={item.color} opacity=".58" />
            <rect x="353" y={end} width="7" height={height} rx="3" fill={item.color} />
          </g>
        })}
      </svg>
      <ul className="flow-destinations">{destinations.map(item => <li key={item.label}>
        {'category' in item ? <button type="button" onClick={() => onCategory(item.category as string)}><span>{item.label}</span><strong>{currencyText(item.cents, currency)}</strong><ArrowRight size={13} /></button>
          : <div><span>{item.label}</span><strong>{currencyText(item.cents, currency)}</strong></div>}
      </li>)}</ul>
    </div> : <div className="chart-empty">No income or spending in this period.</div>}
  </section>
}
