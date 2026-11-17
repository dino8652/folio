import { useState } from 'react'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { dateText } from './ledger.ts'
import { Modal } from './ui.tsx'

export function MonthPicker({ month, today, onChange }: { month: string; today: string; onChange: (month: string) => void }) {
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(Number(month.slice(0, 4)))
  function select(value: string) { onChange(value); setOpen(false) }

  return <>
    <button className="quiet month-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={() => { setYear(Number(month.slice(0, 4))); setOpen(true) }}>
      <CalendarDays size={17} /> {dateText(month, { month: 'short', year: 'numeric' })} <ChevronDown size={15} />
    </button>
    {open && <Modal title="Choose a month" onClose={() => setOpen(false)}>
      <div className="month-year">
        <button className="icon-button" aria-label="Previous year" disabled={year <= 1900} onClick={() => setYear(year - 1)}><ChevronLeft size={18} /></button>
        <label><span className="sr-only">Year</span><select value={year} onChange={event => setYear(Number(event.target.value))}>
          {Array.from({ length: 300 }, (_, index) => 1900 + index).map(value => <option key={value}>{value}</option>)}
        </select></label>
        <button className="icon-button" aria-label="Next year" disabled={year >= 2199} onClick={() => setYear(year + 1)}><ChevronRight size={18} /></button>
      </div>
      <div className="month-grid">{Array.from({ length: 12 }, (_, index) => {
        const value = `${year}-${String(index + 1).padStart(2, '0')}`
        return <button key={value} className="quiet" aria-pressed={value === month} onClick={() => select(value)}>{dateText(value, { month: 'short' })}</button>
      })}</div>
      <div className="form-actions"><button className="quiet" data-tone="lime" onClick={() => select(today)}>This month</button></div>
    </Modal>}
  </>
}
