import { useCallback, useEffect, useState } from 'react';
import {
  Archive,
  BarChart3,
  Bell,
  Bot,
  ChevronDown,
  ChevronRight,
  Inbox,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Moon,
  RefreshCw,
  Search,
  ScanSearch,
  Send,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tag,
  Sun,
  Trash2,
} from 'lucide-react';
import { api } from './api.js';
import { Brand } from './components/Brand.jsx';
import { EmailRow } from './components/EmailRow.jsx';
import { EmptyState } from './components/EmptyState.jsx';
import { ClassificationOverview } from './components/ClassificationOverview.jsx';
import { QualityDashboard } from './components/QualityDashboard.jsx';
import { Dashboard } from './components/Dashboard.jsx';
import { RulesManager } from './components/RulesManager.jsx';
import { AIAssistant } from './components/AIAssistant.jsx';
import { LearningDashboard } from './components/LearningDashboard.jsx';
import { AgentControl } from './components/AgentControl.jsx';
import { IsolationVault } from './components/IsolationVault.jsx';
import { applyClassificationOverrides, applyCustomRules, applyLearnedPreferences, createLearningExample, mergeEmails, readLocalMap, upsertLearningExample } from './classification.js';
import { resolveTheme, THEME_KEY } from './theme.js';
import { launchUnsubscribe, validateUnsubscribe } from './unsubscribe.js';

const OVERRIDES_KEY = 'mailmind:classification-overrides:v1';
const DECISIONS_KEY = 'mailmind:quarantine-decisions:v1';
const ACTION_HISTORY_KEY = 'mailmind:action-history:v1';
const RULES_KEY = 'mailmind:custom-rules:v1';
const LEARNING_KEY = 'mailmind:learning-examples:v1';
const AGENT_REPORTS_KEY = 'mailmind:agent-reports:v1';
function initialTheme() {
  return resolveTheme(
    localStorage.getItem(THEME_KEY),
    Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches),
  );
}

