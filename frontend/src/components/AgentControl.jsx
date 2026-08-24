import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, Bot, CalendarClock, CheckCircle2, Download, Eye, History, Octagon, Play, Power, RefreshCw, ShieldCheck, Tags } from 'lucide-react';
import { AGENT_CATEGORY_OPTIONS, DEFAULT_AGENT_POLICY, buildAgentActivity, buildAgentPlan, createAgentReport } from '../agent.js';
import { api } from '../api.js';

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

function reportModeLabel(mode) {
  if (mode === 'controlled') return 'Lot contrôlé';
  if (mode === 'scheduled-simulation') return 'Simulation planifiée';
  return 'Simulation manuelle';
}

function downloadActivity(activity) {
  const bundle = { version: 1, generatedAt: new Date().toISOString(), metrics: activity.metrics, reports: activity.reports };
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `mailmind-activite-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function AgentControl({ emails, decisions, reports, onSaveReport, onQuarantine }) {
  const [policy, setPolicy] = useState(DEFAULT_AGENT_POLICY);
  const [liveMode, setLiveMode] = useState(false);
  const [armed, setArmed] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [schedule, setSchedule] = useState(null);
  const [scheduleTime, setScheduleTime] = useState('08:00');
  const [scheduleLimit, setScheduleLimit] = useState(50);
  const [scheduledReports, setScheduledReports] = useState([]);
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleError, setScheduleError] = useState('');
  const [activityFilter, setActivityFilter] = useState('all');
  const stopRequested = useRef(false);
  const plan = useMemo(() => buildAgentPlan(emails, policy, decisions), [decisions, emails, policy]);
  const latest = reports[0];
  const latestScheduled = scheduledReports[0];
  const activity = useMemo(() => buildAgentActivity(reports, scheduledReports), [reports, scheduledReports]);
  const visibleActivity = useMemo(() => activity.reports.filter((report) => {
    if (activityFilter === 'all') return true;
    if (activityFilter === 'scheduled') return report.mode === 'scheduled-simulation';
    return report.mode === activityFilter;
  }).slice(0, 10), [activity, activityFilter]);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  useEffect(() => {
    let active = true;
    Promise.all([api.getAgentSchedule(), api.getAgentScheduleReports()])
      .then(([status, payload]) => {
        if (!active) return;
        setSchedule(status);
        setScheduleTime(status.time || '08:00');
        setScheduleLimit(status.maxMessages || 50);
        setScheduledReports(payload.reports || []);
      })
      .catch((error) => active && setScheduleError(error.message));
    return () => { active = false; };
  }, []);

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

  const saveSchedule = async () => {
    setScheduleBusy(true);
    setScheduleError('');
    try {
      const status = await api.saveAgentSchedule({
        time: scheduleTime,
        timeZone,
        maxMessages: scheduleLimit,
        threshold: policy.threshold,
        categories: policy.categories,
      });
      setSchedule(status);
    } catch (error) {
      setScheduleError(error.message);
    } finally {
      setScheduleBusy(false);
    }
  };

  const disableSchedule = async () => {
    setScheduleBusy(true);
    setScheduleError('');
    try {
      setSchedule(await api.disableAgentSchedule());
    } catch (error) {
      setScheduleError(error.message);
    } finally {
      setScheduleBusy(false);
    }
  };

  const runScheduledSimulation = async () => {
    setScheduleBusy(true);
    setScheduleError('');
    try {
      const report = await api.runAgentScheduleNow();
      setScheduledReports((current) => [report, ...current.filter((item) => item.id !== report.id)].slice(0, 20));
    } catch (error) {
      setScheduleError(error.message);
    } finally {
      setScheduleBusy(false);
    }
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

      <section className="agent-schedule">
        <header>
          <div className="agent-schedule-title"><span className="agent-metric-icon blue"><CalendarClock size={18} /></span><div><span className="eyebrow">Planification V7.1</span><h3>Simulation quotidienne contrôlée</h3><p>Le backend analyse le lot à l’heure choisie et prépare un rapport. Aucune action Gmail n’est exécutée.</p></div></div>
          <span className={`agent-schedule-state ${schedule?.enabled ? 'enabled' : ''}`}><Power size={13} /> {schedule?.enabled ? 'Active' : 'Désactivée'}</span>
        </header>
        <div className="agent-schedule-body">
          <div className="agent-schedule-form">
            <label><span>Heure locale</span><input type="time" value={scheduleTime} disabled={scheduleBusy} onChange={(event) => setScheduleTime(event.target.value)} /></label>
            <label><span>Taille du lot</span><select value={scheduleLimit} disabled={scheduleBusy} onChange={(event) => setScheduleLimit(Number(event.target.value))}><option value={10}>10 messages</option><option value={20}>20 messages</option><option value={50}>50 messages</option></select></label>
            <div className="agent-schedule-buttons">
              <button className="agent-schedule-save" disabled={scheduleBusy} onClick={saveSchedule}><CalendarClock size={15} /> {schedule?.enabled ? 'Mettre à jour' : 'Activer'}</button>
              <button disabled={scheduleBusy} onClick={runScheduledSimulation}><RefreshCw className={scheduleBusy ? 'spin' : ''} size={15} /> Simuler maintenant</button>
              {schedule?.enabled && <button className="danger" disabled={scheduleBusy} onClick={disableSchedule}><Power size={15} /> Désactiver</button>}
            </div>
            <small>Fuseau : {timeZone}. La planification reste en mémoire tant que le backend fonctionne et que Gmail reste connecté.</small>
            {scheduleError && <div className="agent-schedule-error"><AlertTriangle size={15} /> {scheduleError}</div>}
          </div>
          <div className="agent-scheduled-report">
            <div><span className="eyebrow">Dernier rapport planifié</span>{latestScheduled && <button onClick={() => downloadReport(latestScheduled)} title="Exporter le rapport planifié"><Download size={15} /></button>}</div>
            {latestScheduled ? <><strong>{formatDate(latestScheduled.completedAt)}</strong><p>{latestScheduled.metrics.analyzed} analysés · {latestScheduled.metrics.eligible} proposés · {latestScheduled.metrics.ambiguous} ambigus</p><span><ShieldCheck size={14} /> 0 action Gmail exécutée</span></> : <><strong>Aucune simulation planifiée</strong><p>Utilisez « Simuler maintenant » ou activez l’horaire quotidien.</p></>}
          </div>
        </div>
      </section>

      <section className="agent-activity-center">
        <header>
          <div className="agent-schedule-title"><span className="agent-metric-icon violet"><History size={18} /></span><div><span className="eyebrow">Centre d’activité V7.2</span><h3>Historique unifié de l’agent</h3><p>Simulations manuelles, planifications et lots contrôlés réunis dans un journal minimisé.</p></div></div>
          <button disabled={!activity.reports.length} onClick={() => downloadActivity(activity)}><Download size={15} /> Exporter tout</button>
        </header>
        <div className="agent-activity-summary">
          <span><b>{activity.metrics.runs}</b> exécutions</span><span><b>{activity.metrics.analyzed}</b> messages analysés</span><span><b>{activity.metrics.simulations}</b> simulations</span><span><b>{activity.metrics.executed}</b> actions</span>
        </div>
        <div className="agent-activity-filters" aria-label="Filtrer l’historique">
          {[['all', 'Tout'], ['simulation', 'Manuelles'], ['scheduled', 'Planifiées'], ['controlled', 'Contrôlées']].map(([value, label]) => <button key={value} className={activityFilter === value ? 'selected' : ''} onClick={() => setActivityFilter(value)}>{label}</button>)}
        </div>
        {visibleActivity.length ? <div className="agent-activity-list">{visibleActivity.map((report) => <article key={report.id}>
          <span className={`agent-activity-mode ${report.mode}`}>{reportModeLabel(report.mode)}</span>
          <div><strong>{formatDate(report.completedAt)}</strong><small>{report.metrics.analyzed} analysés · {report.metrics.eligible || 0} proposés · {report.metrics.ambiguous || 0} ambigus</small></div>
          <div className="agent-activity-result"><b>{report.metrics.executed || 0}</b><span>action(s)</span></div>
          <span className={`agent-activity-status ${report.status}`}>{report.status === 'interrupted' ? 'Interrompu' : report.metrics.failed ? `${report.metrics.failed} échec(s)` : 'Terminé'}</span>
          <button onClick={() => downloadReport(report)} title="Exporter ce rapport"><Download size={14} /></button>
        </article>)}</div> : <div className="agent-activity-empty"><History size={28} /><strong>Aucun rapport dans ce filtre</strong><span>Les prochaines exécutions apparaîtront ici sans contenu d’e-mail.</span></div>}
      </section>

      {plan.ambiguous.length > 0 && <div className="agent-warning"><AlertTriangle size={17} /><span><strong>{plan.ambiguous.length} cas nécessitent votre attention.</strong> Ils resteront inchangés : confiance insuffisante ou catégorie non autorisée.</span></div>}
      <div className="agent-safety"><ShieldCheck size={16} /> Idempotent et réversible : les messages déjà labellisés sont ignorés. Les rapports ne contiennent ni sujet, ni expéditeur, ni identifiant Gmail.</div>
    </div>
  );
}
