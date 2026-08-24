import { useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, Bot, CheckCircle2, Download, Eye, Octagon, Play, ShieldCheck, Tags } from 'lucide-react';
import { AGENT_CATEGORY_OPTIONS, DEFAULT_AGENT_POLICY, buildAgentPlan, createAgentReport } from '../agent.js';

function formatDate(value) {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function downloadReport(report) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `mailmind-agent-${report.id}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function AgentControl({ emails, decisions, reports, onSaveReport, onQuarantine }) {
  const [policy, setPolicy] = useState(DEFAULT_AGENT_POLICY);
  const [liveMode, setLiveMode] = useState(false);
  const [armed, setArmed] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const stopRequested = useRef(false);
  const plan = useMemo(() => buildAgentPlan(emails, policy, decisions), [decisions, emails, policy]);
  const latest = reports[0];

  const toggleCategory = (categoryId) => {
    setPolicy((current) => ({
      ...current,
      categories: current.categories.includes(categoryId)
        ? current.categories.filter((id) => id !== categoryId)
        : [...current.categories, categoryId],
    }));
    setArmed(false);
  };

  const run = async () => {
    if (running || (liveMode && (!armed || !plan.eligible.length))) return;
    if (liveMode && !window.confirm(`Autoriser MailMind à ajouter un label réversible à ${plan.eligible.length} message(s) ?\n\nAucune suppression, aucun archivage et aucun envoi ne seront effectués.`)) return;

    const runId = globalThis.crypto?.randomUUID?.() || `run-${Date.now()}`;
    const startedAt = new Date().toISOString();
    const events = [];
    let status = 'completed';
    stopRequested.current = false;
    setRunning(true);
    setProgress({ current: 0, total: plan.eligible.length });

    if (liveMode) {
      for (const [index, item] of plan.eligible.entries()) {
        if (stopRequested.current) {
          status = 'interrupted';
          break;
        }
        try {
          await onQuarantine(item, runId);
          events.push({ ...item, outcome: 'success' });
        } catch (error) {
          events.push({ ...item, outcome: 'failed', error: error.message });
        }
        setProgress({ current: index + 1, total: plan.eligible.length });
      }
    }

    const report = createAgentReport(plan, {
      id: runId,
      mode: liveMode ? 'controlled' : 'simulation',
      status,
      events,
      startedAt,
    });
    onSaveReport(report);
    setRunning(false);
    setArmed(false);
  };

  return (
    <div className="agent-v7">
      <section className="agent-hero">
        <div><span className="eyebrow"><Bot size={14} /> Autonomie sous contrôle</span><h2>Un agent qui agit dans vos limites.</h2><p>Politique explicite, labels réversibles, arrêt immédiat et rapport complet.</p></div>
        <div className="agent-status"><ShieldCheck size={24} /><strong>V7</strong><span>zéro suppression</span></div>
      </section>

      <section className="agent-metrics">
        <article><span className="agent-metric-icon violet"><Activity size={18} /></span><div><strong>{plan.metrics.analyzed}</strong><small>analysés</small></div></article>
        <article><span className="agent-metric-icon green"><CheckCircle2 size={18} /></span><div><strong>{plan.metrics.eligible}</strong><small>actions autorisées</small></div></article>
        <article><span className="agent-metric-icon amber"><AlertTriangle size={18} /></span><div><strong>{plan.metrics.ambiguous}</strong><small>cas ambigus</small></div></article>
        <article><span className="agent-metric-icon blue"><Eye size={18} /></span><div><strong>{plan.metrics.skipped}</strong><small>déjà traités</small></div></article>
      </section>

      <div className="agent-columns">
        <section className="agent-panel agent-policy">
          <header><div><span className="eyebrow">Politique autorisée</span><h3>Garde-fous du prochain lot</h3></div><Tags size={19} /></header>
          <div className="agent-policy-body">
            <label className="agent-threshold"><span>Seuil minimal de confiance</span><select value={policy.threshold} disabled={running} onChange={(event) => { setPolicy((current) => ({ ...current, threshold: Number(event.target.value) })); setArmed(false); }}><option value={0.8}>80 %</option><option value={0.9}>90 % — recommandé</option><option value={0.95}>95 % — prudent</option><option value={0.99}>99 % — strict</option></select></label>
            <fieldset disabled={running}><legend>Catégories autorisées</legend><div className="agent-category-grid">{AGENT_CATEGORY_OPTIONS.map((category) => <label key={category.id} className={policy.categories.includes(category.id) ? 'selected' : ''}><input type="checkbox" checked={policy.categories.includes(category.id)} onChange={() => toggleCategory(category.id)} /><span>{category.label}</span></label>)}</div></fieldset>
            <label className="agent-mode"><input type="checkbox" checked={liveMode} disabled={running} onChange={(event) => { setLiveMode(event.target.checked); setArmed(false); }} /><span><strong>Autoriser les actions Gmail</strong><small>Désactivé : le lancement produit uniquement une simulation.</small></span></label>
            {liveMode && <label className="agent-arm"><input type="checkbox" checked={armed} disabled={running} onChange={(event) => setArmed(event.target.checked)} /><span>J’autorise ce lot à ajouter uniquement le label réversible MailMind/Quarantine.</span></label>}
            <div className="agent-controls">
              <button className="agent-run" onClick={run} disabled={running || (liveMode && (!armed || !plan.eligible.length))}>{running ? <Activity className="spin" size={17} /> : liveMode ? <Play size={17} /> : <Eye size={17} />}{running ? `${progress.current}/${progress.total}` : liveMode ? `Exécuter ${plan.eligible.length} action(s)` : 'Générer une simulation'}</button>
              {running && <button className="agent-stop" onClick={() => { stopRequested.current = true; }}><Octagon size={16} /> Arrêter</button>}
            </div>
          </div>
        </section>

        <section className="agent-panel agent-report">
          <header><div><span className="eyebrow">Rapport d’activité</span><h3>{latest ? `Dernier lot · ${formatDate(latest.completedAt)}` : 'Aucun lot exécuté'}</h3></div>{latest && <button onClick={() => downloadReport(latest)} title="Exporter le rapport"><Download size={17} /></button>}</header>
          {latest ? <div className="agent-report-body"><div className={`agent-report-status ${latest.status}`}><ShieldCheck size={18} /><div><strong>{latest.mode === 'simulation' ? 'Simulation terminée' : latest.status === 'interrupted' ? 'Lot interrompu' : 'Lot contrôlé terminé'}</strong><span>{latest.metrics.executed} action(s), {latest.metrics.failed} échec(s), {latest.metrics.ambiguous} ambiguïté(s)</span></div></div><div className="agent-report-grid"><span><b>{latest.metrics.analyzed}</b> analysés</span><span><b>{latest.metrics.eligible}</b> proposés</span><span><b>{latest.metrics.executed}</b> exécutés</span><span><b>{latest.metrics.failed}</b> échecs</span></div><div className="agent-category-report">{latest.categories.filter((category) => category.eligible || category.ambiguous).map((category) => <div key={category.id}><strong>{category.label}</strong><span>{category.eligible} autorisé(s) · {category.ambiguous} ambigu(s)</span></div>)}</div></div> : <div className="agent-empty"><Bot size={36} /><strong>Prêt à simuler</strong><span>Commencez en mode simulation pour vérifier la politique sans modifier Gmail.</span></div>}
        </section>
      </div>

      {plan.ambiguous.length > 0 && <div className="agent-warning"><AlertTriangle size={17} /><span><strong>{plan.ambiguous.length} cas nécessitent votre attention.</strong> Ils resteront inchangés : confiance insuffisante ou catégorie non autorisée.</span></div>}
      <div className="agent-safety"><ShieldCheck size={16} /> Idempotent et réversible : les messages déjà labellisés sont ignorés. Les rapports ne contiennent ni sujet, ni expéditeur, ni identifiant Gmail.</div>
    </div>
  );
}
