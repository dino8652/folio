export const MAX_CENTS = 100_000_000_000
export function integerCents(value: unknown, label = 'Amount'): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || Math.abs(value) > MAX_CENTS) throw new Error(`${label} must be a valid amount in whole cents.`)
}
function add(a: number, b: number) {
  const value = a + b
  if (!Number.isSafeInteger(value)) throw new Error('The total is too large to calculate accurately.')
  return value
}
export function totals(rows: { cents: number; category: string }[]) {
  let income = 0, otherDeposits = 0, spending = 0, transfersIn = 0, transfersOut = 0
  for (const row of rows) {
    integerCents(row.cents)
    if (row.category === 'Transfer') {
      if (row.cents > 0) transfersIn = add(transfersIn, row.cents)
      else transfersOut = add(transfersOut, -row.cents)
    } else if (row.cents > 0) {
      if (row.category === 'Income') income = add(income, row.cents)
      else otherDeposits = add(otherDeposits, row.cents)
    } else spending = add(spending, -row.cents)
  }
  const moneyIn = add(income, otherDeposits)
  const net = add(moneyIn, -spending)
  return { income, otherDeposits, moneyIn, spending, transfersIn, transfersOut, net }
}
export function reconcile(opening: number, closing: number, rows: {cents: number}[]) {
  integerCents(opening, 'Opening balance'); integerCents(closing, 'Closing balance')
  const movement = rows.reduce((sum, row) => { integerCents(row.cents); return add(sum, row.cents) }, 0)
  const calculated = add(opening, movement)
  return { opening, closing, movement, calculated, difference: add(closing, -calculated), reconciled: calculated === closing }
}
