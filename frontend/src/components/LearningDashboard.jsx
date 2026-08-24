import { BrainCircuit, Clock3, Database, GraduationCap, RotateCcw, ShieldCheck, Sparkles, Tags } from 'lucide-react';
import { CATEGORY_OPTIONS, computeLearningMetrics } from '../classification.js';

const labelOf = (categoryId) => CATEGORY_OPTIONS.find((category) => category.id === categoryId)?.label || categoryId;

function LearningMetric({ icon: Icon, tone, value, label, help }) {
  return <article><span className={`learning-metric-icon ${tone}`}><Icon size={19} /></span><div><strong>{value}</strong><span>{label}</span><small>{help}</small></div></article>;
}

export function LearningDashboard({ examples, onReset }) {
  const metrics = computeLearningMetrics(examples);
  const categories = Object.entries(metrics.categoryCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="learning-dashboard">
      <section className="learning-hero">
        <div><span className="eyebrow"><Sparkles size={14} /> Apprentissage contrôlé</span><h2>Vos corrections deviennent des préférences.</h2><p>MailMind attend plusieurs exemples concordants avant d’adapter une suggestion.</p></div>
        <div className="learning-hero-icon"><GraduationCap size={31} /><strong>V6</strong></div>
      </section>

      <section className="learning-metrics">
        <LearningMetric icon={Database} tone="violet" value={metrics.examples} label="corrections mémorisées" help="500 exemples locaux maximum" />
        <LearningMetric icon={BrainCircuit} tone="green" value={metrics.activeSignals.length} label="préférences actives" help="Signaux suffisamment confirmés" />
        <LearningMetric icon={Clock3} tone="amber" value={metrics.pendingSignals.length} label="signaux en observation" help="Encore trop peu d’exemples" />
        <LearningMetric icon={Tags} tone="blue" value={categories.length} label="catégories apprises" help="À partir de vos corrections" />
      </section>

      <div className="learning-columns">
        <section className="learning-panel">
          <div className="learning-panel-head"><div><span className="eyebrow">Mémoire active</span><h3>Préférences utilisées</h3><p>Deux domaines ou trois mots-clés concordants sont nécessaires.</p></div><BrainCircuit size={20} /></div>
          <div className="learning-signal-list">
            {metrics.activeSignals.map((signal) => (
              <div className="learning-signal" key={`${signal.type}-${signal.value}`}>
                <span className={`signal-type ${signal.type}`}>{signal.type === 'domain' ? 'Domaine' : 'Mot-clé'}</span>
                <div><strong>{signal.value}</strong><small>{signal.count} confirmations sur {signal.total}</small></div>
                <span className={`rule-category category-${signal.categoryId}`}>{labelOf(signal.categoryId)}</span>
                <b>{Math.round(signal.confidence * 100)}%</b>
              </div>
            ))}
            {!metrics.activeSignals.length && <div className="learning-empty"><BrainCircuit size={31} /><strong>Aucune préférence active</strong><span>Corrigez plusieurs messages similaires pour commencer.</span></div>}
          </div>
        </section>

        <section className="learning-panel">
          <div className="learning-panel-head"><div><span className="eyebrow">Progression</span><h3>Ce que MailMind observe</h3><p>Les signaux faibles ne changent encore aucun classement.</p></div><Clock3 size={20} /></div>
          <div className="learning-progress-list">
            {metrics.pendingSignals.slice(0, 8).map((signal) => {
              const target = signal.type === 'domain' ? 2 : 3;
              return <div className="learning-progress" key={`${signal.type}-${signal.value}`}><div><strong>{signal.value}</strong><span>{labelOf(signal.categoryId)} · {signal.count}/{target}</span></div><i><span style={{ width: `${Math.min(100, (signal.count / target) * 100)}%` }} /></i></div>;
            })}
            {!metrics.pendingSignals.length && <div className="learning-empty compact"><ShieldCheck size={28} /><strong>Aucun signal en attente</strong><span>Les prochaines corrections apparaîtront ici.</span></div>}
          </div>
        </section>
      </div>

      <section className="learning-control">
        <div><ShieldCheck size={18} /><div><strong>Mémoire locale et réversible</strong><span>Les sujets complets, expéditeurs et contenus ne sont pas conservés dans la mémoire V6.</span></div></div>
        <button onClick={onReset} disabled={!examples.length}><RotateCcw size={15} /> Réinitialiser l’apprentissage</button>
      </section>
    </div>
  );
}