function ThemeToggle({ theme, onToggle }) {
  const dark = theme === 'dark';
  return (
    <button className="icon-button theme-toggle" onClick={onToggle} aria-label={dark ? 'Activer le thème clair' : 'Activer le thème sombre'} title={dark ? 'Thème clair' : 'Thème sombre'}>
      {dark ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}

const authMessages = {
  invalid_state: 'La vérification de sécurité a échoué. Réessayez.',
  denied: 'L’accès Gmail a été refusé.',
  missing_code: 'Google n’a pas retourné de code d’autorisation.',
  failed: 'La connexion Google a échoué. Vérifiez la configuration OAuth.',
};

function Welcome({ configured, missing }) {
  return (
    <main className="welcome-shell">
      <section className="welcome-copy">
        <span className="eyebrow"><Sparkles size={15} /> Assistant Gmail personnel</span>
        <h1>Votre boîte mail.<br /><em>Enfin claire.</em></h1>
        <p>MailMind rassemble vos e-mails dans un espace calme, lisible et pensé pour vous faire gagner du temps.</p>
        <a className={`google-button ${!configured ? 'is-disabled' : ''}`} href={configured ? api.authUrl : undefined}>
          <span className="google-g">G</span>
          Continuer avec Google
          <ChevronRight size={18} />
        </a>
        {!configured && (
          <div className="setup-notice" role="status">
            <strong>Configuration requise</strong>
            <span>Complétez le fichier <code>backend/.env</code> ({missing?.join(', ')}).</span>
          </div>
        )}
        <div className="privacy-note"><ShieldCheck size={17} /> Actions Gmail manuelles. Aucune suppression définitive.</div>
      </section>
      <section className="welcome-visual" aria-label="Aperçu de MailMind">
        <div className="orb orb-one" />
        <div className="orb orb-two" />
        <div className="preview-card">
          <div className="preview-top"><Brand /><span>● ● ●</span></div>
          <div className="preview-body">
            <div className="preview-sidebar" />
            <div className="preview-list">
              <div className="preview-heading"><span /><span /></div>
              {[0, 1, 2, 3].map((item) => <div className="preview-line" key={item}><i /><span /><b /></div>)}
            </div>
          </div>
        </div>
        <div className="floating-pill pill-top"><ShieldCheck size={17} /> Actions réversibles</div>
        <div className="floating-pill pill-bottom"><Sparkles size={17} /> 20 e-mails chargés</div>
      </section>
    </main>
  );
}

function SkeletonRows() {
  return <div className="skeleton-wrap">{[1, 2, 3, 4, 5].map((i) => <div className="skeleton-row" key={i}><i /><span /><b /></div>)}</div>;
}

export default function App() {
  const [status, setStatus] = useState(null);
  const [emails, setEmails] = useState([]);
  const [nextPageToken, setNextPageToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeView, setActiveView] = useState('inbox');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [classificationOverrides, setClassificationOverrides] = useState(() => readLocalMap(OVERRIDES_KEY));
  const [decisions, setDecisions] = useState(() => readLocalMap(DECISIONS_KEY));
  const [scanTarget, setScanTarget] = useState(100);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanNotice, setScanNotice] = useState('');
  const [gmailBusyId, setGmailBusyId] = useState(null);
  const [isolation, setIsolation] = useState({ label: 'MailMind/À supprimer', messages: [], total: 0, nextPageToken: null, alertThreshold: 300 });
  const [isolationLoading, setIsolationLoading] = useState(false);
  const [isolationBulkBusy, setIsolationBulkBusy] = useState(false);
  const [actionHistory, setActionHistory] = useState(() => {
    const stored = readLocalMap(ACTION_HISTORY_KEY);
    return Array.isArray(stored) ? stored : [];
  });
  const [customRules, setCustomRules] = useState(() => {
    const stored = readLocalMap(RULES_KEY);
    return Array.isArray(stored) ? stored : [];
  });
  const [learningExamples, setLearningExamples] = useState(() => {
    const stored = readLocalMap(LEARNING_KEY);
    return Array.isArray(stored) ? stored : [];
  });
  const [agentReports, setAgentReports] = useState(() => {
    const stored = readLocalMap(AGENT_REPORTS_KEY);
    return Array.isArray(stored) ? stored : [];
  });
  const [theme, setTheme] = useState(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0f1514' : '#101b19');
  }, [theme]);

  useEffect(() => {
    if (!emails.length) return;
    const imported = Object.entries(classificationOverrides).reduce((current, [emailId, override]) => {
      const email = emails.find((item) => item.id === emailId);
      return upsertLearningExample(current, createLearningExample(email, override.categoryId, override.correctedAt));
    }, learningExamples);
    if (JSON.stringify(imported) !== JSON.stringify(learningExamples)) {
      localStorage.setItem(LEARNING_KEY, JSON.stringify(imported));
      setLearningExamples(imported);
    }
  }, [classificationOverrides, emails, learningExamples]);

  const loadEmails = useCallback(async (pageToken) => {
    pageToken ? setLoadingMore(true) : setLoading(true);
    setError('');
    try {
      const data = await api.getEmails(pageToken);
      setEmails((current) => pageToken ? [...current, ...data.messages] : data.messages);
      setNextPageToken(data.nextPageToken);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const loadIsolation = useCallback(async (pageToken) => {
    setIsolationLoading(true);
    try {
      const data = await api.getIsolation(pageToken);
      setIsolation((current) => pageToken
        ? { ...data, messages: mergeEmails(current.messages, data.messages) }
        : data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsolationLoading(false);
    }
  }, []);

  useEffect(() => {
    const authResult = new URLSearchParams(window.location.search).get('auth');
    if (authResult && authResult !== 'success') setError(authMessages[authResult] || 'Connexion impossible.');
    if (authResult) window.history.replaceState({}, '', window.location.pathname);

    api.getStatus()
      .then((data) => {
        setStatus(data);
        if (data.connected) return Promise.all([loadEmails(), loadIsolation()]);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setStatus({ connected: false, configured: false });
        setLoading(false);
      });
  }, [loadEmails, loadIsolation]);

  const logout = async () => {
    await api.logout();
    setStatus({ connected: false, configured: true });
    setEmails([]);
    setIsolation({ label: 'MailMind/À supprimer', messages: [], total: 0, nextPageToken: null, alertThreshold: 300 });
  };

  const ruledEmails = applyCustomRules(emails, customRules);
  const learnedEmails = applyLearnedPreferences(ruledEmails, learningExamples);
  const effectiveEmails = applyClassificationOverrides(learnedEmails, classificationOverrides);

  const visibleEmails = effectiveEmails.filter((email) => {
    const haystack = `${email.subject} ${email.from.name} ${email.from.email} ${email.snippet}`.toLowerCase();
    const matchesQuery = haystack.includes(query.toLowerCase());
    if (!matchesQuery) return false;
    if (activeView === 'quarantine') return email.classification?.action === 'quarantine' && decisions[email.id] !== 'safe';
    if (activeView === 'categories' && selectedCategory) return email.classification?.id === selectedCategory;
    return true;
  });
  const unsubscribeCount = visibleEmails.filter((email) => email.unsubscribe?.available).length;

  const viewCopy = {
    inbox: { eyebrow: 'Boîte de réception', title: 'Bonjour 👋', description: 'Voici les derniers messages de votre boîte Gmail.', panel: 'Messages récents' },
    categories: { eyebrow: 'Analyse par règles', title: 'Catégories', description: 'Comprenez pourquoi MailMind classe chaque message.', panel: selectedCategory ? 'Messages filtrés' : 'Tous les messages analysés' },
    quarantine: { eyebrow: 'Zone protégée', title: 'Quarantaine', description: 'Validez chaque suggestion avant d’appliquer un label réversible dans Gmail.', panel: 'À vérifier en priorité' },
    vault: { eyebrow: 'Nettoyage V9', title: 'Sas d’isolation', description: 'Vérifiez, restaurez ou éliminez manuellement les messages isolés dans Gmail.', panel: 'Messages isolés' },
    quality: { eyebrow: 'Évaluation V2', title: 'Qualité des règles', description: 'Mesurez la précision des suggestions à partir de vos validations.', panel: 'Messages évalués' },
    dashboard: { eyebrow: 'Tableau de bord V3', title: 'Votre activité', description: 'Suivez les analyses, validations et actions réversibles de MailMind.', panel: 'Activité' },
    rules: { eyebrow: 'Personnalisation V4', title: 'Règles personnalisées', description: 'Adaptez les suggestions MailMind à vos propres préférences.', panel: 'Règles' },
    assistant: { eyebrow: 'Assistant V5', title: 'Intelligence artificielle', description: 'Demandez une analyse approfondie, message par message.', panel: 'Assistant' },
    learning: { eyebrow: 'Apprentissage V6', title: 'Préférences apprises', description: 'Comprenez comment vos corrections améliorent MailMind.', panel: 'Apprentissage' },
    agent: { eyebrow: 'Agent contrôlé V7', title: 'Automatisation maîtrisée', description: 'Simulez, autorisez et interrompez des lots d’actions réversibles.', panel: 'Agent autonome' },
  }[activeView];

  const changeView = (view) => {
    setActiveView(view);
    if (view !== 'categories') setSelectedCategory(null);
    setSidebarOpen(false);
  };

  const updateCategory = (emailId, categoryId) => {
    const correctedAt = new Date().toISOString();
    setClassificationOverrides((current) => {
      const next = { ...current, [emailId]: { categoryId, correctedAt } };
      localStorage.setItem(OVERRIDES_KEY, JSON.stringify(next));
      return next;
    });
    const sourceEmail = emails.find((email) => email.id === emailId);
    const example = createLearningExample(sourceEmail, categoryId, correctedAt);
    if (example) {
      setLearningExamples((current) => {
        const next = upsertLearningExample(current, example);
        localStorage.setItem(LEARNING_KEY, JSON.stringify(next));
        return next;
      });
    }
  };

  const resetLearning = () => {
    if (!window.confirm('Réinitialiser toutes les préférences apprises par MailMind ?\n\nVos corrections de messages resteront intactes.')) return;
    localStorage.removeItem(LEARNING_KEY);
    setLearningExamples([]);
  };

  const updateDecision = (emailId, decision) => {
    setDecisions((current) => {
      const next = { ...current };
      if (decision) next[emailId] = decision;
      else delete next[emailId];
      localStorage.setItem(DECISIONS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const persistRules = (next) => {
    localStorage.setItem(RULES_KEY, JSON.stringify(next));
    setCustomRules(next);
  };

  const addCustomRule = (draft) => {
    persistRules([{
      ...draft,
      id: globalThis.crypto?.randomUUID?.() || `rule-${Date.now()}`,
      enabled: true,
      createdAt: new Date().toISOString(),
    }, ...customRules]);
  };

  const toggleCustomRule = (ruleId) => {
    persistRules(customRules.map((rule) => rule.id === ruleId ? { ...rule, enabled: rule.enabled === false } : rule));
  };

  const deleteCustomRule = (ruleId) => {
    if (!window.confirm('Supprimer cette règle personnalisée ?')) return;
    persistRules(customRules.filter((rule) => rule.id !== ruleId));
  };

  const scanMailbox = async () => {
    if (scanning) return;
    if (emails.length >= scanTarget) {
      setScanNotice(`${emails.length} messages sont déjà chargés.`);
      return;
    }
    if (!nextPageToken) {
      setScanNotice('Tous les messages disponibles ont déjà été chargés.');
      return;
    }

    setScanning(true);
    setError('');
    setScanNotice('');
    setScanProgress(emails.length);
    let collected = [...emails];
    let pageToken = nextPageToken;

    try {
      while (pageToken && collected.length < scanTarget) {
        const limit = Math.min(50, scanTarget - collected.length);
        const data = await api.getEmails(pageToken, limit);
        collected = mergeEmails(collected, data.messages);
        pageToken = data.nextPageToken;
        setEmails(collected);
        setNextPageToken(pageToken);
        setScanProgress(collected.length);
      }

      setScanNotice(
        pageToken
          ? `${collected.length} messages analysés. Vous pouvez poursuivre avec un lot plus grand.`
          : `Analyse terminée : ${collected.length} messages disponibles ont été traités.`,
      );
    } catch (err) {
      setError(`Le scan s’est interrompu après ${collected.length} messages : ${err.message}`);
    } finally {
      setScanning(false);
    }
  };

  const applyGmailAction = async (email, action) => {
    const isolate = action === 'isolate';
    const accepted = window.confirm(
      isolate
        ? `Isoler « ${email.subject} » dans « MailMind/À supprimer » ?\n\nLe message sera archivé et restera accessible dans Gmail. Il ne sera ni envoyé au Spam ni supprimé.`
        : `Restaurer « ${email.subject} » dans la boîte de réception et le retirer du sas MailMind ?`,
    );
    if (!accepted) return;

    setGmailBusyId(email.id);
    setError('');
    try {
      const result = isolate
        ? await api.isolateEmail(email.id)
        : await api.restoreEmail(email.id);
      setEmails((current) => current.map((item) => item.id === email.id ? { ...item, quarantined: result.quarantined } : item));
      setActionHistory((current) => {
        const next = [{
          action,
          at: new Date().toISOString(),
          category: email.classification?.id || 'autre',
          categoryLabel: email.classification?.label || 'Autre',
        }, ...current].slice(0, 100);
        localStorage.setItem(ACTION_HISTORY_KEY, JSON.stringify(next));
        return next;
      });
      await loadIsolation();
      setScanNotice(result.quarantined ? 'Message isolé dans MailMind/À supprimer.' : 'Message restauré dans la boîte de réception.');
    } catch (err) {
      setError(err.message);
    } finally {
      setGmailBusyId(null);
    }
  };

  const applyIsolationAction = async (email, action) => {
    const prompts = {
      restore: `Restaurer « ${email.subject} » dans la boîte de réception ?`,
      spam: `Signaler « ${email.subject} » comme spam ?\n\nGoogle pourra analyser ce message et classer plus sévèrement les futurs messages similaires.`,
      trash: `Mettre « ${email.subject} » à la corbeille ?\n\nLe message restera récupérable depuis la corbeille Gmail.`,
    };
    if (!window.confirm(prompts[action])) return;
    setGmailBusyId(email.id);
    setError('');
    try {
      if (action === 'restore') await api.restoreEmail(email.id);
      else if (action === 'spam') await api.markIsolationSpam(email.id);
      else await api.trashIsolatedEmail(email.id);
      setActionHistory((current) => {
        const next = [{ action: `isolation-${action}`, at: new Date().toISOString(), category: email.classification?.id || 'autre', categoryLabel: email.classification?.label || 'Autre' }, ...current].slice(0, 100);
        localStorage.setItem(ACTION_HISTORY_KEY, JSON.stringify(next));
        return next;
      });
      setEmails((current) => current.map((item) => item.id === email.id ? { ...item, quarantined: false } : item));
      await loadIsolation();
      setScanNotice(action === 'restore' ? 'Message restauré dans la réception.' : action === 'spam' ? 'Message signalé comme spam.' : 'Message déplacé vers la corbeille.');
    } catch (err) {
      setError(err.message);
    } finally {
      setGmailBusyId(null);
    }
  };

  const unsubscribeEmail = (email) => {
    const unsubscribe = validateUnsubscribe(email.unsubscribe);
    if (!unsubscribe) {
      setError('Cet expéditeur ne fournit pas de mécanisme de désabonnement sûr et compatible.');
      return;
    }
    const risky = ['spam', 'arnaque', 'adultes', 'rencontres'].includes(email.classification?.id);
    const destination = unsubscribe.host || unsubscribe.address;
    const method = unsubscribe.method === 'one-click'
      ? 'une requête de désabonnement one-click sera envoyée'
      : unsubscribe.method === 'web'
        ? 'la page de désabonnement sera ouverte'
        : 'votre application de messagerie préparera un e-mail de désabonnement';
    const warning = risky
      ? '\n\nAttention : ce message est classé à risque. Se désabonner peut confirmer que votre adresse est active. Le signalement comme Spam est généralement plus sûr.'
      : '\n\nContinuez uniquement si vous reconnaissez cet expéditeur. Pour un spam ou une arnaque, utilisez plutôt le signalement Spam.';
    if (!window.confirm(`Se désabonner de « ${email.from.name} » ?\n\nDestination externe : ${destination}\n${method}. MailMind ne peut pas garantir le traitement par l’expéditeur.${warning}`)) return;

    try {
      const launched = launchUnsubscribe(unsubscribe);
      setActionHistory((current) => {
        const next = [{ action: `unsubscribe-${launched}`, at: new Date().toISOString(), category: email.classification?.id || 'autre', categoryLabel: email.classification?.label || 'Autre' }, ...current].slice(0, 100);
        localStorage.setItem(ACTION_HISTORY_KEY, JSON.stringify(next));
        return next;
      });
      setError('');
      setScanNotice(launched === 'one-click' ? 'Demande de désabonnement transmise au service indiqué par l’expéditeur.' : launched === 'web' ? 'Page de désabonnement ouverte : terminez la procédure sur le site externe.' : 'E-mail de désabonnement préparé : vérifiez-le avant de l’envoyer.');
    } catch (err) {
      setError(err.message);
    }
  };

  const trashAllIsolation = async () => {
    const count = Number(isolation.total || 0);
    if (!count) return;
    const confirmation = window.prompt(`Mettre les ${count} messages du sas à la corbeille ?\n\nCette action ne touche pas les autres messages Gmail. Saisissez exactement : CORBEILLE ${count}`);
    if (confirmation !== `CORBEILLE ${count}`) {
      if (confirmation !== null) setError('Confirmation incorrecte : aucun message n’a été déplacé.');
      return;
    }
    setIsolationBulkBusy(true);
    setError('');
    try {
      const result = await api.trashAllIsolated(count, confirmation);
      await loadIsolation();
      setScanNotice(`${result.trashed} message(s) déplacé(s) vers la corbeille${result.failed ? `, ${result.failed} échec(s)` : ''}.`);
    } catch (err) {
      setError(err.message);
      await loadIsolation();
    } finally {
      setIsolationBulkBusy(false);
    }
  };

  const saveAgentReport = (report) => {
    setAgentReports((current) => {
      const next = [report, ...current.filter((item) => item.id !== report.id)].slice(0, 30);
      localStorage.setItem(AGENT_REPORTS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const applyAgentQuarantine = async (item, runId) => {
    const result = await api.quarantineEmail(item.messageId);
    setEmails((current) => current.map((email) => email.id === item.messageId ? { ...email, quarantined: result.quarantined } : email));
    setActionHistory((current) => {
      const next = [{
        action: 'quarantine',
        source: 'agent-v7',
        runId,
        at: new Date().toISOString(),
        category: item.categoryId,
        categoryLabel: item.categoryLabel,
      }, ...current].slice(0, 100);
      localStorage.setItem(ACTION_HISTORY_KEY, JSON.stringify(next));
      return next;
    });
    return result;
  };

  if (!status && loading) return <div className="app-loader"><Brand /><span /></div>;
  if (!status?.connected) {
    return <div className="welcome-page"><header className="welcome-header"><Brand /><ThemeToggle theme={theme} onToggle={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')} /></header>{error && <div className="toast error-toast">{error}</div>}<Welcome configured={status?.configured} missing={status?.missing} /></div>;
  }

  return (
    <div className="app-shell">
      <aside className={sidebarOpen ? 'sidebar is-open' : 'sidebar'}>
        <div className="sidebar-brand"><Brand /><button className="icon-button mobile-only" onClick={() => setSidebarOpen(false)} aria-label="Fermer le menu">×</button></div>
        <nav>
          <span className="nav-label">Espace de travail</span>
          <button className={activeView === 'inbox' ? 'nav-item active' : 'nav-item'} onClick={() => changeView('inbox')}><Inbox size={19} /> Boîte de réception <b>{status.profile?.messagesTotal?.toLocaleString('fr-FR')}</b></button>
          <a className="nav-item" href="#sent"><Send size={19} /> Envoyés</a>
          <a className="nav-item" href="#archive"><Archive size={19} /> Archives</a>
          <span className="nav-label second">MailMind</span>
          <button className={activeView === 'dashboard' ? 'nav-item active' : 'nav-item'} onClick={() => changeView('dashboard')}><LayoutDashboard size={19} /> Tableau de bord <span className="v3-badge">V3</span></button>
          <button className={activeView === 'categories' ? 'nav-item active' : 'nav-item'} onClick={() => changeView('categories')}><Tag size={19} /> Catégories <span className="v2-badge">V2</span></button>
          <button className={activeView === 'quarantine' ? 'nav-item active' : 'nav-item'} onClick={() => changeView('quarantine')}><ShieldAlert size={19} /> Quarantaine <b>{effectiveEmails.filter((email) => email.classification?.action === 'quarantine' && decisions[email.id] !== 'safe').length}</b></button>
          <button className={activeView === 'vault' ? 'nav-item active' : 'nav-item'} onClick={() => changeView('vault')}><Trash2 size={19} /> Sas de nettoyage <b>{isolation.total}</b></button>
          <button className={activeView === 'quality' ? 'nav-item active' : 'nav-item'} onClick={() => changeView('quality')}><BarChart3 size={19} /> Qualité <span className="v2-badge">V2</span></button>
          <button className={activeView === 'rules' ? 'nav-item active' : 'nav-item'} onClick={() => changeView('rules')}><ListChecks size={19} /> Règles <span className="v4-badge">V4</span></button>
          <button className={activeView === 'assistant' ? 'nav-item active' : 'nav-item'} onClick={() => changeView('assistant')}><Sparkles size={19} /> Assistant <span className="v5-badge">V5</span></button>
          <button className={activeView === 'learning' ? 'nav-item active' : 'nav-item'} onClick={() => changeView('learning')}><GraduationCap size={19} /> Apprentissage <span className="v6-badge">V6</span></button>
          <button className={activeView === 'agent' ? 'nav-item active' : 'nav-item'} onClick={() => changeView('agent')}><Bot size={19} /> Agent contrôlé <span className="v7-badge">V7</span></button>
        </nav>
        <div className="sidebar-footer">
          <div className="privacy-card"><ShieldCheck size={20} /><div><strong>Vos données restent privées</strong><span>{status.deployment?.persistence ? 'Jetons chiffrés · Contrôles V10' : 'Actions Gmail manuelles'}</span></div></div>
          <button className="account-button"><span>{status.profile?.email?.[0]?.toUpperCase()}</span><div><strong>{status.profile?.email?.split('@')[0]}</strong><small>{status.profile?.email}</small></div><ChevronDown size={16} /></button>
          <button className="logout-button" onClick={logout}><LogOut size={16} /> Déconnecter Gmail</button>
          <div className="powered-by">Powered by <strong>JarVyX</strong></div>
        </div>
      </aside>

      <div className="content-shell">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setSidebarOpen(true)} aria-label="Ouvrir le menu"><Menu /></button>
          <label className="search-box"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher dans vos e-mails…" /><kbd>⌘ K</kbd></label>
          <div className="top-actions"><ThemeToggle theme={theme} onToggle={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')} /><button className="icon-button" aria-label="Notifications"><Bell size={20} /></button><button className="icon-button" aria-label="Réglages"><Settings size={20} /></button></div>
        </header>

        <main className="inbox-main" id={activeView}>
          <div className="inbox-heading">
            <div><span className="eyebrow">{viewCopy.eyebrow}</span><h1>{viewCopy.title}</h1><p>{viewCopy.description}</p></div>
            {activeView !== 'vault' && <div className="heading-actions">
              <div className="scan-control">
                <select value={scanTarget} onChange={(event) => setScanTarget(Number(event.target.value))} disabled={scanning} aria-label="Nombre de messages à analyser">
                  <option value={50}>50 messages</option>
                  <option value={100}>100 messages</option>
                  <option value={250}>250 messages</option>
                </select>
                <button onClick={scanMailbox} disabled={scanning || loading || !nextPageToken}>
                  <ScanSearch size={17} className={scanning ? 'spin' : ''} />
                  {scanning ? `${scanProgress}/${scanTarget}` : 'Analyser plus'}
                </button>
              </div>
              <button className="refresh-button" onClick={() => { setScanNotice(''); loadEmails(); }} disabled={loading || scanning}><RefreshCw size={17} className={loading ? 'spin' : ''} /> Actualiser</button>
            </div>}
          </div>
          {error && <div className="inline-error" role="alert">{error}<button onClick={() => loadEmails()}>Réessayer</button></div>}
          {scanNotice && <div className="scan-notice" role="status"><ScanSearch size={16} /> {scanNotice}</div>}
          {activeView !== 'inbox' && activeView !== 'vault' && activeView !== 'quality' && activeView !== 'dashboard' && activeView !== 'rules' && activeView !== 'assistant' && activeView !== 'learning' && activeView !== 'agent' && !loading && (
            <ClassificationOverview emails={effectiveEmails} selectedCategory={selectedCategory} onSelectCategory={setSelectedCategory} decisions={decisions} />
          )}
          {activeView === 'vault' ? (
            <IsolationVault data={isolation} loading={isolationLoading} busyId={gmailBusyId} bulkBusy={isolationBulkBusy} onRefresh={() => loadIsolation()} onLoadMore={() => loadIsolation(isolation.nextPageToken)} onAction={applyIsolationAction} onTrashAll={trashAllIsolation} onUnsubscribe={unsubscribeEmail} />
          ) : activeView === 'learning' && !loading ? (
            <LearningDashboard examples={learningExamples} onReset={resetLearning} />
          ) : activeView === 'agent' && !loading ? (
            <AgentControl emails={effectiveEmails} decisions={decisions} reports={agentReports} onSaveReport={saveAgentReport} onQuarantine={applyAgentQuarantine} />
          ) : activeView === 'assistant' && !loading ? (
            <AIAssistant emails={effectiveEmails} configured={status.ai?.configured} model={status.ai?.model} provider={status.ai?.provider} />
          ) : activeView === 'rules' && !loading ? (
            <RulesManager rules={customRules} onAdd={addCustomRule} onToggle={toggleCustomRule} onDelete={deleteCustomRule} />
          ) : activeView === 'dashboard' && !loading ? (
            <Dashboard emails={effectiveEmails} decisions={decisions} history={actionHistory} />
          ) : activeView === 'quality' && !loading ? (
            <QualityDashboard emails={effectiveEmails} rawEmails={emails} decisions={decisions} overrides={classificationOverrides} />
          ) : (
            <section className="mail-panel">
              <div className="panel-head"><div><h2>{viewCopy.panel}</h2><span>{visibleEmails.length} affichés · {unsubscribeCount} désabonnement(s)</span></div><span className="safe-badge"><ShieldCheck size={15} /> Confirmation manuelle</span></div>
              {loading ? <SkeletonRows /> : visibleEmails.length ? <div className="email-list">{visibleEmails.map((email, index) => <EmailRow key={email.id} email={email} index={index} editable={activeView !== 'inbox'} decision={decisions[email.id]} onCategoryChange={updateCategory} onDecision={activeView === 'quarantine' ? updateDecision : undefined} onGmailAction={activeView === 'quarantine' ? applyGmailAction : undefined} onUnsubscribe={unsubscribeEmail} gmailBusy={gmailBusyId === email.id} />)}</div> : <EmptyState />}
              {nextPageToken && !query && <div className="load-more"><button onClick={() => loadEmails(nextPageToken)} disabled={loadingMore}>{loadingMore ? 'Chargement…' : 'Afficher plus de messages'}</button></div>}
            </section>
          )}
          <p className="v1-note"><ShieldCheck size={15} /> {activeView === 'assistant' ? 'Version 5 — L’IA conseille uniquement après votre consentement. Aucune action Gmail.' : activeView === 'learning' ? 'Version 6 — L’apprentissage reste local, explicable et réversible. Aucune action Gmail.' : activeView === 'agent' ? 'Version 7 — Seuls les labels explicitement autorisés sont appliqués. Aucune suppression.' : activeView === 'vault' ? 'Version 10 — Nettoyage et désabonnement exigent toujours votre confirmation. Aucune suppression définitive.' : 'Version 10 — Les désabonnements utilisent uniquement les mécanismes déclarés par l’expéditeur et restent manuels.'}</p>
        </main>
      </div>
      {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="Fermer le menu" />}
    </div>
  );
}
