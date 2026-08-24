const CATEGORY_RULES = [
  {
    id: 'arnaque',
    label: 'Arnaque',
    action: 'quarantine',
    terms: [
      ['verify your account', 4], ['compte suspendu', 4], ['mot de passe expire', 4],
      ['password expires', 4], ['claim your prize', 4], ['vous avez gagne', 4],
      ['wire transfer', 3], ['crypto investment', 3], ['urgent action required', 3],
      ['gift card', 2], ['inheritance', 2], ['wallet', 1],
    ],
  },
  {
    id: 'adultes',
    label: 'Adultes',
    action: 'quarantine',
    terms: [
      ['adult', 3], ['xxx', 4], ['nude', 3], ['naked', 3], ['webcam', 3],
      ['sexy', 2], ['explicit', 3], ['hot video', 3], ['private album', 2],
      ['video unlocked', 3], ['bare skin', 3], ['exposed pics', 4], ['dirty game', 3],
      ['filthy', 3], ['contenu adulte', 4], ['libertin', 3], ['escort', 3], ['intimate', 2],
    ],
  },
  {
    id: 'rencontres',
    label: 'Rencontres',
    action: 'quarantine',
    terms: [
      ['dating', 3], ['hookup', 4], ['hookups', 4], ['meet singles', 4],
      ['rencontre', 3], ['match', 2], ['relationship', 2], ['flirt', 3],
      ['private community', 2], ['secret room', 2], ['waiting tonight', 2], ['nearby', 1],
    ],
  },
  {
    id: 'facture',
    label: 'Facture',
    action: 'keep',
    terms: [
      ['facture', 4], ['invoice', 4], ['receipt', 3], ['recu', 2],
      ['payment confirmation', 3], ['paiement confirme', 3], ['billing', 3],
    ],
  },
  {
    id: 'travail',
    label: 'Travail',
    action: 'keep',
    terms: [
      ['candidature', 3], ['entretien', 3], ['recrutement', 3], ['job offer', 3],
      ['linkedin', 2], ['meeting', 2], ['project update', 2], ['poste', 1],
    ],
  },
  {
    id: 'newsletter',
    label: 'Newsletter',
    action: 'review',
    terms: [
      ['unsubscribe', 4], ['se desabonner', 4], ['newsletter', 4],
      ['weekly digest', 3], ['daily digest', 3], ['view in browser', 2],
      ['preferences email', 2],
    ],
  },
  {
    id: 'publicite',
    label: 'Publicité',
    action: 'review',
    terms: [
      ['promotion', 3], ['promo', 2], ['discount', 3], ['remise', 3],
      ['offre exclusive', 3], ['exclusive offer', 3], ['sale', 2],
      ['buy now', 3], ['shop now', 3], ['limited offer', 3],
    ],
  },
  {
    id: 'spam',
    label: 'Spam',
    action: 'quarantine',
    terms: [
      ['you have been selected', 3], ['limited seats', 2], ['act now', 3],
      ['free gift', 3], ['winner', 3], ['congratulations', 2],
      ['do not miss', 1], ['last chance', 2],
    ],
  },
];

function normalize(value = '') {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function domainOf(email = '') {
  return normalize(email.split('@')[1] || '');
}

export function classifyEmail(email) {
  const text = normalize(`${email.subject || ''} ${email.snippet || ''} ${email.from?.name || ''}`);
  const domain = domainOf(email.from?.email);
  const results = CATEGORY_RULES.map((rule) => {
    const matches = rule.terms
      .filter(([term]) => text.includes(normalize(term)) || domain.includes(normalize(term)))
      .map(([term, weight]) => ({ term, weight }));
    return { ...rule, score: matches.reduce((sum, match) => sum + match.weight, 0), matches };
  }).filter((result) => result.score > 0);

  results.sort((a, b) => b.score - a.score);
  const best = results[0];

  if (!best) {
    const important = (email.labels || []).includes('IMPORTANT');
    return {
      id: important ? 'important' : 'autre',
      label: important ? 'Important' : 'Autre',
      confidence: important ? 0.72 : 0.35,
      action: 'keep',
      reasons: important ? ['Marqué important dans Gmail'] : ['Aucune règle déterminante'],
    };
  }

  return {
    id: best.id,
    label: best.label,
    confidence: Math.min(0.98, 0.46 + best.score * 0.08),
    action: best.action,
    reasons: best.matches.slice(0, 3).map((match) => `Motif détecté : ${match.term}`),
  };
}

export function summarizeClassifications(messages) {
  const categories = {};
  let quarantine = 0;
  let review = 0;

  for (const message of messages) {
    const classification = message.classification || classifyEmail(message);
    categories[classification.id] = (categories[classification.id] || 0) + 1;
    if (classification.action === 'quarantine') quarantine += 1;
    if (classification.action === 'review') review += 1;
  }

  return { analyzed: messages.length, quarantine, review, categories };
}
