import { useEffect, useRef, useState } from "react"

export const ID_TYPE_OPTIONS = [
  "SSS",
  "Passport",
  "PRC",
  "Pag-IBIG",
  "Voter's ID",
  "Philippine Postal ID",
  "UMID",
]

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

const labelCls = "block text-sm font-semibold text-[#071c35]"
const helperCls = "mt-1 text-xs text-[#5c7490]"
const selectCls = "w-full rounded-[10px] border border-[#c4d4e5] bg-[#f8fbfe] px-3 py-2.5 text-sm text-[#071c35]"

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
        {label} {required ? <span className="text-rose-600">*</span> : <span className="text-xs font-normal text-[#5c7490]">(optional)</span>}
      </span>
      {hint && <p className={helperCls}>{hint}</p>}

      {file ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-3 rounded-[10px] border border-[#c4d4e5] bg-white p-3">
          {previewUrl ? (
            <img src={previewUrl} alt={`${label} preview`} className="h-16 w-16 shrink-0 rounded-lg border border-[#c4d4e5] object-cover" />
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-[#c4d4e5] bg-[#f8fbfe] text-xs font-bold text-[#1b4265]">PDF</span>
          )}
          <div className="min-w-0 flex-1" style={{ minWidth: '120px' }}>
            <p className="truncate text-sm text-[#071c35]">{file.name}</p>
            <p className="text-xs text-[#5c7490]">{Math.ceil(file.size / 1024)} KB</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()} className="rounded-lg border border-[#c4d4e5] bg-white px-3 py-1.5 text-xs font-semibold text-[#1b4265]">
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
          className="mt-1.5 w-full rounded-[10px] border border-dashed border-[#c4d4e5] bg-[#f8fbfe] px-3 py-4 text-sm text-[#5c7490] hover:border-[#1b6ec2] hover:text-[#1b4265]"
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

// Required: nsrpForm, birthCertificate, id1.type + id1.front. Optional: id1.back, id2 (type+front required if used).
export function validateVerificationDocs(docs, consent) {
  if (!consent) return false
  if (!docs.nsrpForm || !docs.birthCertificate) return false
  if (!docs.id1.type || !docs.id1.front) return false
  const id2Used = docs.id2.type || docs.id2.front || docs.id2.back
  if (id2Used && (!docs.id2.type || !docs.id2.front)) return false
  if (docs.id1.type && docs.id2.type && docs.id1.type === docs.id2.type) return false
  return true
}

export const emptyVerificationDocs = {
  nsrpForm: null,
  birthCertificate: null,
  id1: { type: "", front: null, back: null },
  id2: { type: "", front: null, back: null },
}

export default function VerificationDocumentsForm({ docs, setDocs, consent, setConsent, disabled }) {
  const [errors, setErrors] = useState({})

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
    const processed = await compressImageIfNeeded(file)
    setDocs((current) => {
      const next = { ...current }
      if (path.length === 1) next[path[0]] = processed
      else next[path[0]] = { ...next[path[0]], [path[1]]: processed }
      return next
    })
  }

  const id1Type = docs.id1.type
  const id2Options = ID_TYPE_OPTIONS.filter((option) => option !== id1Type)
  const helperText = "Upload clear, uncropped photos or scans (JPG, PNG, or PDF, max 5 MB each). An admin will review your documents before you can browse jobs."

  return (
    <fieldset className="space-y-4 rounded-[10px] border border-[#c4d4e5] bg-[#f8fbfe] p-4">
      <legend className="px-2 text-sm font-semibold text-[#071c35]">Verification documents</legend>
      <p className={helperCls}>{helperText}</p>

      <FileField
        label="NSRP Registration Form"
        required
        file={docs.nsrpForm}
        error={errors["nsrpForm"]}
        disabled={disabled}
        onSelect={(file) => setFile(["nsrpForm"], file)}
        onRemove={() => setFile(["nsrpForm"], null)}
      />

      <FileField
        label="Birth Certificate"
        required
        file={docs.birthCertificate}
        error={errors["birthCertificate"]}
        disabled={disabled}
        onSelect={(file) => setFile(["birthCertificate"], file)}
        onRemove={() => setFile(["birthCertificate"], null)}
      />

      <div className="space-y-3 rounded-[10px] border border-[#c4d4e5] bg-white p-3">
        <p className={labelCls}>Valid ID #1 <span className="text-rose-600">*</span></p>
        <select
          value={docs.id1.type}
          disabled={disabled}
          onChange={(e) => setDocs((current) => ({ ...current, id1: { ...current.id1, type: e.target.value } }))}
          className={selectCls}
        >
          <option value="">Select ID type…</option>
          {ID_TYPE_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <FileField
          label="Front of ID"
          required
          file={docs.id1.front}
          error={errors["id1.front"]}
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

      <div className="space-y-3 rounded-[10px] border border-[#c4d4e5] bg-white p-3">
        <p className={labelCls}>Valid ID #2 <span className="text-xs font-normal text-[#5c7490]">(optional)</span></p>
        <select
          value={docs.id2.type}
          disabled={disabled}
          onChange={(e) => setDocs((current) => ({ ...current, id2: { ...current.id2, type: e.target.value } }))}
          className={selectCls}
        >
          <option value="">Select ID type…</option>
          {id2Options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        {id1Type && docs.id2.type === id1Type && (
          <p className="text-xs font-medium text-rose-600">Valid ID #2 must be a different ID type than ID #1.</p>
        )}
        {docs.id2.type && (
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
        )}
      </div>

      <label className="flex items-start gap-2 text-sm text-[#071c35]">
        <input
          type="checkbox"
          checked={consent}
          disabled={disabled}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1 accent-[#07833f]"
          required
        />
        <span>
          I agree to the collection and processing of my personal information and documents for account verification, in accordance with the Data Privacy Act of 2012 (RA 10173). <span className="text-rose-600">*</span>
        </span>
      </label>
    </fieldset>
  )
}
