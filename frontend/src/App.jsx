import { useCallback, useEffect, useState } from 'react';
import {
  Archive,
  Bell,
  ChevronDown,
  ChevronRight,
  Inbox,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Tag,
} from 'lucide-react';
import { api } from './api.js';
import { Brand } from './components/Brand.jsx';
import { EmailRow } from './components/EmailRow.jsx';
import { EmptyState } from './components/EmptyState.jsx';

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
        <div className="privacy-note"><ShieldCheck size={17} /> Accès en lecture seule. Aucun e-mail n’est supprimé.</div>
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
        <div className="floating-pill pill-top"><ShieldCheck size={17} /> Lecture seule</div>
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

  useEffect(() => {
    const authResult = new URLSearchParams(window.location.search).get('auth');
    if (authResult && authResult !== 'success') setError(authMessages[authResult] || 'Connexion impossible.');
    if (authResult) window.history.replaceState({}, '', window.location.pathname);

    api.getStatus()
      .then((data) => {
        setStatus(data);
        if (data.connected) return loadEmails();
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setStatus({ connected: false, configured: false });
        setLoading(false);
      });
  }, [loadEmails]);

  const logout = async () => {
    await api.logout();
    setStatus({ connected: false, configured: true });
    setEmails([]);
  };

  const visibleEmails = emails.filter((email) => {
    const haystack = `${email.subject} ${email.from.name} ${email.from.email} ${email.snippet}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  if (!status && loading) return <div className="app-loader"><Brand /><span /></div>;
  if (!status?.connected) {
    return <div className="welcome-page"><header className="welcome-header"><Brand /></header>{error && <div className="toast error-toast">{error}</div>}<Welcome configured={status?.configured} missing={status?.missing} /></div>;
  }

  return (
    <div className="app-shell">
      <aside className={sidebarOpen ? 'sidebar is-open' : 'sidebar'}>
        <div className="sidebar-brand"><Brand /><button className="icon-button mobile-only" onClick={() => setSidebarOpen(false)} aria-label="Fermer le menu">×</button></div>
        <nav>
          <span className="nav-label">Espace de travail</span>
          <a className="nav-item active" href="#inbox"><Inbox size={19} /> Boîte de réception <b>{status.profile?.messagesTotal?.toLocaleString('fr-FR')}</b></a>
          <a className="nav-item" href="#sent"><Send size={19} /> Envoyés</a>
          <a className="nav-item" href="#archive"><Archive size={19} /> Archives</a>
          <span className="nav-label second">MailMind</span>
          <a className="nav-item" href="#categories"><Tag size={19} /> Catégories <span className="soon">Bientôt</span></a>
          <a className="nav-item" href="#assistant"><Sparkles size={19} /> Assistant <span className="soon">Bientôt</span></a>
        </nav>
        <div className="sidebar-footer">
          <div className="privacy-card"><ShieldCheck size={20} /><div><strong>Vos données restent privées</strong><span>Lecture seule via Google</span></div></div>
          <button className="account-button"><span>{status.profile?.email?.[0]?.toUpperCase()}</span><div><strong>{status.profile?.email?.split('@')[0]}</strong><small>{status.profile?.email}</small></div><ChevronDown size={16} /></button>
          <button className="logout-button" onClick={logout}><LogOut size={16} /> Déconnecter Gmail</button>
        </div>
      </aside>

      <div className="content-shell">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setSidebarOpen(true)} aria-label="Ouvrir le menu"><Menu /></button>
          <label className="search-box"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher dans vos e-mails…" /><kbd>⌘ K</kbd></label>
          <div className="top-actions"><button className="icon-button" aria-label="Notifications"><Bell size={20} /></button><button className="icon-button" aria-label="Réglages"><Settings size={20} /></button></div>
        </header>

        <main className="inbox-main" id="inbox">
          <div className="inbox-heading">
            <div><span className="eyebrow">Boîte de réception</span><h1>Bonjour 👋</h1><p>Voici les derniers messages de votre boîte Gmail.</p></div>
            <button className="refresh-button" onClick={() => loadEmails()} disabled={loading}><RefreshCw size={17} className={loading ? 'spin' : ''} /> Actualiser</button>
          </div>
          {error && <div className="inline-error" role="alert">{error}<button onClick={() => loadEmails()}>Réessayer</button></div>}
          <section className="mail-panel">
            <div className="panel-head"><div><h2>Messages récents</h2><span>{visibleEmails.length} affichés</span></div><span className="safe-badge"><ShieldCheck size={15} /> Lecture seule</span></div>
            {loading ? <SkeletonRows /> : visibleEmails.length ? <div className="email-list">{visibleEmails.map((email, index) => <EmailRow key={email.id} email={email} index={index} />)}</div> : <EmptyState />}
            {nextPageToken && !query && <div className="load-more"><button onClick={() => loadEmails(nextPageToken)} disabled={loadingMore}>{loadingMore ? 'Chargement…' : 'Afficher plus de messages'}</button></div>}
          </section>
          <p className="v1-note"><ShieldCheck size={15} /> Version 1 — MailMind ne peut ni modifier ni supprimer vos e-mails.</p>
        </main>
      </div>
      {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="Fermer le menu" />}
    </div>
  );
}

