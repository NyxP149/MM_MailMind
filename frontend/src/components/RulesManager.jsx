import { Plus, Power, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { CATEGORY_OPTIONS } from '../classification.js';

const fieldLabels = {
  sender: 'Adresse expéditeur',
  domain: 'Domaine expéditeur',
  subject: 'Sujet',
  senderName: 'Nom expéditeur',
};

export function RulesManager({ rules, onAdd, onToggle, onDelete }) {
  const [draft, setDraft] = useState({ field: 'domain', operator: 'contains', value: '', categoryId: 'spam' });
  const [formError, setFormError] = useState('');

  const submit = (event) => {
    event.preventDefault();
    if (!draft.value.trim()) {
      setFormError('Saisissez une valeur à rechercher.');
      return;
    }
    onAdd({ ...draft, value: draft.value.trim() });
    setDraft((current) => ({ ...current, value: '' }));
    setFormError('');
  };

  return (
    <div className="rules-manager">
      <section className="rules-intro">
        <div><span className="eyebrow">Automatisation contrôlée</span><h2>Vos préférences, vos règles</h2><p>Les règles personnalisent la catégorie proposée. Elles ne déclenchent jamais seules une action Gmail.</p></div>
        <span className="rules-count"><strong>{rules.length}</strong> règles</span>
      </section>

      <section className="rule-builder">
        <div className="rule-section-title"><Plus size={18} /><div><h3>Créer une règle</h3><p>La première règle active qui correspond est appliquée.</p></div></div>
        <form onSubmit={submit}>
          <label><span>Si</span><select value={draft.field} onChange={(event) => setDraft({ ...draft, field: event.target.value })}>{Object.entries(fieldLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label><span>Condition</span><select value={draft.operator} onChange={(event) => setDraft({ ...draft, operator: event.target.value })}><option value="contains">contient</option><option value="equals">est exactement</option></select></label>
          <label className="rule-value"><span>Valeur</span><input value={draft.value} onChange={(event) => setDraft({ ...draft, value: event.target.value })} placeholder="exemple.com" /></label>
          <label><span>Alors classer</span><select value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}>{CATEGORY_OPTIONS.map((category) => <option value={category.id} key={category.id}>{category.label}</option>)}</select></label>
          <button type="submit"><Plus size={16} /> Ajouter</button>
        </form>
        {formError && <p className="rule-error">{formError}</p>}
      </section>

      <section className="rules-list-panel">
        <div className="rules-list-head"><div><h3>Règles enregistrées</h3><p>Stockées uniquement dans ce navigateur.</p></div><span><ShieldCheck size={15} /> Aucune action automatique</span></div>
        <div className="rules-list">
          {rules.map((rule) => {
            const category = CATEGORY_OPTIONS.find((item) => item.id === rule.categoryId);
            return (
              <article className={rule.enabled === false ? 'rule-row disabled' : 'rule-row'} key={rule.id}>
                <button className="rule-toggle" onClick={() => onToggle(rule.id)} title={rule.enabled === false ? 'Activer' : 'Désactiver'}><Power size={16} /></button>
                <div className="rule-sentence"><span>Si <b>{fieldLabels[rule.field]}</b> {rule.operator === 'equals' ? 'est exactement' : 'contient'}</span><strong>{rule.value}</strong></div>
                <span className={`rule-category category-${category?.id || 'autre'}`}>{category?.label || 'Autre'}</span>
                <button className="rule-delete" onClick={() => onDelete(rule.id)} title="Supprimer la règle"><Trash2 size={16} /></button>
              </article>
            );
          })}
          {!rules.length && <div className="rules-empty"><Power size={24} /><strong>Aucune règle personnalisée</strong><span>Créez votre première règle ci-dessus.</span></div>}
        </div>
      </section>
    </div>
  );
}
