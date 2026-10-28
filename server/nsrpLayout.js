// Centralized NSRP Form 1 overlay layout.
// Coordinates are in PDF points, measured from the TOP-LEFT of the page
// (the generator converts y = pageHeight - top, since pdf-lib's origin is
// bottom-left). Measured against the official template render at scale 2
// (1190 x 1684 px for a 595.2 x 841.92 pt page). 2 template pages.
// 'top' is the text BASELINE's distance from the top edge.
// Every field: page (0-based), x (left edge) or centerX (horizontally centered),
// top, maxWidth, size (font size in pt).

export const NSRP_PAGE = { width: 595.2, height: 841.92, pageCount: 2 }

export const NSRP_DEFAULT_SIZE = 9
export const NSRP_MIN_SIZE = 6
export const NSRP_MAX_ROWS_PER_SECTION = 10 // extra rows get a "see attached sheet" note

// --- Page 0: I. Personal Information, II. Job Preference, III. Languages ---
export const NSRP_TEXT_FIELDS = {
  // Name row: single blank band above the Surname/First-name/Middle/Suffix labels.
  // No printed column dividers; the band (27.5-567.5pt) is 4 equal 135pt columns.
  // Values are centered on each column (centerX) with 3pt padding per side.
  surname:      { page: 0, centerX: 95,  top: 160, maxWidth: 129, size: 9, caps: true },
  firstName:    { page: 0, centerX: 230, top: 160, maxWidth: 129, size: 9, caps: true },
  middleName:   { page: 0, centerX: 365, top: 160, maxWidth: 129, size: 9, caps: true },
  suffix:       { page: 0, centerX: 500, top: 160, maxWidth: 129, size: 9, caps: true },
  // DOB (value area right of label) / Place of birth
  dob:          { page: 0, x: 172, top: 187.5, maxWidth: 140, size: 9, date: true },
  // Place of birth: value area is right of the divider at 411.5pt; cell borders
  // 178.5/192.5 — baseline keeps >=1.5pt clearance from the top border.
  placeOfBirth: { page: 0, x: 415, top: 187, maxWidth: 148, size: 8, caps: true },
  // Religion value cell (row spans ~206-232.5pt)
  religion:     { page: 0, x: 172, top: 220, maxWidth: 140, size: 9 },
  // Present address lines, right of the printed sub-labels
  addressStreet:   { page: 0, x: 419, top: 222, maxWidth: 148, size: 8, caps: true },
  addressBarangay: { page: 0, x: 419, top: 236, maxWidth: 148, size: 8, caps: true },
  addressCity:     { page: 0, x: 419, top: 250, maxWidth: 148, size: 8, caps: true },
  addressProvince: { page: 0, x: 419, top: 264, maxWidth: 148, size: 8, caps: true },
  // Values in the blank cells right of the printed labels
  // Value cells between row lines 270.5/284.5/298.5/312.5/326.5 — baselines keep >=1.5pt clearance
  tin:        { page: 0, x: 125, top: 281, maxWidth: 185, size: 9 },
  height:     { page: 0, x: 445, top: 281, maxWidth: 120, size: 9 },
  gsisSss:    { page: 0, x: 125, top: 295, maxWidth: 185, size: 9 },
  email:      { page: 0, x: 445, top: 295, maxWidth: 120, size: 7 },
  pagibig:    { page: 0, x: 125, top: 309, maxWidth: 185, size: 9 },
  landline:   { page: 0, x: 445, top: 309, maxWidth: 120, size: 9 },
  philhealth: { page: 0, x: 125, top: 323, maxWidth: 185, size: 9 },
  cellphone:  { page: 0, x: 445, top: 323, maxWidth: 120, size: 9 },
  // Disability "Others, specify:" underline sits on the second row (~350.5pt line)
  disability: { page: 0, x: 285, top: 348.5, maxWidth: 80, size: 7 },
  // --- Page 1: VII. Work experience (5 fixed rows, boundaries 337.5/351/364.5/378/391.5/405) ---
  // Employment type detail write-on lines (underlines measured from template)
  terminatedAbroadCountry: { page: 0, x: 474, top: 429.5, maxWidth: 50, size: 7 },
  employmentTypeOther:     { page: 0, x: 473, top: 451.5, maxWidth: 42, size: 7 },
  // Looking-for-work write-on lines (baseline just above the printed underscores)
  lookingDuration: { page: 0, x: 457, top: 480.5, maxWidth: 40, size: 8 },
  willingWhen:     { page: 0, x: 323, top: 494, maxWidth: 175, size: 8 },
  fourPsId:        { page: 0, x: 335, top: 516.5, maxWidth: 96, size: 8 },
  // II. Job preference — baselines sit just above each row's bottom line
  // Vertical dividers: occupation value cell 49.5-184.5, local value cell 206-346.5,
  // overseas value cell 373.5-567.5. x = inner left + 3pt padding, maxWidth = inner width - 6pt.
  // Occupation rows: 556-578, 578-600, 600-622, 622-644.5
  occupation1: { page: 0, x: 52.5, top: 572, maxWidth: 129, size: 9 },
  occupation2: { page: 0, x: 52.5, top: 594, maxWidth: 129, size: 9 },
  occupation3: { page: 0, x: 52.5, top: 616, maxWidth: 129, size: 9 },
  occupation4: { page: 0, x: 52.5, top: 638, maxWidth: 129, size: 9 },
  // Work-location rows: 578-600, 600-622, 622-644.5
  localPref1: { page: 0, x: 209, top: 594, maxWidth: 134, size: 9 },
  localPref2: { page: 0, x: 209, top: 616, maxWidth: 134, size: 9 },
  localPref3: { page: 0, x: 209, top: 638, maxWidth: 134, size: 9 },
  overseasPref1: { page: 0, x: 376.5, top: 594, maxWidth: 188, size: 9 },
  overseasPref2: { page: 0, x: 376.5, top: 616, maxWidth: 188, size: 9 },
  overseasPref3: { page: 0, x: 376.5, top: 638, maxWidth: 188, size: 9 },
  // Expected salary / Passport / Expiry value cells (row 644.5-668)
  expectedSalary: { page: 0, x: 157, top: 663, maxWidth: 100, size: 9 },
  passportNo:     { page: 0, x: 342, top: 663, maxWidth: 80,  size: 9 },
  passportExpiry: { page: 0, x: 495, top: 663, maxWidth: 65,  size: 9, date: true },
  // III. Languages — "Others:" write-on line
  languageOther: { page: 0, x: 70, top: 760, maxWidth: 50, size: 8, caps: true },
  // VIII. Skills "OTHERS:" write-on line (page 1). Underline at y=518.5pt
  // spanning 433.5-537.5pt; baseline 2pt above the line, shrink to its width.
  skillOthersText: { page: 1, x: 436, top: 516.5, maxWidth: 99, size: 7, caps: true },
}

