import { STATUSES } from '../lib/statuses.js';
import { Document, Clock, Progress, CheckCircle, Person, Warning } from './Icons.jsx';

const ICONS = {
  document: Document,
  clock: Clock,
  progress: Progress,
  'check-circle': CheckCircle,
  person: Person,
  warning: Warning,
};

/* Renders one agreement status as an icon plus its label. */
export default function StatusChip({ status }) {
  const entry = STATUSES[status];
  if (!entry) return null;

  const Icon = ICONS[entry.icon];

  return (
    <span className={`chip chip--${entry.tone}`}>
      <Icon className={entry.icon === 'progress' ? 'is-spinning' : undefined} />
      {entry.label}
    </span>
  );
}
