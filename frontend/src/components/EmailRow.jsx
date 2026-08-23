import { Star } from 'lucide-react';
import { formatEmailDate, initials } from '../utils.js';

const colors = ['violet', 'lime', 'amber', 'blue', 'rose'];

export function EmailRow({ email, index }) {
  return (
    <article className={`email-row ${email.unread ? 'is-unread' : ''}`}>
      <div className={`avatar avatar-${colors[index % colors.length]}`} aria-hidden="true">
        {initials(email.from.name)}
      </div>
      <div className="email-sender">
        <strong>{email.from.name}</strong>
        <span>{email.from.email}</span>
      </div>
      <div className="email-content">
        <strong>{email.subject}</strong>
        <p>{email.snippet || 'Aucun aperçu disponible'}</p>
      </div>
      <time dateTime={email.date}>{formatEmailDate(email.date)}</time>
      <button className="icon-button star-button" aria-label={`Ajouter ${email.subject} aux favoris`}>
        <Star size={18} />
      </button>
    </article>
  );
}

