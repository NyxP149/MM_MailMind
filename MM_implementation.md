# MailMind — Guide d’implémentation

> Mise à jour V2 : classification, validation humaine, mesure de qualité et quarantaine Gmail réversible.

> Mise à jour V3 : tableau de bord agrégé et historique local minimisé.

> Mise à jour V4 : moteur et éditeur de règles personnalisées locales.

> Mise à jour V5 : service OpenAI optionnel et vue d'analyse IA avec consentement unitaire.

> Mise à jour V6 : moteur de préférences locales dérivé des corrections explicites.

Ce document décrit l’implémentation actuellement présente dans le dépôt. Il sert de référence aux personnes qui développent, testent ou maintiennent MailMind. La version actuelle reste personnelle et locale ; elle lit Gmail et peut uniquement ajouter ou retirer son label de quarantaine après confirmation.

## 1. Vue d’ensemble technique

MailMind est organisé en deux espaces npm :

- `backend/` : API Node.js/Express, connexion Google OAuth 2.0 et appels à Gmail API ;
- `frontend/` : application React construite avec Vite et rendue installable comme PWA.

Le navigateur ne contacte jamais Gmail directement. Il appelle le backend, qui détient le client OAuth et transforme les réponses Gmail en objets minimaux adaptés à l’interface. Il n’existe actuellement ni base de données ni stockage persistant : les jetons OAuth et l’état de connexion vivent uniquement dans la mémoire du processus backend.

## Implémentation de la classification V2

`backend/src/classifier.js` contient les règles pondérées et deux fonctions publiques :

- `classifyEmail(email)` produit `{ id, label, confidence, action, reasons }` ;
- `summarizeClassifications(messages)` agrège les catégories et recommandations de la page analysée.

`normalizeMessage()` appelle le classificateur après avoir réduit la réponse Gmail au modèle utilisé par l’interface. La réponse de `GET /api/emails` contient ainsi une propriété `classification` par message et une propriété `summary` au niveau de la page.

Le frontend expose trois vues dans `App.jsx` : boîte de réception, catégories et quarantaine virtuelle. `ClassificationOverview.jsx` calcule les indicateurs visibles et les filtres, tandis que `EmailRow.jsx` affiche le badge, le score et les motifs dans son infobulle. Les filtres portent uniquement sur les messages déjà chargés depuis Gmail.

Les règles doivent rester explicables et testées. Toute nouvelle règle doit ajouter au moins un cas positif et, lorsque le risque de collision est élevé, un cas négatif dans `backend/src/classifier.test.js`.

### Corrections et décisions locales

`frontend/src/classification.js` définit le référentiel des catégories et applique les corrections manuelles. Deux espaces de noms `localStorage` sont utilisés :

- `mailmind:classification-overrides:v1` pour les catégories corrigées ;
- `mailmind:quarantine-decisions:v1` pour les confirmations et faux positifs.

Les corrections reçoivent une confiance de 100 %, le motif « Catégorie corrigée manuellement » et alimentent immédiatement les compteurs. Un faux positif est retiré de la vue Quarantaine sans modifier Gmail. Une confirmation reste visible et peut être annulée. Le module dispose de tests unitaires dédiés dans `frontend/src/classification.test.js`.

### Scanner paginé

`api.getEmails(pageToken, limit)` accepte désormais une taille bornée entre 1 et 50. `scanMailbox()` dans `App.jsx` enchaîne les pages jusqu’à la cible choisie (50, 100 ou 250), met à jour l’interface après chaque réponse et conserve le prochain `pageToken`. `mergeEmails()` déduplique les résultats par identifiant Gmail et possède un test unitaire. Une erreur interrompt proprement le scan tout en conservant les messages déjà reçus.

### Tableau Qualité et export

`computeQualityMetrics()` calcule les métriques à partir des classifications effectives, des décisions et des corrections. `QualityDashboard.jsx` affiche les agrégats et le détail par catégorie. La précision vaut `confirmés / décisions rendues` et la couverture vaut `décisions rendues / suggestions de quarantaine`.

