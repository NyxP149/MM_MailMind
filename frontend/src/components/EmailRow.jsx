import { Check, LoaderCircle, RotateCcw, ShieldCheck, Star, Tags, Undo2, X } from 'lucide-react';
import { CATEGORY_OPTIONS } from '../classification.js';
import { formatEmailDate, initials } from '../utils.js';

const colors = ['violet', 'lime', 'amber', 'blue', 'rose'];

export function EmailRow({ email, index, editable = false, decision, onCategoryChange, onDecision, onGmailAction, gmailBusy = false }) {
  return (
    <article className={`email-row ${email.unread ? 'is-unread' : ''} ${decision ? `decision-${decision}` : ''} ${onDecision ? 'has-review' : ''}`}>
      <div className={`avatar avatar-${colors[index % colors.length]}`} aria-hidden="true">
        {initials(email.from.name)}
      </div>
      <div className="email-sender">
        <strong>{email.from.name}</strong>
        <span>{email.from.email}</span>
      </div>
      <div className="email-content">
        <div className="email-subject-line">
          <strong>{email.subject}</strong>
          {email.classification && !editable && (
            <span className={`classification-badge category-${email.classification.id}`} title={email.classification.reasons?.join(' · ')}>
              {email.classification.label} · {Math.round(email.classification.confidence * 100)}%
            </span>
          )}
          {email.classification && editable && (
            <select
              className={`classification-select category-${email.classification.id}`}
              value={email.classification.id}
              onChange={(event) => onCategoryChange?.(email.id, event.target.value)}
              aria-label={`Corriger la catégorie de ${email.subject}`}
              title={email.classification.reasons?.join(' · ')}
            >
              {CATEGORY_OPTIONS.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
            </select>
          )}
          {email.classification?.corrected && <span className="manual-mark">Corrigé</span>}
          {email.classification?.learned && <span className="learned-mark">Appris</span>}
        </div>
        <p>{email.snippet || 'Aucun aperçu disponible'}</p>
      </div>
      <time dateTime={email.date}>{formatEmailDate(email.date)}</time>
      {onDecision ? (
        <div className="review-actions">
          {email.quarantined ? (
            <>
              <span className="gmail-state"><Tags size={13} /> Dans Gmail</span>
              <button className="gmail-action restore" onClick={() => onGmailAction?.(email, 'restore')} disabled={gmailBusy}><Undo2 size={14} /> Restaurer</button>
            </>
          ) : decision === 'confirmed' ? (
            <>
              <button className="decision-indicator confirmed" onClick={() => onDecision(email.id, null)} title="Annuler la confirmation"><ShieldCheck size={14} /> Confirmé <RotateCcw size={12} /></button>
              <button className="gmail-action apply" onClick={() => onGmailAction?.(email, 'quarantine')} disabled={gmailBusy}>{gmailBusy ? <LoaderCircle className="spin" size={14} /> : <Tags size={14} />} Appliquer dans Gmail</button>
            </>
          ) : (
            <>
              <button className="review-button safe" onClick={() => onDecision(email.id, 'safe')} title="Signaler comme faux positif"><X size={15} /><span>Faux positif</span></button>
              <button className="review-button confirm" onClick={() => onDecision(email.id, 'confirmed')} title="Confirmer comme indésirable"><Check size={15} /><span>Confirmer</span></button>
            </>
          )}
        </div>
      ) : (
        <button className="icon-button star-button" aria-label={`Ajouter ${email.subject} aux favoris`}><Star size={18} /></button>
      )}
    </article>
  );
}