// Checkboxes as measured boxes (x, y = top-left of the box, w/h in pt).
// Detected from the blank template render at scale 2.
// The mark is drawn as two diagonal vector lines centered in the box.
export const NSRP_CHECKBOXES = {
  sexMale:      { page: 0, box: { x: 173.5, y: 192.0, w: 9.5, h: 10.5 } },
  sexFemale:    { page: 0, box: { x: 246.5, y: 192.0, w: 9.5, h: 10.5 } },
  civilSingle:   { page: 0, box: { x: 103.0, y: 229.0, w: 9.5, h: 11.0 } },
  civilSeparated:{ page: 0, box: { x: 197.0, y: 229.0, w: 9.5, h: 11.0 } },
  civilMarried:  { page: 0, box: { x: 103.0, y: 244.0, w: 9.5, h: 9.5 } },
  civilLiveIn:   { page: 0, box: { x: 197.0, y: 244.0, w: 9.5, h: 9.5 } },
  civilWidowed:  { page: 0, box: { x: 103.0, y: 258.0, w: 9.5, h: 10.0 } },
  disabilityVisual:  { page: 0, box: { x: 126.5, y: 329.0, w: 9.5, h: 9.5 } },
  disabilitySpeech:  { page: 0, box: { x: 205.5, y: 329.0, w: 9.5, h: 9.5 } },
  disabilityOthers:  { page: 0, box: { x: 281.0, y: 329.0, w: 9.5, h: 9.5 } },
  disabilityHearing: { page: 0, box: { x: 126.5, y: 344.5, w: 9.5, h: 9.5 } },
  disabilityPhysical:{ page: 0, box: { x: 205.5, y: 343.0, w: 9.5, h: 9.5 } },
  empEmployed:   { page: 0, box: { x: 112.5, y: 362.5, w: 9.5, h: 9.5 } },
  empUnemployed: { page: 0, box: { x: 239.5, y: 360.5, w: 9.5, h: 11.0 } },
  empWageEmployed:  { page: 0, box: { x: 127.5, y: 387.5, w: 9.5, h: 11.0 } },
  empSelfEmployed:  { page: 0, box: { x: 127.5, y: 412.5, w: 9.5, h: 10.0 } },
  empNewEntrant:    { page: 0, box: { x: 255.0, y: 389.5, w: 9.5, h: 9.5 } },
  empFinishedContract: { page: 0, box: { x: 256.0, y: 410.5, w: 9.5, h: 9.5 } },
  empResigned:      { page: 0, box: { x: 256.0, y: 431.5, w: 9.5, h: 10.0 } },
  empRetired:       { page: 0, box: { x: 256.0, y: 455.0, w: 9.5, h: 9.5 } },
  empTerminatedLocal:  { page: 0, box: { x: 398.5, y: 389.0, w: 9.5, h: 10.0 } },
  empTerminatedAbroad: { page: 0, box: { x: 399.0, y: 411.0, w: 9.5, h: 9.5 } },
  empTypeOthers:       { page: 0, box: { x: 399.0, y: 442.0, w: 9.5, h: 9.5 } },
  lookingYes: { page: 0, box: { x: 223.0, y: 471.5, w: 9.5, h: 10.0 } },
  lookingNo:  { page: 0, box: { x: 263.5, y: 471.5, w: 9.5, h: 10.0 } },
  willingYes: { page: 0, box: { x: 188.0, y: 483.5, w: 9.5, h: 10.0 } },
  willingNo:  { page: 0, box: { x: 223.5, y: 483.5, w: 9.5, h: 10.0 } },
  fourPsYes:  { page: 0, box: { x: 154.5, y: 505.5, w: 9.5, h: 9.5 } },
  fourPsNo:   { page: 0, box: { x: 188.5, y: 505.5, w: 9.5, h: 10.0 } },
  prefLocal:    { page: 0, box: { x: 189.0, y: 556.0, w: 9.5, h: 10.5 } },
  prefOverseas: { page: 0, box: { x: 351.0, y: 556.0, w: 9.5, h: 11.0 } },
  // Page 1: VIII. Other skills grid (3 columns x 6 rows).
  // Row tops measured per column: rows 1-3 align, row 4 of columns 2/3 sits
  // ~4pt lower than column 1, rows 5-6 at 480/493.5.
  skillAutoMechanic:     { page: 1, box: { x: 32.5, y: 422.0, w: 9.5, h: 9.5 } },
  skillBeautician:       { page: 1, box: { x: 32.5, y: 436.0, w: 9.5, h: 9.5 } },
  skillCarpentryWork:    { page: 1, box: { x: 32.5, y: 449.5, w: 9.5, h: 9.5 } },
  skillComputerLiterate: { page: 1, box: { x: 32.5, y: 463.0, w: 9.5, h: 9.5 } },
  skillDomesticChores:   { page: 1, box: { x: 32.5, y: 480.0, w: 9.5, h: 9.5 } },
  skillDriver:           { page: 1, box: { x: 32.5, y: 493.5, w: 9.5, h: 9.5 } },
  skillElectrician:      { page: 1, box: { x: 230.5, y: 422.0, w: 9.5, h: 9.5 } },
  skillEmbroidery:       { page: 1, box: { x: 230.5, y: 436.0, w: 9.5, h: 9.5 } },
  skillGardening:        { page: 1, box: { x: 230.5, y: 449.5, w: 9.5, h: 9.5 } },
  skillMasonry:          { page: 1, box: { x: 230.5, y: 467.0, w: 9.5, h: 9.5 } },
  skillPainterArtist:    { page: 1, box: { x: 230.5, y: 480.0, w: 9.5, h: 9.5 } },
  skillPaintingJobs:     { page: 1, box: { x: 230.5, y: 493.5, w: 9.5, h: 9.5 } },
  skillPhotography:      { page: 1, box: { x: 410.5, y: 422.0, w: 9.5, h: 9.5 } },
  skillPlumbing:         { page: 1, box: { x: 410.5, y: 436.0, w: 9.5, h: 9.5 } },
  skillSewingDresses:    { page: 1, box: { x: 410.5, y: 449.5, w: 9.5, h: 9.5 } },
  skillStenography:      { page: 1, box: { x: 410.5, y: 467.0, w: 9.5, h: 9.5 } },
  skillTailoring:        { page: 1, box: { x: 410.5, y: 480.0, w: 9.5, h: 9.5 } },
  skillOthers:           { page: 1, box: { x: 410.5, y: 493.5, w: 9.5, h: 9.5 } },
}