L’export est créé dans le navigateur avec `Blob` et `URL.createObjectURL`. Chaque enregistrement contient uniquement `automaticCategory`, `correctedCategory` et `decision`. Aucun identifiant de message ni texte Gmail n’est sérialisé.

### Quarantaine Gmail réversible

`backend/src/gmail-actions.js` gère le label `MailMind/Quarantine`. Il recherche d’abord un label existant, le crée si nécessaire, puis utilise `users.messages.modify` uniquement avec `addLabelIds` ou `removeLabelIds`.

- `POST /api/emails/:id/quarantine` exige l’en-tête `X-MailMind-Confirm: quarantine` ;
- `POST /api/emails/:id/restore` exige `X-MailMind-Confirm: restore` ;
- `GET /api/audit` expose les 100 dernières actions de la session en mémoire.

Les identifiants Gmail sont validés avant tout appel. Le frontend affiche en plus une boîte de confirmation native. Aucun endpoint n’appelle `trash`, `untrash`, `delete`, `batchDelete`, `send` ou une modification du contenu.

## Implémentation du tableau de bord V3

`computeDashboardMetrics()` agrège les messages effectifs, décisions et événements d’action. `Dashboard.jsx` rend les indicateurs, les barres de catégories et les huit événements les plus récents sans bibliothèque graphique externe.

Les événements sont stockés sous `mailmind:action-history:v1` dans `localStorage`, avec une limite de 100 entrées. Ils contiennent le type d’action, l’horodatage et la catégorie uniquement. L’estimation du temps utilise la formule `(validations × 12 + actions Gmail × 8) / 60`, arrondie à la minute.

## Implémentation des règles V4

`applyCustomRules()` évalue les règles actives sur les champs normalisés du message. La propriété `classification` produite reçoit une confiance de 100 %, un motif explicable, `customRule: true` et l’identifiant de règle. `App.jsx` applique ensuite les corrections manuelles, qui restent prioritaires.

`RulesManager.jsx` gère la création, l’activation et la suppression. Les règles sont stockées sous `mailmind:custom-rules:v1` dans `localStorage`. Elles ne contiennent que le champ, l’opérateur, la valeur recherchée, la catégorie, l’état et l’horodatage de création.

## Implémentation de l'assistant V5

`backend/src/ai.js` assure la minimisation, l'appel au fournisseur sélectionné et l'extraction de la sortie structurée. `AI_PROVIDER=ollama` appelle l'API locale `/api/chat`, sans clé, avec un schéma JSON et une température nulle. `AI_PROVIDER=openai` conserve l'API Responses, `store: false` et `OPENAI_API_KEY`. Les deux chemins bornent les textes et traitent le contenu de l'e-mail comme une donnée non fiable. La route `POST /api/ai/analyze` exige une connexion Gmail, une configuration IA active et l'en-tête explicite `X-MailMind-AI-Consent: analyze`.

Le frontend envoie uniquement `subject`, `senderDomain`, `snippet` et `ruleSuggestion`. `AIAssistant.jsx` montre ces valeurs avant l'envoi, exige une case de consentement et présente séparément le résultat. Le composant ne reçoit aucun callback de mutation Gmail et ne peut donc exécuter ni quarantaine, ni restauration, ni suppression.

## Implémentation de l'apprentissage V6

`classification.js` expose `extractLearningSignals`, `createLearningExample`, `upsertLearningExample`, `buildLearningModel`, `applyLearnedPreferences` et `computeLearningMetrics`. Les exemples sont stockés sous `mailmind:learning-examples:v1` et limités aux 500 plus récents. Une empreinte FNV locale remplace l'identifiant Gmail pour dédupliquer les corrections d'un même message.

Le pipeline de classement est : moteur automatique backend, première règle V4 correspondante, préférence V6 active, puis correction manuelle propre au message. `LearningDashboard.jsx` présente la mémoire sans recopier les contenus Gmail et permet sa réinitialisation indépendante. Au chargement, les anciennes corrections V2 encore associées à un message présent sont importées progressivement dans la mémoire V6.


```text
Navigateur React
    │  HTTP + cookies (credentials: include)
    ▼
API Express :3000
    │  OAuth 2.0 / Gmail API
    ▼
Google
```

