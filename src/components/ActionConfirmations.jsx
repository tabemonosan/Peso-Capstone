import { useLayoutEffect, useRef, useState } from 'react'
import ConfirmDialog from './ConfirmDialog'
import { registerActionConfirmation } from '../utils/actionConfirmation'
import { ModalLayerContext } from '../hooks/useModalLayer'

export default function ActionConfirmations() {
  const [queue, setQueue] = useState([])
  const pending = useRef(new Set())
  useLayoutEffect(() => {
    const pendingItems = pending.current
    let mounted = true
    const unregister = registerActionConfirmation((description, signal) => new Promise(resolve => {
      if (signal?.aborted) { resolve(false); return }
      const layer = Math.max(0, ...[...document.querySelectorAll('[data-modal-layer]')].map(element => Number(element.dataset.modalLayer) || 0))
      const item = { description, layer, resolve: value => {
        if (!pendingItems.delete(item)) return
        signal?.removeEventListener('abort', abort)
        resolve(value)
        if (mounted) setQueue(current => current.filter(entry => entry !== item))
      } }
      const abort = () => item.resolve(false)
      pendingItems.add(item)
      signal?.addEventListener('abort', abort, { once: true })
      setQueue(current => [...current, item])
    }))
    return () => { mounted = false; unregister(); for (const item of [...pendingItems]) item.resolve(false) }
  }, [])
  const current = queue[0]
  return current ? <ModalLayerContext.Provider value={current.layer}><ConfirmDialog {...current.description} automatic onConfirm={() => current.resolve(true)} onCancel={() => current.resolve(false)} /></ModalLayerContext.Provider> : null
}
