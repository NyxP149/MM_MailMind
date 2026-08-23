# MailMind — Conception

## 1. Objet du document

Ce document décrit la conception fonctionnelle et technique de MailMind. Il distingue l'état réellement implémenté dans la V1 des orientations prévues par la feuille de route.

MailMind est un assistant personnel de gestion de Gmail. Sa vision est de passer progressivement d'une consultation claire de la boîte mail à un assistant capable de comprendre, classer et, après validation, traiter les messages selon les préférences de l'utilisateur.

La priorité de conception est la confiance : les accès doivent être minimaux, les données ne doivent pas être conservées sans nécessité et aucune action destructive ne doit être introduite sans garde-fous explicites.

## 2. Vision produit

La promesse à long terme est : **« Créer un assistant qui comprend mes e-mails. »**

Le premier cas d'usage visé par la feuille de route est l'identification des messages indésirables, notamment les publicités, les contenus adultes, les sites de rencontre, les newsletters et les arnaques. La cible finale est plus large : repérer les messages importants, retrouver des factures, résumer des contenus, appliquer des règles et produire des rapports d'activité.

MailMind est conçu d'abord pour un usage personnel. La V1 ne comporte donc ni gestion multi-utilisateur, ni paiement, ni espace d'administration.

## 3. Périmètre de la V1

### Inclus et implémenté

- connexion à un compte Google avec OAuth 2.0 ;
- validation du paramètre OAuth `state` ;
- permission Gmail strictement limitée à `gmail.readonly` ;
- consultation du profil Gmail ;
- récupération paginée des messages, de 1 à 50 par requête (20 par défaut) ;
- récupération des seules métadonnées nécessaires : expéditeur, sujet, date, extrait et labels ;
- affichage des messages dans une interface React responsive ;
- recherche locale dans les messages déjà chargés ;
- actualisation manuelle et chargement de pages supplémentaires ;
- déconnexion avec tentative de révocation des identifiants Google ;
- installation possible comme PWA.

### Explicitement hors périmètre

- suppression, archivage, déplacement ou labellisation des messages ;
- classification par règles ou par intelligence artificielle ;
- quarantaine et automatisations planifiées ;
- statistiques et historique ;
- stockage durable des jetons ou du contenu des messages ;
- prise en charge simultanée de plusieurs utilisateurs.

Les éléments d'interface « Catégories » et « Assistant » sont des amorces visuelles signalées comme prochaines fonctionnalités ; ils ne constituent pas encore des fonctions actives. Le bouton favori affiché sur une ligne ne déclenche actuellement aucune modification Gmail.

## 4. Architecture conceptuelle

```text
Utilisateur
    │
    ▼
Interface React / PWA
    │  API JSON + redirections OAuth
    ▼
Backend Express
    ├── configuration et sécurité HTTP
    ├── orchestration OAuth 2.0
    └── normalisation des données Gmail
            │
            ▼
       Google OAuth / Gmail API
```

Dans la V1, le backend constitue la frontière de confiance : le navigateur ne communique jamais directement avec Gmail et ne reçoit jamais les jetons Google. Il reçoit uniquement un état de connexion, un profil minimal et des messages normalisés.

L'architecture fonctionnelle cible étendra ce pipeline sans remettre en cause cette frontière :

```text
Gmail → collecte → analyse → catégorie / importance / risque
      → recommandation → quarantaine / validation → action → rapport
```

## 5. Architecture technique actuelle

Le dépôt est organisé en monorepo JavaScript avec espaces de travail :

```text
MM_MailMind/
├── frontend/   React, Vite, vite-plugin-pwa
├── backend/    Node.js, Express, googleapis
└── package.json et pnpm-workspace.yaml
```

### Frontend

Le frontend est une application monopage React construite avec Vite. Il gère :

- l'écran d'accueil et le démarrage de la connexion Google ;
- la lecture de l'état de connexion ;
- l'affichage, le filtrage local et la pagination des messages ;
- les états de chargement, d'erreur et de liste vide ;
- la navigation responsive avec panneau latéral mobile.

Le module PWA génère un manifeste avec un affichage `standalone`, un thème dédié et l'enregistrement automatique des mises à jour. L'icône actuelle est un SVG utilisable comme icône standard ou masquable.