## 2. Structure du code

```text
MM_MailMind/
├── package.json                 # scripts communs et workspaces npm
├── pnpm-workspace.yaml          # déclaration équivalente pour pnpm
├── backend/
│   ├── .env.example             # modèle de configuration serveur
│   ├── package.json
│   ├── server.js                # chargement de la config et écoute HTTP
│   └── src/
│       ├── app.js               # middleware et routes de l’API
│       ├── config.js            # lecture et validation de l’environnement
│       ├── google.js            # OAuth, Gmail et normalisation des messages
│       └── google.test.js       # tests unitaires backend
└── frontend/
    ├── .env.example             # modèle de configuration du frontend
    ├── index.html
    ├── package.json
    ├── vite.config.js           # React, PWA, port et configuration Vitest
    ├── public/
    │   └── mailmind-mark.svg
    └── src/
        ├── main.jsx             # montage React et enregistrement du service worker
        ├── App.jsx              # état applicatif et écrans principaux
        ├── api.js               # client HTTP de l’API MailMind
        ├── utils.js             # formatage de date et initiales
        ├── utils.test.js        # tests unitaires frontend
        ├── styles.css           # styles globaux et responsive
        ├── components/          # composants de présentation
        └── test/setup.js        # initialisation Testing Library/Vitest
```

## 3. Prérequis

- Node.js 20 ou supérieur ;
- npm 10 ou supérieur ;
- un compte Google ;
- un projet Google Cloud avec Gmail API activée ;
- un client OAuth 2.0 de type « Application Web ».

Le dépôt contient également un verrou `pnpm-lock.yaml`, mais les scripts et la documentation du projet utilisent npm. Pour éviter les écarts de dépendances, ne mélangez pas les gestionnaires de paquets dans une même branche et utilisez npm tant qu’une décision explicite de migration n’a pas été prise.

## 4. Installation locale

Depuis la racine du dépôt :

```bash
npm install
```

Créez ensuite les fichiers locaux de configuration. Sous PowerShell :

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

Le fichier `frontend/.env` est facultatif lorsque l’API écoute sur `http://localhost:3000`. Le fichier `backend/.env` doit en revanche être complété pour permettre la connexion à Google.

Dans Google Cloud :

1. activez **Gmail API** dans le projet ;
2. configurez l’écran de consentement OAuth ;
3. en mode test, ajoutez le compte Gmail utilisé à la liste des utilisateurs de test ;
4. créez un client OAuth de type **Application Web** ;
5. déclarez exactement `http://localhost:3000/api/auth/google/callback` comme URI de redirection autorisée ;
6. reportez l’identifiant client et le secret dans `backend/.env`.

Lancez enfin le frontend et l’API :

```bash
npm run dev
```

L’interface est disponible sur `http://localhost:5173` et le contrôle de santé sur `http://localhost:3000/api/health`.

## 5. Variables d’environnement

### Backend — `backend/.env`

| Variable | Obligatoire | Valeur locale / rôle |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | Oui | Identifiant du client OAuth Google. |
| `GOOGLE_CLIENT_SECRET` | Oui | Secret du client OAuth Google. Ne jamais le committer. |
| `GOOGLE_REDIRECT_URI` | Oui | `http://localhost:3000/api/auth/google/callback`; doit correspondre exactement à Google Cloud. |
| `COOKIE_SECRET` | Oui | Chaîne aléatoire d’au moins 32 caractères servant à signer l’état OAuth. |
| `FRONTEND_URL` | Non | Origine CORS et cible des redirections ; défaut : `http://localhost:5173`. |
| `PORT` | Non | Port HTTP du backend ; défaut : `3000`. |
| `NODE_ENV` | Non | La valeur `production` active l’attribut `secure` du cookie OAuth. |

Exemple de génération du secret :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`getConfig()` considère OAuth prêt seulement lorsque les quatre variables obligatoires sont présentes. L’API peut tout de même démarrer sans elles afin d’exposer son état de santé et la liste des variables manquantes.

### Frontend — `frontend/.env`

