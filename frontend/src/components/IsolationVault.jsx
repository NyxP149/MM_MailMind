import { BellOff, ExternalLink, Inbox, LoaderCircle, RefreshCw, ShieldAlert, Siren, Trash2, Undo2 } from 'lucide-react';
import { formatEmailDate, initials } from '../utils.js';

const colors = ['violet', 'lime', 'amber', 'blue', 'rose'];

export function IsolationVault({ data, loading, busyId, bulkBusy, onRefresh, onLoadMore, onAction, onTrashAll, onUnsubscribe }) {
  const total = Number(data?.total || 0);
  const threshold = Number(data?.alertThreshold || 300);
  const gmailUrl = `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(`label:"${data?.label || 'MailMind/À supprimer'}"`)}`;

  return (
    <section className="isolation-vault">
      <div className="isolation-hero">
        <div>
          <span className="eyebrow"><ShieldAlert size={14} /> Sas Gmail visible</span>
          <h2>{data?.label || 'MailMind/À supprimer'}</h2>
          <p>Les messages isolés sont archivés, jamais supprimés automatiquement.</p>
        </div>
        <div className="isolation-count"><strong>{total}</strong><span>messages</span></div>
      </div>

      {total >= threshold && (
        <div className="isolation-alert" role="alert">
          <Siren size={20} />
          <div><strong>Le seuil de nettoyage est atteint.</strong><span>Le sas contient au moins {threshold} messages. Vérifiez-les avant de les envoyer à la corbeille.</span></div>
        </div>
      )}

      <div className="isolation-toolbar">
        <a href={gmailUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Ouvrir ce libellé dans Gmail</a>
        <div>
          <button onClick={onRefresh} disabled={loading || bulkBusy}><RefreshCw size={15} className={loading ? 'spin' : ''} /> Actualiser</button>
          <button className="isolation-trash-all" onClick={onTrashAll} disabled={!total || loading || bulkBusy}>
            {bulkBusy ? <LoaderCircle size={15} className="spin" /> : <Trash2 size={15} />} Vider le sas vers la corbeille
          </button>
        </div>
      </div>

      <div className="isolation-panel">
        <div className="panel-head"><div><h2>Messages isolés</h2><span>{data?.messages?.length || 0} affichés</span></div><span className="safe-badge"><ShieldAlert size={15} /> Validation manuelle</span></div>
        {loading && !data?.messages?.length ? <div className="isolation-loading"><LoaderCircle className="spin" /> Chargement du sas Gmail…</div> : data?.messages?.length ? (
          <div className="isolation-list">
            {data.messages.map((email, index) => (
              <article className="isolation-row" key={email.id}>
                <div className={`avatar avatar-${colors[index % colors.length]}`}>{initials(email.from.name)}</div>
                <div className="email-sender"><strong>{email.from.name}</strong><span>{email.from.email}</span></div>
                <div className="email-content"><div className="email-subject-line"><strong>{email.subject}</strong>{email.classification && <span className={`classification-badge category-${email.classification.id}`}>{email.classification.label} · {Math.round(email.classification.confidence * 100)}%</span>}</div><p>{email.snippet || 'Aucun aperçu disponible'}</p></div>
                <time dateTime={email.date}>{formatEmailDate(email.date)}</time>
                <div className="isolation-actions">
                  {email.unsubscribe?.available && <button className="isolation-unsubscribe" onClick={() => onUnsubscribe?.(email)} disabled={Boolean(busyId)}><BellOff size={14} /> Désabonner</button>}
                  <button className="isolation-restore" onClick={() => onAction(email, 'restore')} disabled={Boolean(busyId)}><Undo2 size={14} /> Restaurer</button>
                  <button className="isolation-spam" onClick={() => onAction(email, 'spam')} disabled={Boolean(busyId)}><Siren size={14} /> Spam</button>
                  <button className="isolation-trash" onClick={() => onAction(email, 'trash')} disabled={Boolean(busyId)}>{busyId === email.id ? <LoaderCircle className="spin" size={14} /> : <Trash2 size={14} />} Corbeille</button>
                </div>
              </article>
            ))}
          </div>
        ) : <div className="isolation-empty"><Inbox size={34} /><strong>Le sas est vide</strong><span>Les messages confirmés comme douteux pourront être isolés ici.</span></div>}
        {data?.nextPageToken && <div className="load-more"><button onClick={onLoadMore} disabled={loading}>Afficher plus de messages isolés</button></div>}
      </div>
      <div className="isolation-safety"><ShieldAlert size={15} /> Spam entraîne un signalement à Google. Corbeille reste récupérable dans Gmail. Aucune suppression définitive n’est disponible dans MailMind.</div>
    </section>
  );
}