// Center of a checkbox box (used by the generator and tests)
export const nsrpCheckboxCenter = (spec) => ({
  cx: spec.box.x + spec.box.w / 2,
  cy: spec.box.y + spec.box.h / 2,
})

// III. Language / dialect proficiency (page 0): column centers from borders
// 134 | 255.5 | 373.5 | 473 | 567.5
export const NSRP_LANGUAGES = {
  x: { read: 195, write: 314.5, speak: 423, understand: 520 },
  rows: { English: 710, Filipino: 732, Others: 752 },
}

// --- Page 1: IV. Educational background (fixed rows) ---
// Column borders: 95 | 256.5 | 360 | 409.5 | 473 | 518 | 567.5 — x/mw keep 3pt padding
export const NSRP_EDUCATION = {
  page: 1,
  rows: { Elementary: 71, Secondary: 94, Tertiary: 117, 'Graduate Studies': 143 },
  cols: { school: 98, course: 259.5, year: 363, undergradLevel: 412.5, yearLastAttended: 476, awards: 521 },
  maxWidth: { school: 155, course: 97, year: 43, undergradLevel: 57, yearLastAttended: 39, awards: 43 },
  innerHeight: 20,
  maxLines: { school: 2, course: 2, year: 1, undergradLevel: 2, yearLastAttended: 1, awards: 2 },
  singleLine: ['year', 'yearLastAttended'],
  size: 8,
}