| Variable | Obligatoire | Valeur locale / rôle |
| --- | --- | --- |
| `VITE_API_URL` | Non | URL publique de l’API ; défaut : `http://localhost:3000`. |

Les variables préfixées par `VITE_` sont intégrées au bundle client : aucun secret ne doit y être placé.

## 6. Backend : OAuth et Gmail en détail

### Initialisation

`backend/server.js` charge `.env` via `dotenv/config`, appelle `getConfig()`, construit l’application avec `createApp(config)` puis ouvre le port. `backend/src/app.js` installe :

- `helmet` pour les en-têtes de sécurité ;
- `cors` limité à `FRONTEND_URL`, avec prise en charge des identifiants ;
- le parseur JSON, limité à 32 ko ;
- `cookie-parser` avec signature des cookies ;
- la désactivation de l’en-tête `X-Powered-By`.

Un seul objet `OAuth2` et un booléen `connected` sont créés dans la fermeture de `createApp`. Cette architecture convient à un usage personnel avec un processus unique, mais elle ne distingue pas plusieurs utilisateurs et ne partage pas la session entre plusieurs instances serveur.

### Parcours OAuth

1. Le frontend redirige le navigateur vers `GET /api/auth/google`.
2. Le backend vérifie que la configuration OAuth est complète.
3. Il génère un `state` cryptographiquement aléatoire de 32 octets.
4. Il conserve ce `state` dix minutes dans le cookie signé, HTTP-only et `SameSite=Lax` `mailmind_oauth_state`.
5. Il redirige vers Google avec `access_type=offline`, `prompt=consent` et l’unique scope `gmail.modify`.
6. Google revient sur `GET /api/auth/google/callback`.
7. Le backend efface le cookie puis compare le `state` reçu à sa valeur signée. Une différence entraîne une redirection frontend avec `?auth=invalid_state`.
8. En présence d’un code, le backend l’échange contre des jetons et les place uniquement dans le client OAuth en mémoire.
9. Le navigateur est redirigé vers le frontend avec `?auth=success`, ou avec un code d’erreur exploité par `App.jsx`.

Le client Google émet aussi un événement `tokens`; celui-ci maintient le drapeau de connexion lors de l’émission ou du renouvellement d’un jeton.

### Routes exposées

| Méthode et route | Comportement |
| --- | --- |
| `GET /api/health` | Retourne l’état du service et indique si OAuth est configuré. |
| `GET /api/auth/status` | Retourne la configuration, l’état de connexion et, si possible, le profil Gmail. |
| `GET /api/auth/google` | Démarre le parcours OAuth. |
| `GET /api/auth/google/callback` | Valide le retour Google et mémorise les jetons. |
| `POST /api/auth/logout` | Révoque les identifiants si possible, puis vide toujours l’état local. |
| `GET /api/emails` | Retourne une page de messages normalisés ; accepte `limit` et `pageToken`. |
| `POST /api/ai/analyze` | Analyse un message minimisé après consentement explicite ; ne modifie pas Gmail. |

Les erreurs API ont la forme `{ "error": { "code": "…", "message": "…" } }`. Une route inconnue renvoie `404/NOT_FOUND`, une lecture sans connexion `401/NOT_CONNECTED`, et une erreur Gmail `502/GMAIL_ERROR`.

### Lecture et normalisation Gmail

`listMessages()` appelle d’abord `users.messages.list` pour l’utilisateur `me`, avec la requête `in:anywhere`. La taille de page vaut 20 par défaut et est bornée entre 1 et 50. Pour chaque référence obtenue, un appel `users.messages.get` récupère seulement les métadonnées `From`, `Subject` et `Date`. Les appels de détail sont effectués en parallèle avec `Promise.all`.

Le frontend reçoit uniquement :

```js
{
  id,
  threadId,
  subject,
  from: { name, email },
  date,
  snippet,
  labels,
  unread
}
```

Le sujet absent devient `(Sans objet)` et `unread` est dérivé du label `UNREAD`. Le corps complet du message n’est ni demandé ni stocké.

## 7. Frontend React et PWA