### Backend

Le backend Express centralise :

- la configuration issue des variables d'environnement ;
- les en-têtes de sécurité avec Helmet ;
- CORS limité à l'origine frontend configurée et autorisant les credentials ;
- les cookies signés nécessaires au contrôle du flux OAuth ;
- l'échange du code d'autorisation contre les jetons ;
- les appels à Gmail via `googleapis` ;
- la normalisation des réponses et les erreurs API JSON.

Le corps JSON est limité à 32 Kio et l'en-tête `X-Powered-By` est désactivé.

### Absence de base de données

Aucune base de données n'est utilisée en V1. Les messages ne sont pas copiés durablement et les jetons OAuth restent dans l'instance du client Google en mémoire du processus backend. Un redémarrage du serveur impose donc une nouvelle connexion.

Cette simplicité est adaptée à un usage personnel local, mais elle implique qu'une seule identité OAuth est gérée correctement à la fois. Elle ne doit pas être étendue telle quelle à un service public ou multi-utilisateur.

## 6. Flux OAuth 2.0 et Gmail

### Connexion

1. Le frontend dirige l'utilisateur vers `GET /api/auth/google`.
2. Le backend vérifie que la configuration OAuth est complète.
3. Il génère une valeur `state` aléatoire de 32 octets.
4. Cette valeur est placée dans un cookie signé, `HttpOnly`, `SameSite=Lax`, valable dix minutes et `Secure` en production.
5. Le backend redirige vers Google avec le scope `gmail.readonly`, un accès hors ligne et un consentement explicite.
6. Google redirige vers `GET /api/auth/google/callback` avec un code et le `state`.
7. Le backend compare le `state` retourné au cookie signé, échange le code contre des jetons et les conserve en mémoire.
8. Le navigateur est redirigé vers le frontend avec un résultat synthétique dans le paramètre `auth`.

Le mot de passe Gmail n'est jamais demandé ni manipulé par MailMind.

### Lecture des messages

1. Le frontend appelle `GET /api/emails` avec les cookies activés.
2. Le backend vérifie la présence d'une connexion OAuth active.
3. Gmail recherche les messages avec `q=in:anywhere` et retourne leurs identifiants.
4. Le backend récupère chaque message au format `metadata`, uniquement avec les en-têtes `From`, `Subject` et `Date`.
5. Il transforme les réponses Gmail vers le contrat MailMind avant de les transmettre au frontend.

Le chargement des détails d'une page est actuellement parallélisé avec `Promise.all`. Ce choix est simple pour les petits lots de la V1 ; une stratégie de limitation de concurrence, de cache ou de traitement par lots sera à évaluer si les volumes augmentent.

### Déconnexion

`POST /api/auth/logout` tente de révoquer les credentials auprès de Google, puis efface systématiquement l'état de connexion et les jetons en mémoire. La réponse réussie ne contient pas de corps (`204`).

## 7. Décisions structurantes

| Décision | Justification | Conséquence actuelle |
| --- | --- | --- |
| Scope `gmail.readonly` | Appliquer le moindre privilège | Aucune route ne peut modifier Gmail |
| Appels Gmail côté backend | Ne jamais exposer les jetons au navigateur | Le frontend manipule seulement des objets normalisés |
| Jetons en mémoire | Réduire la persistance de données sensibles en V1 | Reconnexion après redémarrage ; un seul utilisateur à la fois |
| Aucune base de données | Éviter le stockage inutile avant qu'un besoin réel existe | Pas d'historique, de règles persistantes ni d'apprentissage |
| Métadonnées Gmail uniquement | Limiter l'exposition du contenu | Le corps complet et les pièces jointes ne sont pas récupérés |
| Recherche locale | Offrir un filtrage immédiat sans requête supplémentaire | La recherche couvre uniquement les pages déjà chargées |
| Quarantaine avant suppression | Réduire le risque de faux positif dans les versions futures | Toute action destructive restera précédée d'une validation |
| Web responsive / PWA | Un seul produit pour ordinateur et mobile | Pas d'application native ni de publication sur un store en V1 |

## 8. Contrats de l'API

Toutes les erreurs API non liées aux redirections OAuth utilisent la forme :

