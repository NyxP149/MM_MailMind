import { MailCheck } from 'lucide-react';

export function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-icon"><MailCheck size={30} /></div>
      <h3>Tout est calme ici</h3>
      <p>Aucun e-mail n’a été retourné par Gmail.</p>
    </div>
  );
}

