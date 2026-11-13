import { useEffect, useRef, useState } from "react"
import DeclaredDocumentFields from './DeclaredDocumentFields'
import { IMAGE_LIMITS } from '../../shared/documentImage.js'
import { PHILIPPINE_ID_TYPES } from '../../shared/philippineIds.js'

export const ID_TYPE_OPTIONS = PHILIPPINE_ID_TYPES

const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB per file (matches server)
const COMPRESS_ABOVE_BYTES = 1.5 * 1024 * 1024 // compress images larger than this
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "application/pdf"]

// Compress large images client-side via canvas before upload (PDFs pass through untouched)
async function compressImageIfNeeded(file) {
  if (file.type === "application/pdf" || file.size <= COMPRESS_ABOVE_BYTES) return file
  try {
    const bitmap = await createImageBitmap(file)
    const maxDim = 2000
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" })
  } catch {
    return file
  }
}

const labelCls = "block text-sm font-semibold text-[var(--peso-ink)]"
const helperCls = "mt-1 text-xs text-[var(--peso-muted)]"
const selectCls = "shared-form-control w-full rounded-[10px] border border-[var(--peso-line-strong)] bg-[var(--peso-canvas)] px-3 py-2.5 text-sm text-[var(--peso-ink)]"

function FileField({ label, hint, required, file, error, onSelect, onRemove, disabled }) {
  const inputRef = useRef(null)
  const [previewUrl, setPreviewUrl] = useState(null)

  useEffect(() => {
    if (file && file.type !== "application/pdf") {
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
      return () => URL.revokeObjectURL(url)
    }
    setPreviewUrl(null)
    return undefined
  }, [file])

  return (
    <div>
      <span className={labelCls}>
        {label} {required && <span className="text-rose-600">*</span>}
      </span>
      {hint && <p className={helperCls}>{hint}</p>}

      {file ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-3 rounded-[10px] border border-[var(--peso-line-strong)] bg-white p-3">
          {previewUrl ? (
            <img src={previewUrl} alt={`${label} preview`} className="h-16 w-16 shrink-0 rounded-lg border border-[var(--peso-line-strong)] object-cover" />
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-[var(--peso-line-strong)] bg-[var(--peso-canvas)] text-xs font-bold text-[var(--peso-body)]">PDF</span>
          )}
          <div className="min-w-0 flex-1" style={{ minWidth: '120px' }}>
            <p className="truncate text-sm text-[var(--peso-ink)]">{file.name}</p>
            <p className="text-xs text-[var(--peso-muted)]">{Math.ceil(file.size / 1024)} KB</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()} className="rounded-lg border border-[var(--peso-line-strong)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--peso-body)]">
              Replace
            </button>
            <button type="button" disabled={disabled} onClick={onRemove} className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600">
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="mt-1.5 w-full rounded-[10px] border border-dashed border-[var(--peso-line-strong)] bg-[var(--peso-canvas)] px-3 py-4 text-sm text-[var(--peso-muted)] hover:border-[var(--peso-primary)] hover:text-[var(--peso-body)]"
        >
          Tap to upload or take a photo
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const selected = e.target.files?.[0] || null
          e.target.value = ""
          onSelect(selected)
        }}
      />
      {error && <p className="mt-1 text-xs font-medium text-rose-600">{error}</p>}
    </div>
  )
}

function validateFile(file) {
  if (!file) return null
  if (!ACCEPTED_TYPES.includes(file.type)) return "Only JPG, PNG, or PDF files are accepted."
  if (file.size > MAX_FILE_BYTES) return `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 5 MB.`
  return null
}

// Birth certificate and ID front are required; ID type is optional metadata.
export function validateVerificationDocs(docs) {
  if (!docs.birthCertificate) return false
  if (!docs.id1.front) return false
  const id2Used = docs.id2.type || docs.id2.front || docs.id2.back
  if (id2Used && !docs.id2.front) return false
  return true
}

export const emptyVerificationDocs = {
  birthCertificate: null,
  id1: { type: "", front: null, back: null },
  id2: { type: "", front: null, back: null },
}

