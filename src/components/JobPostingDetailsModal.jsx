import Modal from './Modal'
import JobPostingDetails from './JobPostingDetails'

export default function JobPostingDetailsModal({ job, onClose, onEdit }) {
  return <Modal onClose={onClose} labelledBy="employer-job-details-title" describedBy="employer-job-details-company"><JobPostingDetails job={job} onClose={onClose} onEdit={onEdit} /></Modal>
}