// --- Page 1: V. Technical/vocational training (3 fixed rows: 194-208, 208-221.5, 221.5-235) ---
// Column borders: 49.5 | 243 | 328.5 | 459.5 | 567.5
export const NSRP_TRAINING = {
  page: 1,
  rows: [201, 214.75, 228.25],
  maxRows: 3,
  cols: { course: 52.5, duration: 249, institution: 334.5, certificate: 465.5 },
  maxWidth: { course: 184, duration: 73, institution: 119, certificate: 96 },
  innerHeight: 10.5,
  maxLines: { course: 1, duration: 1, institution: 1, certificate: 1 },
  singleLine: ['duration'],
  size: 8,
}

// --- Page 1: VI. Eligibility / professional license (2 fixed rows) ---
// Borders: 49.5 | 165.5 | 212 | 320 | 342.5 | 473 | 567.5
export const NSRP_ELIGIBILITY = {
  page: 1,
  rows: [273.5, 287.5],
  left:  { eligibility: 52.5, rating: 168.5, examDate: 215 },
  right: { license: 345.5, validUntil: 476 },
  maxWidth: { eligibility: 107, rating: 40, examDate: 102, license: 121, validUntil: 88 },
  innerHeight: 11,
  maxLines: { eligibility: 1, rating: 1, examDate: 1, license: 1, validUntil: 1 },
  singleLine: ['rating', 'examDate', 'validUntil'],
  size: 8,
}

// --- Page 1: VII. Work experience (5 fixed rows, boundaries 337.5/351/364.5/378/391.5/405) ---
// Column borders: 30 | 135 | 242.5 | 351.5 | 460 | 562.5
export const NSRP_WORK_EXPERIENCE = {
  page: 1,
  rows: [344.25, 357.75, 371.25, 384.75, 398.25],
  maxRows: 5,
  cols: { company: 33, address: 138, position: 245.5, dates: 354.5, status: 463 },
  maxWidth: { company: 99, address: 101, position: 100, dates: 102, status: 96 },
  innerHeight: 10.5,
  maxLines: { company: 1, address: 1, position: 1, dates: 1, status: 1 },
  singleLine: ['dates'],
  size: 8,
}
