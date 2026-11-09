import { useEffect, useRef, useState } from 'react'

/** Marca o elemento como "visto" quando ele entra na tela (uma vez só). Sem animação para quem prefere menos movimento. */
export function useReveal<T extends HTMLElement>(threshold = 0.12) {
  const ref = useRef<T>(null)
  const [shown, setShown] = useState(() =>
    typeof IntersectionObserver === 'undefined' || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches))
  useEffect(() => {
    const element = ref.current
    if (shown || !element) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) { setShown(true); observer.disconnect() }
    }, { threshold, rootMargin: '0px 0px -6% 0px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [shown, threshold])
  return [ref, shown] as const
}