`src/main.jsx` monte `App` dans `StrictMode` et enregistre immédiatement le service worker produit par `vite-plugin-pwa`. Le manifeste définit MailMind comme application `standalone`, avec couleurs de thème, URL de démarrage et icône SVG. Le mode `autoUpdate` permet la mise à jour automatique du service worker.

`src/api.js` centralise les requêtes :

- préfixe toutes les routes avec `VITE_API_URL` ;
- envoie `credentials: 'include'` pour les cookies ;
- transforme les réponses d’erreur API en `Error` JavaScript ;
- expose `getStatus`, `getEmails`, `logout` et l’URL de démarrage OAuth.

`App.jsx` porte actuellement l’état global sans bibliothèque supplémentaire : statut OAuth, messages, pagination, chargements, erreur, recherche et ouverture de la barre latérale. Au montage, l’application interprète le paramètre de retour OAuth, nettoie l’URL, demande le statut puis charge les messages lorsque le compte est connecté.

Le thème est également piloté par `App.jsx`. `theme.js` résout le choix entre la valeur locale `mailmind:theme:v1` et la préférence système `prefers-color-scheme`. Le document reçoit l'attribut `data-theme`, utilisé par les variantes CSS, ainsi qu'une couleur de navigateur adaptée. Un court script dans `index.html` applique ce choix avant React pour éviter un flash du thème clair. Aucune dépendance ni donnée serveur n'est nécessaire.

La recherche concatène sujet, nom, adresse et extrait, puis filtre en minuscules. Elle porte uniquement sur les messages déjà chargés dans le navigateur ; ce n’est pas une recherche Gmail distante. La pagination ajoute chaque nouvelle page au tableau courant et le bouton disparaît durant une recherche locale.

Les composants `Brand`, `EmailRow` et `EmptyState` restent essentiellement visuels. `utils.js` isole la mise en forme des dates en français et le calcul des initiales. Certaines commandes visibles dans l’interface (favori, notifications, réglages et archives) sont encore décoratives.

## 8. Commandes utiles

À exécuter depuis la racine sauf indication contraire :

| Commande | Effet |
| --- | --- |
| `npm run dev` | Lance simultanément l’API en mode watch et Vite. |
| `npm run build` | Construit le frontend et les actifs PWA dans `frontend/dist/`. |
| `npm test` | Exécute successivement les tests backend puis frontend. |
| `npm start` | Lance uniquement le backend sans mode watch. |
| `npm run dev --workspace backend` | Lance uniquement l’API. |
| `npm run dev --workspace frontend` | Lance uniquement l’interface. |
| `npm run preview --workspace frontend` | Sert localement le build Vite. |
| `npm run test --workspace backend` | Exécute les tests Node du backend. |
| `npm run test --workspace frontend` | Exécute Vitest dans jsdom. |

## 9. Tests et vérifications

Le backend utilise le runner natif `node:test` avec `node:assert/strict`. Les tests actuels couvrent la recherche insensible à la casse des en-têtes, l’analyse d’une adresse expéditeur et la normalisation sûre d’un message Gmail.

Le frontend utilise Vitest, jsdom et Testing Library. `src/test/setup.js` active les assertions `jest-dom`. Les tests couvrent notamment les utilitaires d'affichage, le moteur de classification et la résolution du thème mémorisé ou système.

Avant toute livraison :

```bash
npm test
npm run build
```

Pour une modification touchant OAuth ou Gmail, effectuez également un contrôle manuel : connexion, refus du consentement, chargement d’une page, pagination, déconnexion et nouvelle connexion. Ne testez jamais avec des secrets réels committés ou inclus dans une capture/log.

Lors de l’ajout d’une fonction pure, placez de préférence son test à côté du module (`*.test.js`). Lors de l’ajout d’un composant interactif, utilisez Testing Library pour vérifier le comportement observable plutôt que les détails internes de React. Les appels Google doivent être isolés ou simulés dans les tests automatisés : la suite ne doit pas dépendre d’un compte Gmail réel.

## 10. Conventions de développement

