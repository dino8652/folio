import { useState } from 'react'
import { currencyText, totals, dateText, type Ledger, type Transaction } from './ledger.ts'
export function FinanceStory({ledger, rows, month, onEdit}: {ledger: Ledger; rows: Transaction[]; month: string; onEdit: (row: Transaction) => void}) {
  const summary = totals(rows)
  const [details, setDetails] = useState(false)
  const balances = ledger.accounts.flatMap(account => {
    const doc = ledger.documents.filter(doc => doc.accountId === account.id && doc.balance?.end.startsWith(month)).sort((a,b) => b.balance!.end.localeCompare(a.balance!.end))[0]
    return doc?.balance ? [{account, balance: doc.balance}] : []
  })
  const expenses = rows.filter(row => row.cents < 0 && row.category !== 'Transfer').sort((a,b) => a.cents-b.cents)
  const amount = (cents: number) => currencyText(cents, ledger.currency)
  return <section className="finance-story">
    <div className="finance-headline"><div><span className="eyebrow">Your spending this period</span><h2 className="hero-value"><span aria-hidden="true">{amount(summary.spending)}</span><span className="sr-only">{amount(summary.spending)}</span></h2><p>{expenses.length} expenses · {summary.income ? `${amount(summary.income)} earned` : 'No earned income recorded'}</p></div>
    <div className="finance-remaining"><span>Money remaining</span>{balances.length ? balances.map(({account,balance}) => <div key={account.id}><strong>{amount(balance.closing)}</strong><p>{account.name} · statement balance on {dateText(balance.end)}</p><small>Started with {amount(balance.opening)}</small></div>) : <><strong>Not available</strong><p>Import a statement with a verified closing balance.</p></>}</div></div>
    <div className="finance-purchases"><div className="panel-heading"><div><h2>Your biggest expenses</h2><p>Actual transactions, largest first</p></div></div>{expenses.length ? expenses.slice(0,5).map(row => <button className="purchase-line" aria-label={`Open expense on ${dateText(row.date)} for ${amount(-row.cents)}`} key={row.id} onClick={() => onEdit(row)}><span><strong>{row.description}</strong><small>{dateText(row.date)}{row.category !== 'Other' ? ` · ${row.category}` : ''}</small></span><strong>{amount(-row.cents)}</strong></button>) : <p>No expenses recorded in this period.</p>}</div>
    <button className="quiet finance-detail-toggle" onClick={() => setDetails(!details)} aria-expanded={details}>{details ? 'Hide' : 'Show'} money in and out</button>
    {details && <div className="finance-details"><p>These totals describe imported activity, not your available bank balance.</p><dl><div><dt>Earned income</dt><dd>{amount(summary.income)}</dd></div><div><dt>Other credits</dt><dd>{amount(summary.otherDeposits)}</dd></div><div><dt>Spent</dt><dd>−{amount(summary.spending)}</dd></div><div><dt>Net change, excluding transfers</dt><dd>{amount(summary.net)}</dd></div></dl><p>Other credits are incoming transactions not identified as earnings. Open the transaction to check what a credit represents.</p></div>}
  </section>
}
