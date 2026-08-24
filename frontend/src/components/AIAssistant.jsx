import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BrainCircuit, CheckCircle2, LoaderCircle, LockKeyhole, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { api } from '../api.js';

const categoryLabels = {
  adultes: 'Adultes',
  rencontres: 'Rencontres',
  spam: 'Spam',
  arnaque: 'Arnaque',
  newsletter: 'Newsletter',
  publicite: 'Publicité',
  facture: 'Facture',
  travail: 'Travail',
  important: 'Important',
  autre: 'Autre',
};

const recommendationLabels = {
  conserver: 'Conserver',
  verifier: 'Vérifier manuellement',
  quarantaine: 'Quarantaine réversible',
};

function domainOf(email) {
  return email?.from?.email?.split('@')[1]?.toLowerCase() || 'domaine inconnu';
}

export function AIAssistant({ emails, configured, model }) {
  const [selectedId, setSelectedId] = useState(emails[0]?.id || '');
  const [consented, setConsented] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!emails.some((email) => email.id === selectedId)) setSelectedId(emails[0]?.id || '');
  }, [emails, selectedId]);

  const selected = useMemo(() => emails.find((email) => email.id === selectedId), [emails, selectedId]);

  const changeMessage = (event) => {
    setSelectedId(event.target.value);
    setConsented(false);
    setResult(null);
    setError('');
  };

  const analyze = async () => {
    if (!selected || !consented || loading) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const response = await api.analyzeEmail({
        subject: selected.subject,
        senderDomain: domainOf(selected),
        snippet: selected.snippet,
        ruleSuggestion: selected.classification?.label || 'Autre',
      });
      setResult(response);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="ai-assistant">
      <div className="ai-hero">
        <div>
          <span className="eyebrow"><Sparkles size={14} /> Intelligence assistée</span>
          <h2>Une seconde lecture, quand vous la demandez.</h2>
          <p>L’IA résume et évalue un seul message à la fois. Elle ne déclenche aucune action Gmail.</p>
        </div>
        <div className="ai-hero-mark"><BrainCircuit size={30} /><span>V5</span></div>
      </div>

      {!configured ? (
        <div className="ai-setup" role="status">
          <LockKeyhole size={24} />
          <div><strong>Assistant IA non configuré</strong><p>Ajoutez <code>OPENAI_API_KEY</code> dans <code>backend/.env</code>, puis redémarrez MailMind.</p></div>
        </div>
      ) : (
        <div className="ai-workspace">
          <div className="ai-request-card">
            <div className="ai-section-head"><div><span>01</span><div><h3>Choisir un message</h3><p>Sélection parmi les e-mails déjà chargés.</p></div></div><small>{model}</small></div>
            <label className="ai-message-select">
              <span>Message à analyser</span>
              <select value={selectedId} onChange={changeMessage}>
                {emails.map((email) => <option key={email.id} value={email.id}>{email.from.name} — {email.subject}</option>)}
              </select>
            </label>

            {selected && (
              <div className="ai-data-preview">
                <div><span>Sujet</span><strong>{selected.subject}</strong></div>
                <div><span>Domaine expéditeur</span><strong>{domainOf(selected)}</strong></div>
                <div><span>Aperçu envoyé</span><p>{selected.snippet || 'Aucun aperçu disponible'}</p></div>
                <div><span>Suggestion locale</span><strong>{selected.classification?.label || 'Autre'}</strong></div>
              </div>
            )}

            <label className="ai-consent">
              <input type="checkbox" checked={consented} onChange={(event) => setConsented(event.target.checked)} />
              <span>J’autorise l’envoi à OpenAI du sujet, du domaine expéditeur, de l’aperçu et de la suggestion locale affichés ci-dessus.</span>
            </label>
            <button className="ai-analyze-button" onClick={analyze} disabled={!selected || !consented || loading}>
              {loading ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}
              {loading ? 'Analyse en cours…' : 'Analyser avec l’IA'}
            </button>
            {error && <div className="ai-error" role="alert"><AlertTriangle size={17} /> {error}</div>}
          </div>

          <div className="ai-result-card">
            <div className="ai-section-head"><div><span>02</span><div><h3>Lecture IA</h3><p>Résultat consultatif et explicable.</p></div></div><ShieldCheck size={20} /></div>
            {result ? (
              <div className="ai-result">
                <div className="ai-result-top">
                  <span className={`ai-risk risk-${result.analysis.riskLevel}`}>Risque {result.analysis.riskLevel}</span>
                  <strong>{Math.round(result.analysis.confidence * 100)}% de confiance</strong>
                </div>
                <h3>{categoryLabels[result.analysis.category] || result.analysis.category}</h3>
                <p className="ai-summary">{result.analysis.summary}</p>
                <dl>
                  <div><dt>Intention</dt><dd>{result.analysis.intention}</dd></div>
                  <div><dt>Recommandation</dt><dd>{recommendationLabels[result.analysis.recommendation] || result.analysis.recommendation}</dd></div>
                </dl>
                <div className="ai-reasons"><span>Pourquoi</span>{result.analysis.reasons.map((reason) => <p key={reason}><CheckCircle2 size={14} /> {reason}</p>)}</div>
                <small>Modèle utilisé : {result.model}</small>
              </div>
            ) : (
              <div className="ai-result-empty"><BrainCircuit size={35} /><strong>Prêt pour une analyse</strong><span>Le résultat apparaîtra ici après votre consentement.</span></div>
            )}
          </div>
        </div>
      )}

      <div className="ai-safety"><ShieldCheck size={16} /> Réponse non stockée par la requête MailMind. Aucune modification Gmail, aucune suppression automatique.</div>
    </section>
  );
}
