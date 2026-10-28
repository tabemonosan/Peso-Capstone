import { useEffect, useState } from "react"
import { Document, Page, pdfjs } from "react-pdf"

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString()

function useIsSmallScreen() {
  const [isSmall, setIsSmall] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches,
  )
  useEffect(() => {
    const query = window.matchMedia("(max-width: 768px)")
    const onChange = (event) => setIsSmall(event.matches)
    query.addEventListener("change", onChange)
    return () => query.removeEventListener("change", onChange)
  }, [])
  return isSmall
}

/**
 * In-app preview of the generated NSRP PDF.
 * Desktop: native PDF viewer in an <iframe> (blob URL).
 * Mobile (where iframes often can't render PDFs): pdf.js via react-pdf.
 */
export default function NsrpPdfPreview({ blob, blobUrl, loading, error, onRetry, downloadName = "NSRP-Form-1.pdf", viewerClassName = "min-h-[70vh]" }) {
  const isSmallScreen = useIsSmallScreen()
  const [pageCount, setPageCount] = useState(0)
  const [renderError, setRenderError] = useState("")

  useEffect(() => {
    setPageCount(0)
    setRenderError("")
  }, [blobUrl])

  if (loading) {
    return (
      <div className={`flex ${viewerClassName} w-full flex-col items-center justify-center gap-3 rounded-xl border border-slate-300 bg-slate-50`} role="status">
        <span className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-cyan-600" aria-hidden="true" />
        <p className="text-sm font-medium text-slate-600">Generating your NSRP preview…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`flex ${viewerClassName} w-full flex-col items-center justify-center gap-3 rounded-xl border border-rose-300 bg-rose-50 p-6 text-center`} role="alert">
        <p className="text-sm font-medium text-rose-700">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!blobUrl) {
    return (
      <p className={`flex ${viewerClassName} w-full items-center justify-center rounded-xl border border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600`}>
        Preview not generated. Return to the form and generate the PDF again.
      </p>
    )
  }

  return (
    <div>
      {isSmallScreen ? (
        <div className="max-h-[70vh] w-full overflow-y-auto rounded-xl border border-slate-300 bg-slate-100">
          {renderError ? (
            <div className="p-6 text-center text-sm text-slate-600">
              <p>{renderError}</p>
              <p className="mt-1">Use “Open in new tab” below to view the PDF instead.</p>
            </div>
          ) : (
            <Document
              file={blob}
              onLoadSuccess={({ numPages }) => setPageCount(numPages)}
              onLoadError={() => setRenderError("The preview could not be displayed on this device.")}
              loading={<p className="p-6 text-center text-sm text-slate-600">Rendering preview…</p>}
            >
              {Array.from({ length: pageCount }, (_, index) => (
                <Page
                  key={index + 1}
                  pageNumber={index + 1}
                  width={Math.min(window.innerWidth - 64, 768)}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  className="border-b border-slate-300 last:border-b-0"
                />
              ))}
            </Document>
          )}
        </div>
      ) : (
        <iframe
          src={blobUrl}
          title="Generated NSRP PDF preview"
          className={`${viewerClassName} w-full rounded-xl border border-slate-300 bg-white`}
        />
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => window.open(blobUrl, "_blank", "noopener")}
          className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700"
        >
          Open in new tab
        </button>
        <a
          href={blobUrl}
          download={downloadName}
          className="inline-flex rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700"
        >
          Download
        </a>
      </div>
    </div>
  )
}
