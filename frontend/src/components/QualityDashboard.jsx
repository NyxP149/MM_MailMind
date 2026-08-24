import { BarChart3, CheckCircle2, Download, Edit3, ShieldAlert, Target, XCircle } from 'lucide-react';
import { computeQualityMetrics } from '../classification.js';

function MetricCard({ icon: Icon, tone, value, label, help }) {
  return (
    <article className="quality-card">
      <span className={`quality-icon ${tone}`}><Icon size={20} /></span>
      <div><strong>{value}</strong><span>{label}</span><small>{help}</small></div>
    </article>
  );
}

export function QualityDashboard({ emails, rawEmails, decisions, overrides }) {
  const metrics = computeQualityMetrics(emails, decisions, overrides);

  const exportDecisions = () => {
    const records = rawEmails
      .filter((email) => decisions[email.id] || overrides[email.id])
      .map((email) => ({
        automaticCategory: email.classification?.id || 'autre',
        correctedCategory: overrides[email.id]?.categoryId || null,
        decision: decisions[email.id] || null,
      }));
    const payload = {
      schema: 'mailmind-feedback-v1',
      exportedAt: new Date().toISOString(),
      metrics,
      records,
      privacy: 'Aucun identifiant, sujet, expéditeur ou contenu d’e-mail inclus.',
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `mailmind-feedback-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="quality-dashboard">
      <section className="quality-grid">
        <MetricCard icon={Target} tone="violet" value={metrics.precision === null ? '—' : `${metrics.precision}%`} label="précision observée" help="Confirmés parmi les messages vérifiés" />
        <MetricCard icon={BarChart3} tone="blue" value={`${metrics.coverage}%`} label="couverture" help={`${metrics.reviewed} vérifiés sur ${metrics.candidates}`} />
        <MetricCard icon={CheckCircle2} tone="green" value={metrics.confirmed} label="confirmés" help="Suggestions jugées correctes" />
        <MetricCard icon={XCircle} tone="rose" value={metrics.falsePositives} label="faux positifs" help="Messages retirés de la quarantaine" />
        <MetricCard icon={Edit3} tone="amber" value={metrics.corrections} label="catégories corrigées" help="Ajustements manuels sur le lot chargé" />
        <MetricCard icon={ShieldAlert} tone="neutral" value={metrics.pending} label="encore à vérifier" help="Suggestions sans décision" />
      </section>

      <section className="quality-panel">
        <div className="quality-panel-head">
          <div><span className="eyebrow">Mesure locale</span><h2>Précision par catégorie</h2><p>Ces chiffres portent uniquement sur les messages chargés et vérifiés.</p></div>
          <button className="export-button" onClick={exportDecisions} disabled={!metrics.reviewed && !metrics.corrections}><Download size={16} /> Exporter les décisions</button>
        </div>
        <div className="quality-table" role="table" aria-label="Qualité par catégorie">
          <div className="quality-table-row header" role="row"><span>Catégorie</span><span>Détectés</span><span>Confirmés</span><span>Faux positifs</span><span>Précision</span></div>
          {Object.entries(metrics.byCategory).map(([id, item]) => {
            const reviewed = item.confirmed + item.falsePositives;
            const precision = reviewed ? Math.round((item.confirmed / reviewed) * 100) : null;
            return <div className="quality-table-row" role="row" key={id}><strong><i className={`quality-dot category-${id}`} />{item.label}</strong><span>{item.total}</span><span>{item.confirmed}</span><span>{item.falsePositives}</span><span>{precision === null ? '—' : `${precision}%`}</span></div>;
          })}
          {!Object.keys(metrics.byCategory).length && <div className="quality-empty">Analysez des messages pour obtenir les premières métriques.</div>}
        </div>
      </section>
      <p className="quality-privacy"><ShieldAlert size={14} /> L’export exclut les identifiants, sujets, expéditeurs et extraits des e-mails.</p>
    </div>
  );
}
