// Adapted for Folio from Unlumen UI's Count Up and Kbd.
// https://unlumen-ui-docs.vercel.app/docs/ui
import { useEffect, useRef, type ComponentPropsWithoutRef } from 'react'
import { animate, useInView, useReducedMotion } from 'motion/react'

export function CountUp({ to, format }: { to: number; format: (value: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true })
  const reduced = useReducedMotion()

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (reduced || document.documentElement.dataset.motion === 'quiet') { node.textContent = format(to); return }
    if (!isInView) return
    const controls = animate(0, to, {
      duration: .85, ease: [.16, 1, .3, 1],
      onUpdate: value => { node.textContent = format(Math.round(value)) },
      onComplete: () => { node.textContent = format(to) },
    })
    const observer = new MutationObserver(() => {
      if (document.documentElement.dataset.motion === 'quiet') { controls.stop(); node.textContent = format(to) }
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] })
    return () => { controls.stop(); observer.disconnect() }
  }, [format, isInView, reduced, to])

  return <span ref={ref} aria-hidden="true">{format(to)}</span>
}

export function Kbd({ children, ...props }: ComponentPropsWithoutRef<'kbd'>) {
  return <kbd className="unlumen-key" {...props}>{children}</kbd>
}
