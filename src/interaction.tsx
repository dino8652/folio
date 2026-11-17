import { useEffect, useState } from 'react'
import { Waves, Pause, Volume2, VolumeX } from 'lucide-react'

/** Feedback is delegated so imported rows, dialogs and keyboard clicks share the same feel. */
export function InteractionControl() {
  const [quiet, setQuiet] = useState(() => localStorage.getItem('folio-quiet-motion') === 'true')
  useEffect(() => {
    document.documentElement.dataset.motion = quiet ? 'quiet' : 'full'
    localStorage.setItem('folio-quiet-motion', String(quiet))
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    const animations = new Set<Animation>()
    function feedback(event: MouseEvent) {
      if (quiet || reduced.matches || !(event.target instanceof Element)) return
      const control = event.target.closest<HTMLElement>('button, a.nav-link')
      if (!control || control.matches(':disabled') || control.closest('.plot-points')) return
      control.getAnimations().forEach(animation => animation.cancel())
      control.querySelectorAll('.press-wave').forEach(node => node.remove())
      const wave = document.createElement('span')
      wave.className = 'press-wave'
      wave.setAttribute('aria-hidden', 'true')
      const bounds = control.getBoundingClientRect()
      const diameter = Math.max(bounds.width, bounds.height) * 2
      wave.style.width = wave.style.height = `${diameter}px`
      wave.style.left = `${(event.detail ? event.clientX - bounds.left : bounds.width / 2) - diameter / 2}px`
      wave.style.top = `${(event.detail ? event.clientY - bounds.top : bounds.height / 2) - diameter / 2}px`
      control.append(wave)
      const pulse = wave.animate([{ transform: 'scale(0)', opacity: .22 }, { transform: 'scale(1)', opacity: 0 }], { duration: 520, easing: 'cubic-bezier(.16,1,.3,1)' })
      animations.add(pulse)
      void pulse.finished.catch(() => {}).finally(() => { wave.remove(); animations.delete(pulse) })
      const animation = control.animate([
        { transform: 'scale(.95)' },
        { transform: 'scale(1.025)', offset: .55 },
        { transform: 'scale(1)' },
      ], { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' })
      animations.add(animation)
      void animation.finished.catch(() => {}).finally(() => animations.delete(animation))
      const icon = control.querySelector('svg')
      if (icon) {
        const flourish = icon.animate([{ transform: 'rotate(-12deg) scale(.8)' }, { transform: 'rotate(5deg) scale(1.15)', offset: .55 }, { transform: 'none' }], { duration: 460, easing: 'cubic-bezier(.2,.8,.2,1)' })
        animations.add(flourish)
        void flourish.finished.catch(() => {}).finally(() => animations.delete(flourish))
      }
    }
    const stop = () => { if (reduced.matches) animations.forEach(animation => animation.cancel()) }
    reduced.addEventListener('change', stop)
    document.addEventListener('click', feedback, true)
    return () => {
      document.removeEventListener('click', feedback, true)
      reduced.removeEventListener('change', stop)
      animations.forEach(animation => animation.cancel())
    }
  }, [quiet])
  return <button className="icon-button motion-control" onClick={() => setQuiet(value => !value)} aria-label="Reduce interface motion" aria-pressed={quiet} title={quiet ? 'Enable expressive motion' : 'Reduce interface motion'}>{quiet ? <Pause size={18} /> : <Waves size={19} />}</button>
}

/** Synthesize the click locally. A trusted click starts browser audio playback. */
export function SoundControl() {
  const [muted, setMuted] = useState(() => localStorage.getItem('folio-muted') === 'true')
  useEffect(() => {
    localStorage.setItem('folio-muted', String(muted))
    if (muted) return
    let context: AudioContext | undefined
    function click(event: MouseEvent) {
      if (!event.isTrusted || !(event.target instanceof Element) || !event.target.closest('button:not(:disabled), a.quiet, a.nav-link, summary')) return
      try {
        context ??= new AudioContext()
        void context.resume().catch(() => {})
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        const start = context.currentTime
        oscillator.frequency.setValueAtTime(690, start)
        oscillator.frequency.exponentialRampToValueAtTime(410, start + .045)
        gain.gain.setValueAtTime(.055, start)
        gain.gain.exponentialRampToValueAtTime(.001, start + .06)
        oscillator.connect(gain).connect(context.destination)
        oscillator.start()
        oscillator.stop(start + .065)
      } catch { /* Audio is optional when the browser disallows playback. */ }
    }
    document.addEventListener('click', click, true)
    return () => {
      document.removeEventListener('click', click, true)
      if (context) void context.close().catch(() => {})
    }
  }, [muted])
  return <button type="button" className="icon-button sound-control" onClick={() => setMuted(value => !value)} aria-label="Mute click sounds" aria-pressed={muted} title={muted ? 'Enable click sounds' : 'Mute click sounds'}>{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}</button>
}