export default function VerificationDocumentsForm({ docs, setDocs, disabled, fieldErrors = {} }) {
  const [errors, setErrors] = useState({})
  const [qualityChoice, setQualityChoice] = useState(null)
  const [showOptionalId, setShowOptionalId] = useState(false)
  const optionalIdVisible = showOptionalId || Boolean(docs.id2.type || docs.id2.front || docs.id2.back)
  const acceptFile = async (path, file) => {
    const processed = await compressImageIfNeeded(file)
    setDocs(current => path.length === 1 ? { ...current, [path[0]]: processed } : { ...current, [path[0]]: { ...current[path[0]], [path[1]]: processed } })
    setQualityChoice(null)
  }

  const setFile = async (path, file) => {
    if (!file) {
      setDocs((current) => {
        const next = { ...current }
        if (path.length === 1) next[path[0]] = null
        else next[path[0]] = { ...next[path[0]], [path[1]]: null }
        return next
      })
      return
    }
    const validationError = validateFile(file)
    const errorKey = path.join(".")
    setErrors((current) => ({ ...current, [errorKey]: validationError || undefined }))
    if (validationError) return
    if (file.type !== 'application/pdf' && typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(file)
        if (Math.max(bitmap.width, bitmap.height) < IMAGE_LIMITS.minWidth || Math.min(bitmap.width, bitmap.height) < IMAGE_LIMITS.minHeight) { bitmap.close(); setErrors(current => ({ ...current, [errorKey]: 'Use an image at least 600 × 380 pixels.' })); return }
        const canvas = document.createElement('canvas'); canvas.width = 120; canvas.height = 80
        const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0, 120, 80); bitmap.close()
        const pixels = context.getImageData(0, 0, 120, 80).data
        let sum = 0; for (let i = 0; i < pixels.length; i += 4) sum += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3
        const mean = sum / (pixels.length / 4)
        if (mean < IMAGE_LIMITS.darkMean || mean > IMAGE_LIMITS.glareMean) { setQualityChoice({ path, file }); return }
      } catch { /* Server checks always enforce quality when browser decoding is unavailable. */ }
    }
    await acceptFile(path, file)
  }

  const id2Options = ID_TYPE_OPTIONS
  const helperText = "Upload clear, uncropped photos or scans (JPG, PNG, or PDF, max 5 MB each). The name on your ID is compared with your NSRP. ID type is optional."

  return (
    <fieldset className="space-y-4 rounded-[10px] border border-[var(--peso-line-strong)] bg-[var(--peso-canvas)] p-4">
      <legend className="px-2 text-sm font-semibold text-[var(--peso-ink)]">Verification documents</legend>
      <p className={helperCls}>{helperText}</p>
      <p className={helperCls}>Check your document before you upload: use good light, keep all edges visible, and make the text clear.</p>
      {qualityChoice && <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">This photo may be too dark or have glare. <button type="button" className="rounded border bg-white px-2 py-1" onClick={() => setQualityChoice(null)}>Retake</button> <button type="button" className="rounded border bg-white px-2 py-1" onClick={() => acceptFile(qualityChoice.path, qualityChoice.file)}>Use anyway</button></div>}
      <DeclaredDocumentFields docKey="birthCertificate" value={docs.birthDetails} onChange={value => setDocs(current => ({ ...current, birthDetails: value }))} disabled={disabled} />
      {fieldErrors.verificationDocuments && <p role="alert" className="text-xs font-medium text-rose-600">{fieldErrors.verificationDocuments}</p>}

      <FileField
        label="Birth Certificate"
        required
        file={docs.birthCertificate}
        error={errors["birthCertificate"] || fieldErrors.birthCertificate}
        disabled={disabled}
        onSelect={(file) => setFile(["birthCertificate"], file)}
        onRemove={() => setFile(["birthCertificate"], null)}
      />

      <div className="space-y-3 rounded-[10px] border border-[var(--peso-line-strong)] bg-white p-3">
        <p className={labelCls}>Valid ID #1 <span className="text-rose-600">*</span></p>
        {fieldErrors.validId1 && <p role="alert" className="text-xs text-rose-600">{fieldErrors.validId1}</p>}
        <select
          aria-label="Valid ID #1 type"
          value={docs.id1.type}
          disabled={disabled}
          onChange={(e) => setDocs((current) => ({ ...current, id1: { ...current.id1, type: e.target.value, number: '', expiry: '', format: '' } }))}
          className={selectCls}
        >
          <option value="">ID type</option>
          {ID_TYPE_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <FileField
          label="Front of ID"
          required
          file={docs.id1.front}
          error={errors["id1.front"] || fieldErrors.validId1}
          disabled={disabled}
          onSelect={(file) => setFile(["id1", "front"], file)}
          onRemove={() => setFile(["id1", "front"], null)}
        />
        <FileField
          label="Back of ID"
          file={docs.id1.back}
          error={errors["id1.back"]}
          disabled={disabled}
          onSelect={(file) => setFile(["id1", "back"], file)}
          onRemove={() => setFile(["id1", "back"], null)}
        />
      </div>

      {!optionalIdVisible && <button type="button" disabled={disabled} onClick={() => setShowOptionalId(true)} aria-expanded={false} aria-controls="optional-verification-id" className="rounded-lg border border-[var(--peso-line-strong)] bg-white px-4 py-2 text-sm font-semibold text-[var(--peso-body)]">Add ID (optional)</button>}
      {optionalIdVisible && <div id="optional-verification-id" className="space-y-3 rounded-[10px] border border-[var(--peso-line-strong)] bg-white p-3">
        <div className="flex items-center justify-between gap-3"><p className={labelCls}>Valid ID #2 <span className="text-xs font-normal text-[var(--peso-muted)]">(optional)</span></p><button type="button" disabled={disabled} onClick={() => {
          setDocs(current => ({ ...current, id2: { ...emptyVerificationDocs.id2 } }))
          setErrors(current => ({ ...current, 'id2.front': undefined, 'id2.back': undefined }))
          setQualityChoice(current => current?.path[0] === 'id2' ? null : current)
          setShowOptionalId(false)
        }} className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600">Remove optional ID</button></div>
        {fieldErrors.validId2 && <p role="alert" className="text-xs text-rose-600">{fieldErrors.validId2}</p>}
        <select
          aria-label="Valid ID #2 type"
          value={docs.id2.type}
          disabled={disabled}
          onChange={(e) => setDocs((current) => ({ ...current, id2: { ...current.id2, type: e.target.value, number: '', expiry: '', format: '' } }))}
          className={selectCls}
        >
          <option value="">ID type</option>
          {id2Options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
          <>
            <FileField
              label="Front of ID"
              required
              file={docs.id2.front}
              error={errors["id2.front"]}
              disabled={disabled}
              onSelect={(file) => setFile(["id2", "front"], file)}
              onRemove={() => setFile(["id2", "front"], null)}
            />
            <FileField
              label="Back of ID"
              file={docs.id2.back}
              error={errors["id2.back"]}
              disabled={disabled}
              onSelect={(file) => setFile(["id2", "back"], file)}
              onRemove={() => setFile(["id2", "back"], null)}
            />
          </>
      </div>}

      {fieldErrors.validId2 && <p role="alert" className="text-xs font-medium text-rose-600">{fieldErrors.validId2}</p>}
    </fieldset>
  )
}
