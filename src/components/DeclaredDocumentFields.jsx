import { PHILSYS_TYPE, PHILSYS_FORMATS, BIRTH_COPY_TYPES } from '../../shared/documentImage.js'
const control = 'shared-form-control mt-1 block h-11 min-w-0 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900'
const label = 'block min-w-0 text-sm font-medium text-slate-700'
export default function DeclaredDocumentFields({ docKey, idType, value = {}, onChange, disabled, className = 'grid gap-3 sm:grid-cols-2' }) {
  if (docKey === 'birthCertificate') return <div className={className}><label className={`${label} sm:col-span-2`}>Birth certificate copy type (required)<select required className={control} disabled={disabled} value={value.copyType || ''} onChange={e => onChange({ copyType: e.target.value })}><option value="">Select copy type</option>{BIRTH_COPY_TYPES.map(type => <option key={type}>{type}</option>)}</select></label></div>
  if (!idType) return null
  if (idType === PHILSYS_TYPE) return <label className={`${label} sm:col-span-2`}>National ID format<select className={control} disabled={disabled} value={value.format || ''} onChange={e => onChange({ format: e.target.value })}><option value="">Select format</option>{PHILSYS_FORMATS.map(format => <option key={format}>{format}</option>)}</select><span className="mt-1 block text-xs font-normal text-slate-600">Do not enter your PhilSys or card number.</span></label>
  return null
}
