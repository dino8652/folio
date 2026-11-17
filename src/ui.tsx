import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

export function Modal({ title, subtitle, onClose, children, wide = false, busy = false, fullscreen = false }: {
  title: string; subtitle?: string; onClose: () => void; children: ReactNode; wide?: boolean; busy?: boolean; fullscreen?: boolean
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const node = dialog.current
    if (!node) return
    node.showModal()
    return () => node.close()
  }, [])
  return <dialog ref={dialog} className={fullscreen ? 'modal transaction-fullscreen' : wide ? 'modal modal-wide' : 'modal'} aria-labelledby="modal-heading"
    onCancel={event => { event.preventDefault(); if (!busy) onClose() }}
    onClick={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <div className="modal-content">
      <div className="modal-heading"><div><h2 id="modal-heading">{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose} disabled={busy}><X size={20} /></button></div>
      {children}
    </div>
  </dialog>
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className="empty"><p>{children}</p>{action}</div>
}

export function ErrorText({ error, id }: { error: string; id?: string }) {
  return error ? <p className="error-text" id={id} role="alert">{error}</p> : null
}

export function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.'
}