- Le projet utilise les modules ECMAScript (`type: module`) et les extensions explicites `.js`/`.jsx` dans les imports locaux.
- Utilisez deux espaces d’indentation, des points-virgules et des chaînes entre apostrophes, conformément au code existant.
- Conservez les composants React sous forme de fonctions et privilégiez les fonctions pures pour le formatage et la normalisation.
- Centralisez les appels HTTP frontend dans `src/api.js` et les appels Google dans `backend/src/google.js`.
- Gardez les routes et les middleware dans `backend/src/app.js`; gardez `server.js` limité au démarrage du serveur.
- Retournez des erreurs API stables avec un code machine et un message français destiné à l’utilisateur.
- Ne transmettez jamais les jetons Google au frontend et ne journalisez ni secrets, ni codes d’autorisation, ni contenu d’e-mail.
- Conservez `gmail.modify` comme plafond. Toute nouvelle mutation doit faire l’objet d’une décision explicite, de tests de sécurité et d’une interface de confirmation adaptée.
- Préservez l’accessibilité : libellés `aria-label`, rôles d’état/alerte, éléments HTML sémantiques et navigation clavier.
- Ajoutez ou adaptez les tests avec chaque comportement métier.

Il n’existe actuellement ni ESLint ni Prettier configuré. Ne lancez donc pas de reformatage global automatique ; alignez les modifications sur le style des fichiers concernés.

## 11. Développer une fonctionnalité

1. **Définir le comportement et les limites.** Précisez si la fonction est locale ou dépend de Gmail, les données nécessaires, les états de chargement/erreur et les implications de sécurité. Une action modifiant Gmail sort des garanties de la V1 et nécessite une validation de conception avant implémentation.
2. **Tracer le flux de données.** Pour une donnée Gmail, partez de `google.js` (appel et normalisation), passez par une route de `app.js`, ajoutez la méthode correspondante dans `api.js`, puis consommez-la depuis React.
3. **Implémenter le backend.** Validez et bornez tous les paramètres entrants, demandez à Gmail uniquement les champs utiles, normalisez la réponse et utilisez le format d’erreur commun. Évitez d’exposer la structure brute de Google au client.
4. **Écrire les tests backend.** Testez en priorité les fonctions pures, les valeurs absentes, les bornes et les erreurs. Simulez les dépendances réseau lorsque la route elle-même doit être testée.
5. **Étendre le client API.** Ajoutez un appel nommé dans `frontend/src/api.js`; ne dispersez pas de `fetch` dans les composants.
6. **Implémenter l’interface.** Réutilisez les composants et classes existants, affichez clairement chargement, succès, vide et erreur, puis contrôlez le rendu mobile et clavier.
7. **Écrire les tests frontend.** Vérifiez ce que l’utilisateur voit et peut déclencher. Pour les utilitaires, testez aussi les entrées vides ou invalides.
8. **Vérifier l’ensemble.** Lancez `npm test`, `npm run build`, puis le parcours manuel concerné avec `npm run dev`.
9. **Mettre à jour la documentation.** Documentez toute nouvelle variable, route, commande, dépendance, limite ou procédure opérationnelle dans le fichier approprié.

## 12. Limites techniques à connaître avant d’étendre l’application

- La session OAuth est globale au processus : elle n’est pas multi-utilisateur.
- Les jetons disparaissent à chaque redémarrage et ne sont pas partagés entre instances.
- Il n’existe pas de session applicative persistante ni de base de données.
- La recherche est locale et limitée aux pages déjà récupérées.
- Chaque page peut provoquer jusqu’à 51 appels Gmail (une liste puis jusqu’à 50 détails), sans contrôle de concurrence ni reprise partielle.
- L’API est conçue pour le développement local ; une mise en production exige notamment HTTPS, stockage chiffré des jetons, sessions par utilisateur, rotation des secrets, politique d’accès, supervision et stratégie de déploiement.
- La V2 possède uniquement deux routes de mutation : ajout et retrait du label `MailMind/Quarantine`. Elle ne possède aucune route de suppression, corbeille, archivage ou envoi.

Ces limites doivent être traitées comme des contraintes d’architecture, pas comme des fonctionnalités implicites. Toute évolution vers plusieurs utilisateurs ou vers des actions Gmail nécessite de revoir le modèle de session, le stockage, les scopes et les contrôles de consentement.
