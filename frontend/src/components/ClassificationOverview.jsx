import { Eye, ShieldAlert, Sparkles, Tags } from 'lucide-react';

const categoryOrder = [
  'adultes', 'rencontres', 'spam', 'arnaque', 'newsletter',
  'publicite', 'facture', 'travail', 'important', 'autre',
];

export function ClassificationOverview({ emails, selectedCategory, onSelectCategory, decisions = {} }) {
  const counts = emails.reduce((result, email) => {
    const id = email.classification?.id || 'autre';
    result[id] = (result[id] || 0) + 1;
    return result;
  }, {});
  const labels = Object.fromEntries(
    emails.map((email) => [email.classification?.id, email.classification?.label]),
  );
  const quarantine = emails.filter((email) => email.classification?.action === 'quarantine').length;
  const review = emails.filter((email) => email.classification?.action === 'review').length;
  const confirmed = Object.values(decisions).filter((decision) => decision === 'confirmed').length;

  return (
    <>
      <section className="analysis-stats" aria-label="Synthèse de l’analyse">
        <div className="analysis-stat"><span className="stat-icon stat-violet"><Sparkles size={20} /></span><div><strong>{emails.length}</strong><small>analysés</small></div></div>
        <div className="analysis-stat"><span className="stat-icon stat-rose"><ShieldAlert size={20} /></span><div><strong>{quarantine}</strong><small>en quarantaine virtuelle</small></div></div>
        <div className="analysis-stat"><span className="stat-icon stat-amber"><Eye size={20} /></span><div><strong>{confirmed || review}</strong><small>{confirmed ? 'indésirables confirmés' : 'à vérifier'}</small></div></div>
        <div className="analysis-stat"><span className="stat-icon stat-lime"><Tags size={20} /></span><div><strong>{Object.keys(counts).length}</strong><small>catégories détectées</small></div></div>
      </section>
      <section className="category-strip" aria-label="Filtres par catégorie">
        <button className={!selectedCategory ? 'category-chip active' : 'category-chip'} onClick={() => onSelectCategory(null)}>Toutes <b>{emails.length}</b></button>
        {categoryOrder.filter((id) => counts[id]).map((id) => (
          <button key={id} className={selectedCategory === id ? `category-chip category-${id} active` : `category-chip category-${id}`} onClick={() => onSelectCategory(id)}>
            {labels[id] || id} <b>{counts[id]}</b>
          </button>
        ))}
      </section>
    </>
  );
}
