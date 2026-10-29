import { useEffect, useRef, useState } from "react"

const MAX_BYTES = 1024 * 1024 // 1 MB
const ACCEPTED_TYPES = ["image/png", "image/jpeg"]

// Crop fully transparent margins off a canvas and return a PNG data URL.
function canvasToTrimmedPng(canvas) {
  const context = canvas.getContext("2d", { willReadFrequently: true })
  const { width, height } = canvas
  const pixels = context.getImageData(0, 0, width, height).data
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] > 10) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null // nothing drawn
  const pad = 6
  minX = Math.max(0, minX - pad)
  minY = Math.max(0, minY - pad)
  maxX = Math.min(width - 1, maxX + pad)
  maxY = Math.min(height - 1, maxY + pad)
  const trimmed = document.createElement("canvas")
  trimmed.width = maxX - minX + 1
  trimmed.height = maxY - minY + 1
  trimmed.getContext("2d").drawImage(canvas, minX, minY, trimmed.width, trimmed.height, 0, 0, trimmed.width, trimmed.height)
  return trimmed.toDataURL("image/png")
}

/**
 * Signature capture for the NSRP Certification step: draw on a canvas
 * (mouse + touch) or upload a PNG/JPG image (max 1 MB). Drawn signatures are
 * exported as transparent, margin-trimmed PNG data URLs.
 */
export default function NsrpSignatureInput({ value, onChange, error }) {
  const canvasRef = useRef(null)
  const strokesRef = useRef([])
  const drawingRef = useRef(false)
  const [mode, setMode] = useState("draw") // 'draw' | 'upload'
  const [localError, setLocalError] = useState("")
  const [isEmpty, setIsEmpty] = useState(true)

  const redraw = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext("2d", { willReadFrequently: true })
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.lineWidth = 2.5
    context.lineCap = "round"
    context.lineJoin = "round"
    context.strokeStyle = "#0f172a"
    for (const stroke of strokesRef.current) {
      if (stroke.length < 2) continue
      context.beginPath()
      context.moveTo(stroke[0].x, stroke[0].y)
      for (const point of stroke.slice(1)) context.lineTo(point.x, point.y)
      context.stroke()
    }
    setIsEmpty(strokesRef.current.length === 0)
  }

  useEffect(() => {
    redraw()
  }, [mode])

  const canvasPoint = (event) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvasRef.current.width,
      y: ((event.clientY - rect.top) / rect.height) * canvasRef.current.height,
    }
  }

  const startStroke = (event) => {
    event.preventDefault()
    drawingRef.current = true
    strokesRef.current.push([canvasPoint(event)])
    redraw()
  }
  const extendStroke = (event) => {
    if (!drawingRef.current) return
    event.preventDefault()
    strokesRef.current[strokesRef.current.length - 1].push(canvasPoint(event))
    redraw()
  }
  const endStroke = () => {
    if (!drawingRef.current) return
    drawingRef.current = false
    const dataUrl = canvasToTrimmedPng(canvasRef.current)
    if (dataUrl) {
      setLocalError("")
      onChange?.(dataUrl)
    }
  }

  const clearCanvas = () => {
    strokesRef.current = []
    redraw()
    onChange?.(null)
  }
  const undoStroke = () => {
    strokesRef.current.pop()
    redraw()
    const dataUrl = strokesRef.current.length ? canvasToTrimmedPng(canvasRef.current) : null
    onChange?.(dataUrl)
  }

  const handleUpload = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setLocalError("Upload a PNG or JPG image.")
      return
    }
    if (file.size > MAX_BYTES) {
      setLocalError("The signature image must be 1 MB or smaller.")
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setLocalError("")
      onChange?.(reader.result)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div>
      <div className="mb-2 flex gap-2">
        {[["draw", "Draw signature"], ["upload", "Upload image"]].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            aria-pressed={mode === key}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${mode === key ? "bg-cyan-500 text-slate-950" : "border border-slate-300 bg-white text-slate-700"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "draw" ? (
        <div>
          <canvas
            ref={canvasRef}
            width={640}
            height={200}
            aria-label="Signature pad. Draw your signature with the mouse or your finger."
            className="h-40 w-full touch-none rounded-xl border border-slate-300 bg-white"
            onPointerDown={startStroke}
            onPointerMove={extendStroke}
            onPointerUp={endStroke}
            onPointerLeave={endStroke}
          />
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={undoStroke} disabled={isEmpty} className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40">
              Undo
            </button>
            <button type="button" onClick={clearCanvas} disabled={isEmpty && !value} className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40">
              Clear
            </button>
          </div>
        </div>
      ) : (
        <div>
          <input
            type="file"
            accept="image/png,image/jpeg"
            onChange={handleUpload}
            aria-label="Upload signature image (PNG or JPG, max 1 MB)"
            className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-black file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-500 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-950"
          />
          <p className="mt-1 text-[11px] text-slate-500">PNG or JPG, max 1 MB. Use a photo of your signature on white paper.</p>
        </div>
      )}

      {value && (
        <div className="mt-3">
          <p className="text-xs font-medium text-slate-700">Current signature</p>
          <div className="mt-1 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2">
            <img src={value} alt="Your signature" className="h-16 max-w-full object-contain" />
            <button type="button" onClick={() => { strokesRef.current = []; redraw(); onChange?.(null) }} className="rounded-lg border border-rose-300 bg-white px-3 py-1 text-xs font-semibold text-rose-700">
              Remove
            </button>
          </div>
        </div>
      )}

      {(localError || error) && (
        <p role="alert" className="mt-1 text-xs text-rose-600">{localError || error}</p>
      )}
    </div>
  )
}
