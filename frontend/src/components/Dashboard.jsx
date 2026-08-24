import { Activity, CheckCircle2, Clock3, Inbox, RotateCcw, ShieldCheck, Sparkles, Tags } from 'lucide-react';
import { computeDashboardMetrics } from '../classification.js';

const actionLabels = {
  quarantine: 'Label de quarantaine ajouté',
  restore: 'Label de quarantaine retiré',
};

function formatActivityDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
}

export function Dashboard({ emails, decisions, history }) {
  const metrics = computeDashboardMetrics(emails, decisions, history);
  const maxCategory = Math.max(...metrics.categories.map((category) => category.count), 1);

  return (
    <div className="dashboard-v3">
      <section className="dashboard-hero">
        <div><span className="eyebrow"><Sparkles size={14} /> Synthèse locale</span><h2>{metrics.analyzed} messages analysés</h2><p>Une vue d’ensemble de la session et de vos décisions conservées dans ce navigateur.</p></div>
        <div className="time-saved"><Clock3 size={22} /><div><strong>{metrics.estimatedMinutesSaved} min</strong><span>temps économisé estimé</span></div></div>
      </section>

      <section className="dashboard-kpis">
        <article><span className="kpi-icon violet"><Inbox size={19} /></span><div><strong>{metrics.analyzed}</strong><small>chargés</small></div></article>
        <article><span className="kpi-icon blue"><CheckCircle2 size={19} /></span><div><strong>{metrics.reviewed}</strong><small>vérifiés</small></div></article>
        <article><span className="kpi-icon rose"><ShieldCheck size={19} /></span><div><strong>{metrics.quarantinedInGmail}</strong><small>labellisés dans Gmail</small></div></article>
        <article><span className="kpi-icon green"><RotateCcw size={19} /></span><div><strong>{metrics.restored}</strong><small>restaurations</small></div></article>
      </section>

      <div className="dashboard-columns">
        <section className="dashboard-panel category-chart-panel">
          <div className="dashboard-panel-head"><div><span className="eyebrow">Répartition</span><h3>Catégories détectées</h3></div><Tags size={19} /></div>
          <div className="category-bars">
            {metrics.categories.map((category) => (
              <div className="category-bar-row" key={category.id}>
                <div><span>{category.label}</span><b>{category.count}</b></div>
                <i><span className={`bar category-${category.id}`} style={{ width: `${Math.max(5, (category.count / maxCategory) * 100)}%` }} /></i>
              </div>
            ))}
            {!metrics.categories.length && <p className="dashboard-empty">Aucun message analysé.</p>}
          </div>
        </section>

        <section className="dashboard-panel activity-panel">
          <div className="dashboard-panel-head"><div><span className="eyebrow">Journal local</span><h3>Activité récente</h3></div><Activity size={19} /></div>
          <div className="activity-list">
            {history.slice(0, 8).map((event, index) => (
              <div className="activity-row" key={`${event.at}-${index}`}>
                <span className={`activity-icon ${event.action}`}><ShieldCheck size={14} /></span>
                <div><strong>{actionLabels[event.action] || 'Action MailMind'}</strong><small>{event.categoryLabel || 'Catégorie non renseignée'} · {formatActivityDate(event.at)}</small></div>
              </div>
            ))}
            {!history.length && <div className="dashboard-empty">Les futures actions Gmail apparaîtront ici, sans contenu d’e-mail.</div>}
          </div>
        </section>
      </div>
      <p className="dashboard-estimate"><Clock3 size={13} /> Estimation indicative : 12 secondes par validation et 8 secondes par action Gmail.</p>
    </div>
  );
}