```json
{
  "error": {
    "code": "CODE_STABLE",
    "message": "Message lisible par l'utilisateur"
  }
}
```

### `GET /api/health`

Vérifie que l'API répond et indique si les variables OAuth requises sont présentes.

```json
{
  "status": "ok",
  "service": "MailMind API",
  "oauthReady": true
}
```

### `GET /api/auth/status`

Sans configuration complète :

```json
{
  "connected": false,
  "configured": false,
  "missing": ["GOOGLE_CLIENT_ID"]
}
```

Configuré mais non connecté :

```json
{ "connected": false, "configured": true }
```

Connecté :

```json
{
  "connected": true,
  "configured": true,
  "profile": {
    "email": "utilisateur@example.com",
    "messagesTotal": 1234,
    "threadsTotal": 987
  }
}
```

### `GET /api/auth/google`

Démarre le flux OAuth par redirection. Retourne une erreur `503 OAUTH_NOT_CONFIGURED` si la configuration est incomplète.

### `GET /api/auth/google/callback`

Valide le retour Google puis redirige vers le frontend avec l'un des résultats : `success`, `invalid_state`, `denied`, `missing_code` ou `failed`.

### `POST /api/auth/logout`

Révoque si possible les credentials, vide l'état en mémoire et retourne `204 No Content`.

### `GET /api/emails?limit=20&pageToken=...`

- `limit` : entier ramené dans l'intervalle 1–50, avec 20 par défaut ;
- `pageToken` : jeton opaque Gmail facultatif pour la page suivante ;
- erreurs principales : `401 NOT_CONNECTED` ou `502 GMAIL_ERROR`.

Réponse :

```json
{
  "messages": [],
  "nextPageToken": null,
  "resultSizeEstimate": 0
}
```

Toute autre route retourne `404 NOT_FOUND`.

## 9. Modèle de données d'un e-mail

Le frontend reçoit le modèle minimal suivant :

```json
{
  "id": "identifiant-message-gmail",
  "threadId": "identifiant-fil-gmail",
  "subject": "Objet du message",
  "from": {
    "name": "Nom affiché",
    "email": "expediteur@example.com"
  },
  "date": "Thu, 20 Aug 2026 09:30:00 +0200",
  "snippet": "Aperçu fourni par Gmail",
  "labels": ["INBOX", "UNREAD"],
  "unread": true
}
```

Règles de normalisation :

- un sujet absent devient `(Sans objet)` ;
- un extrait absent devient une chaîne vide ;
- `unread` est dérivé de la présence du label Gmail `UNREAD` ;
- l'adresse expéditeur est séparée en `name` et `email` lorsque le format le permet.

Ce modèle est volontairement indépendant du schéma complet de Gmail. Les futures données d'analyse devront être ajoutées dans une structure séparée, par exemple `analysis.category`, `analysis.confidence`, `analysis.risk` et `recommendedAction`, afin de préserver les données sources.

## 10. Sécurité et confidentialité

### Garanties présentes en V1

- OAuth 2.0 officiel, sans collecte du mot de passe ;
- moindre privilège grâce au scope de lecture seule ;
- protection du retour OAuth avec un `state` aléatoire et un cookie signé ;
- cookie temporaire non lisible par JavaScript ;
- jetons absents des réponses au frontend et des URL de l'application ;
- secrets chargés depuis l'environnement et fichiers `.env` ignorés par Git ;
- absence de stockage durable des e-mails et des jetons ;
- en-têtes HTTP renforcés par Helmet ;
- origine CORS explicitement configurée.

### Limites à traiter avant un déploiement public

- remplacer le client OAuth global par des sessions isolées par utilisateur ;
- stocker les jetons uniquement si nécessaire, chiffrés au repos et associés à une politique de rotation et de révocation ;
- imposer HTTPS et des cookies sécurisés en production ;
- utiliser un secret de cookie fort et refuser tout secret de développement par défaut ;
- ajouter limitation de débit, journalisation sans données sensibles et supervision ;
- définir une politique de rétention et de suppression des données ;
- durcir la gestion des erreurs Google sans révéler de détails internes ;
- prévoir des tests de sécurité et une procédure de réponse aux incidents ;
- revalider les scopes Google à chaque fonctionnalité ajoutée.

