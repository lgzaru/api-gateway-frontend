import { useEffect, useRef } from 'react'

const IDLE_EVENTS = ['mousemove', 'keydown', 'click', 'touchstart'] as const

export function useIdleTimer(
  active: boolean,
  onExpire: () => void,
  seconds = 30 * 60,
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!active) {
      if (timer.current) clearTimeout(timer.current)
      return
    }

    const reset = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(onExpire, seconds * 1000)
    }

    reset()
    IDLE_EVENTS.forEach(e => window.addEventListener(e, reset))
    return () => {
      if (timer.current) clearTimeout(timer.current)
      IDLE_EVENTS.forEach(e => window.removeEventListener(e, reset))
    }
  }, [active, onExpire, seconds])
}
