import { createContext, useContext, useEffect } from 'react'

export const ModalLayerContext = createContext(0)
const locks = new Set()
let originalOverflow = ''

export function useBodyScrollLock(enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const lock = Symbol('modal')
    if (!locks.size) originalOverflow = document.body.style.overflow
    locks.add(lock)
    document.body.style.overflow = 'hidden'
    return () => {
      locks.delete(lock)
      if (!locks.size) document.body.style.overflow = originalOverflow
    }
  }, [enabled])
}

export function useModalLayer() {
  const depth = useContext(ModalLayerContext) + 1
  useBodyScrollLock()
  return depth
}

export function isTopModal(dialog) {
  if (!dialog) return false
  const layers = [...document.querySelectorAll('[data-modal-layer]')]
  const top = layers.reduce((latest, element) => !latest || Number(element.dataset.modalLayer) >= Number(latest.dataset.modalLayer) ? element : latest, null)
  return top === dialog
}
