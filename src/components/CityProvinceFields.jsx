import { PH_LOCATIONS, provinceForCity } from '../../shared/phLocations.js'

// Catalog-only city dropdown shared by employer sign-up and job forms.
export default function CityProvinceFields({ id, city = '', province = '', onChange, errors = {}, disabled = false, onBlur, locations = PH_LOCATIONS, cityLabel = 'City/Municipality' }) {
  const control = 'shared-form-control mt-2 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50'
  return <>
    <div>
      <label htmlFor={`${id}-city`} className="block text-sm font-medium text-slate-800">{cityLabel} *</label>
      <select id={`${id}-city`} required value={city} disabled={disabled}
        className={control} aria-invalid={Boolean(errors.city)} aria-describedby={errors.city ? `${id}-city-error` : undefined}
        onChange={(event) => {
          const selected = event.target.value
          onChange({ city: selected, province: provinceForCity(selected) || province })
        }} onBlur={() => onBlur?.('city')}>
        <option value="">Select city/municipality</option>
        {Object.keys(locations).map((name) => <option key={name} value={name}>{name}</option>)}
      </select>
      {errors.city && <p id={`${id}-city-error`} role="alert" className="mt-1 text-xs text-rose-700">{errors.city}</p>}
    </div>
    <div>
      <label htmlFor={`${id}-province`} className="block text-sm font-medium text-slate-800">Province *</label>
      <input id={`${id}-province`} type="text" value={province} readOnly required disabled={disabled} className={control} aria-invalid={Boolean(errors.province)} aria-describedby={errors.province ? `${id}-province-error` : undefined} onBlur={() => onBlur?.('province')} placeholder="Derived from city/municipality" />
      {errors.province && <p id={`${id}-province-error`} role="alert" className="mt-1 text-xs text-rose-700">{errors.province}</p>}
    </div>
  </>
}