Toute évolution vers l'écriture doit demander un scope distinct et être précédée d'une revue de sécurité. La suppression définitive ne doit jamais être le premier mécanisme livré : label ou quarantaine, aperçu, confirmation, journal d'action et possibilité de récupération sont requis.

## 11. Expérience utilisateur, responsive et PWA

L'interface vise une expérience calme, claire et rassurante. Elle rend visible le statut « lecture seule » sur l'accueil, dans le tableau de messages et dans la navigation. Les erreurs de configuration, d'authentification ou de Gmail sont reformulées en français et affichées dans le contexte approprié.

La mise en page comporte trois paliers principaux :

- grand écran : navigation latérale fixe, barre de recherche et liste détaillée ;
- largeur intermédiaire : navigation latérale escamotable avec fond de protection ;
- mobile : contenu condensé, actions secondaires masquées et lignes de messages réorganisées.

Les états chargement, vide, erreur, déconnecté et configuré/non configuré sont explicitement prévus. Les préférences système de réduction des animations sont respectées.

La PWA offre aujourd'hui le manifeste, l'icône, le mode autonome et la mise à jour automatique du service worker. L'usage réellement hors ligne n'est pas un objectif de la V1 : les e-mails restent dépendants du backend et de Gmail. Une évolution hors ligne devra éviter de mettre en cache des données sensibles sans consentement et sans chiffrement approprié.

## 12. Évolutivité V2 à V7

### V2 — Classification et nettoyage prudent

- ajouter un moteur de règles déterministe sur l'expéditeur, le domaine, le sujet, l'extrait, les labels et les liens ;
- produire des catégories telles que Adulte, Rencontres, Spam, Newsletter, Publicité, Arnaque, Important, Personnel, Travail et Facture ;
- associer une justification et un score aux résultats ;
- introduire une quarantaine réversible avant toute suppression ;
- conserver un mode simulation pour mesurer les faux positifs.

Cette version nécessitera de revoir le scope OAuth uniquement au moment où une action Gmail sera réellement activée.

### V3 — Tableau de bord

- synthétiser les volumes analysés par catégorie et par action ;
- afficher tendances, historique et temps estimé économisé ;
- distinguer clairement les analyses, recommandations et actions exécutées.

Une persistance locale, probablement SQLite pour l'usage personnel, pourra devenir pertinente pour les agrégats et l'historique, sans recopier inutilement le corps des messages.

### V4 — Règles personnalisées

- permettre listes blanche et noire, domaines autorisés et expéditeurs approuvés ;
- créer des règles conditionnelles ordonnées avec aperçu de leur impact ;
- gérer priorités, conflits, activation, versionnement et retour arrière.

### V5 — Intelligence artificielle

- ajouter la catégorisation, le résumé, la détection d'intention et de fraude ;
- fournir un score de confiance et une explication exploitable ;
- comparer les résultats de l'IA au moteur de règles de référence ;
- minimiser et anonymiser les données envoyées à un éventuel fournisseur externe.

L'IA recommande ; elle ne déclenche pas seule une action destructive.

### V6 — Apprentissage à partir des corrections

- enregistrer les corrections explicites de l'utilisateur ;
- adapter progressivement les préférences et seuils ;
- rendre les apprentissages consultables, modifiables et supprimables ;
- mesurer précision, rappel et dérive avant toute automatisation accrue.

### V7 — Agent autonome

- exécuter des analyses planifiées ;
- appliquer uniquement des règles et seuils autorisés ;
- produire un rapport complet des décisions et actions ;
- notifier les cas ambigus et permettre l'interruption immédiate ;
- garantir audit, idempotence, reprise sur erreur et récupération.

## 13. Principes de conception durables

1. Demander la permission minimale pour chaque version.
2. Séparer la donnée Gmail source, l'analyse, la recommandation et l'action.
3. Préférer une action réversible et explicable.
4. Ne stocker que ce qui est indispensable, pour une durée connue.
5. Mesurer la qualité avant d'augmenter l'autonomie.
6. Garder le backend comme frontière de confiance avec Gmail.
7. Concevoir l'interface pour que l'utilisateur sache toujours ce que MailMind peut lire, décider et modifier.
8. Faire évoluer l'architecture de session et de persistance avant tout passage au multi-utilisateur ou au déploiement public.
