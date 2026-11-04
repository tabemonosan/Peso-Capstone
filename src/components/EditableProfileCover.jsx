import { useRef } from 'react'

function CoverIcon({ edit = false }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={edit ? 'M16 3l5 5M3 21l5-1L21 7a2 2 0 0 0-5-5L3 15l-1 7z' : 'M4 6h4l2-3h4l2 3h4a1 1 0 0 1 1 1v12H3V7a1 1 0 0 1 1-1z M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0'} /></svg>
}

export default function EditableProfileCover({ name, initials, photo, banner, editing, saving, onEdit, onSave, onCancel, onImage, photoInputRef }) {
  const ownPhotoRef = useRef(null), bannerRef = useRef(null)
  const photoRef = photoInputRef || ownPhotoRef
  const select = (field) => (event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onImage(file, field) }
  return <div role="group" aria-label="Profile pictures" className="profile-cover editable-profile-cover mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <button type="button" disabled={saving} onClick={() => bannerRef.current?.click()} aria-label="Change banner image" className="profile-banner profile-banner-upload" style={banner ? { backgroundImage: `url(${banner})` } : undefined}><span className="profile-banner-upload-hint"><CoverIcon />Change banner</span></button>
    <div className="profile-identity editable-profile-identity">
      <button type="button" disabled={saving} onClick={() => photoRef.current?.click()} aria-label="Change profile photo" className="profile-photo-upload"><span className="profile-photo-image">{photo ? <img src={photo} alt="Profile" /> : initials}</span><span className="profile-photo-camera"><CoverIcon /></span></button>
      <p className="profile-cover-name">{name}</p>
      <div className="profile-cover-actions">{editing ? <><button type="button" disabled={saving} onClick={onSave} className="profile-save-button">{saving ? 'Saving...' : 'Save profile'}</button><button type="button" disabled={saving} onClick={onCancel} className="profile-cancel-button">Cancel</button></> : <button type="button" onClick={onEdit} className="profile-edit-button" aria-label="Edit profile" title="Edit profile"><CoverIcon edit /></button>}</div>
    </div>
    <input ref={photoRef} className="hidden" type="file" accept="image/*" aria-label="Upload profile photo" onChange={select('profileImage')} />
    <input ref={bannerRef} className="hidden" type="file" accept="image/*" aria-label="Upload banner image" onChange={select('bannerImage')} />
  </div>
}
