export default function CompanyRating({ rating }) {
  const count = rating?.totalRatings || 0
  if (!count) return null
  const average = Number(rating.averageScore).toFixed(1)
  const reviews = `${count} ${count === 1 ? 'review' : 'reviews'}`
  return <span className="ml-2 inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-slate-700" aria-label={`${average} out of 5 stars, ${reviews}`}>
    <span aria-hidden="true" className="text-amber-600">★</span><span>{average}</span><span className="font-normal text-slate-500">({reviews})</span>
  </span>
}
