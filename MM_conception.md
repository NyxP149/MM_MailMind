# MailMind — Conception

> Mise à jour V2 : classification explicable, validation humaine, mesure de qualité et label Gmail de quarantaine réversible.

> Mise à jour V3 : tableau de bord local, répartition des catégories et historique d’actions minimisé.

> Mise à jour V4 : règles personnalisées locales sans automatisation Gmail implicite.

> Mise à jour V5 : analyse IA facultative, unitaire et déclenchée uniquement après consentement.
> Mise à jour V7 : agent contrôlé, simulation, lots réversibles et rapports d’activité minimisés.

> Mise à jour V6 : apprentissage local, explicable et réinitialisable à partir des corrections.

## 1. Objet du document

Ce document décrit la conception fonctionnelle et technique de MailMind. Il distingue l'état réellement implémenté dans la V1 des orientations prévues par la feuille de route.

MailMind est un assistant personnel de gestion de Gmail. Sa vision est de passer progressivement d'une consultation claire de la boîte mail à un assistant capable de comprendre, classer et, après validation, traiter les messages selon les préférences de l'utilisateur.

La priorité de conception est la confiance : les accès doivent être minimaux, les données ne doivent pas être conservées sans nécessité et aucune action destructive ne doit être introduite sans garde-fous explicites.

## État de conception de la V2

La V2 introduit une analyse déterministe des métadonnées déjà récupérées : sujet, extrait, nom et domaine de l’expéditeur, labels Gmail. Le moteur normalise les accents et la casse, applique des règles pondérées, puis retourne une catégorie principale, un score de confiance, une recommandation et jusqu’à trois motifs explicables.

Les catégories actuelles sont : Adultes, Rencontres, Spam, Arnaque, Newsletter, Publicité, Facture, Travail, Important et Autre. Les recommandations possibles sont `keep`, `review` et `quarantine`.

La quarantaine commence comme une vue virtuelle. Après confirmation humaine puis confirmation d’action, MailMind peut ajouter le label `MailMind/Quarantine` dans Gmail. Le message n’est ni déplacé, ni archivé, ni mis à la corbeille. La restauration retire uniquement ce label, ce qui préserve exactement l’état Gmail d’origine. Le scope OAuth est `gmail.modify` ; aucune capacité de suppression n’est exposée par l’application.

### Boucle de validation humaine

L’utilisateur peut corriger la catégorie proposée, confirmer qu’un message est indésirable ou le signaler comme faux positif. Ces décisions ont priorité sur la suggestion automatique pour l’affichage et les indicateurs. Elles sont stockées dans `localStorage`, donc limitées au navigateur et à l’origine locale actuels. Elles ne constituent pas encore un apprentissage statistique ; elles produisent le jeu de corrections qui permettra de mesurer et améliorer les règles avant l’introduction d’une IA.

### Scanner étendu

L’analyse initiale reste limitée à 20 messages afin de produire rapidement le premier écran. L’utilisateur peut ensuite étendre explicitement l’échantillon à 50, 100 ou 250 messages. Le frontend orchestre la pagination existante et le backend borne chaque appel Gmail entre 1 et 50 messages. Cette conception limite les pics de quota, donne une progression observable et conserve le contrôle utilisateur sur le volume consulté.

### Mesure de qualité

La vue Qualité transforme les validations en indicateurs : précision observée, couverture de vérification, confirmations, faux positifs, corrections et éléments en attente. La précision est calculée uniquement sur les suggestions de quarantaine ayant reçu une décision ; elle doit donc toujours être interprétée avec la couverture et la taille de l’échantillon. Le détail par catégorie permet d’identifier les règles nécessitant un ajustement.

Un export JSON local exclut les identifiants Gmail, sujets, expéditeurs et extraits. Il conserve seulement les catégories automatiques, corrections, décisions et agrégats nécessaires à l’évaluation.

### Quarantaine Gmail réversible

Une suggestion doit être confirmée dans la quarantaine virtuelle avant que le bouton Gmail apparaisse. Un second consentement contextuel décrit exactement l’effet : ajouter un label, sans déplacer ni supprimer le message. L’API exige aussi une preuve de confirmation distincte dans l’en-tête HTTP. La restauration retire le label et n’ajoute aucun autre label système, ce qui évite de modifier l’état antérieur du message.

## Tableau de bord V3

Le tableau de bord agrège les messages actuellement chargés, les décisions locales et l’historique d’actions du navigateur. Il affiche volumes, validations, labels Gmail actifs, restaurations et catégories. L’historique enregistre seulement `action`, `at`, `category` et `categoryLabel`, jamais l’identifiant Gmail ou le texte du message.

L’estimation du temps économisé est volontairement simple et visible : 12 secondes par validation et 8 secondes par action Gmail. Elle est indicative et ne doit pas être présentée comme une mesure exacte de productivité.

## Règles personnalisées V4

Une règle porte sur l’adresse, le domaine ou le nom de l’expéditeur, ou sur le sujet. Elle utilise une comparaison « contient » ou « est exactement » et attribue une catégorie existante. Les règles sont évaluées dans leur ordre d’affichage ; la première correspondance active gagne.

L’ordre de priorité global est : correction manuelle du message, règle personnalisée, classification automatique. Les règles influencent les suggestions, filtres et métriques, mais ne peuvent jamais appliquer seules un label Gmail. Cette séparation empêche qu’une règle trop large provoque une mutation distante sans validation humaine.


## 2. Vision produit

La promesse à long terme est : **« Créer un assistant qui comprend mes e-mails. »**

Le premier cas d'usage visé par la feuille de route est l'identification des messages indésirables, notamment les publicités, les contenus adultes, les sites de rencontre, les newsletters et les arnaques. La cible finale est plus large : repérer les messages importants, retrouver des factures, résumer des contenus, appliquer des règles et produire des rapports d'activité.

MailMind est conçu d'abord pour un usage personnel. La V1 ne comporte donc ni gestion multi-utilisateur, ni paiement, ni espace d'administration.

## 3. Périmètre de la V1

### Inclus et implémenté

- connexion à un compte Google avec OAuth 2.0 ;
- validation du paramètre OAuth `state` ;
- permission Gmail limitée à `gmail.modify` pour la lecture et la gestion du label réversible ;
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

Les vues Catégories, Quarantaine, Qualité, Règles et Assistant sont actives. Le bouton favori ne déclenche aucune modification Gmail.

## Assistant IA V5

La V5 ajoute une seconde lecture consultative, sans remplacer le moteur de règles. L'utilisateur choisit un message, voit précisément les champs qui seront transmis et confirme chaque requête. Les données envoyées sont limitées au sujet, au domaine de l'expéditeur, à un extrait borné et à la suggestion locale. L'adresse complète, le nom de l'expéditeur, l'identifiant Gmail, les labels et le corps intégral sont exclus.

Le fournisseur est interchangeable. Le mode `ollama` exécute le modèle sur la machine de l'utilisateur et constitue le choix local par défaut recommandé ; le mode `openai` reste disponible avec une clé serveur. Cette séparation conserve la même minimisation et le même contrat de résultat quel que soit le moteur.

L'IA renvoie une structure contrôlée : résumé, intention, catégorie, confiance, risque, raisons et recommandation. Ce résultat n'est pas appliqué automatiquement au classement local et ne possède aucun accès aux routes Gmail. Il sert à comparer une analyse sémantique au moteur déterministe, conformément au principe « l'IA recommande, l'utilisateur décide ».

## Apprentissage local V6

Chaque correction de catégorie peut produire un exemple local minimisé : empreinte non réversible du message, domaine expéditeur lorsqu'il ne s'agit pas d'un fournisseur partagé, mots-clés normalisés du sujet, catégorie choisie et date. Le sujet complet, l'adresse complète, le nom, l'extrait et le corps ne sont pas conservés dans cette mémoire.

Un signal ne devient actif qu'après plusieurs observations concordantes : deux pour un domaine, trois pour un mot-clé, avec une cohérence minimale de 75 %. Une préférence apprise reste moins prioritaire qu'une correction manuelle ou qu'une règle V4 créée explicitement. Elle change uniquement la suggestion locale et ne déclenche aucune action Gmail.

La vue Apprentissage rend visibles les signaux actifs, leur confiance et les observations encore insuffisantes. L'utilisateur peut réinitialiser toute la mémoire V6 sans effacer ses corrections de messages. La mémoire est bornée à 500 exemples dans `localStorage`.

## Agent autonome contrôlé V7

La V7 introduit une autonomie bornée sur les messages déjà chargés. Une politique locale définit le seuil de confiance et les catégories autorisées. Le plan sépare explicitement les actions éligibles, les cas ambigus, les messages protégés et les actions déjà réalisées. Une décision humaine « faux positif / sûr » est toujours prioritaire et exclut définitivement le message du lot courant. Le mode par défaut est une simulation sans effet Gmail.

Une exécution réelle nécessite l’activation du mode contrôlé, l’armement explicite du lot et une confirmation récapitulant le nombre d’actions. La seule capacité accordée est l’ajout du label réversible `MailMind/Quarantine`. L’arrêt empêche toute nouvelle action après celle éventuellement déjà engagée. L’idempotence repose sur l’état `quarantined` : un message déjà labellisé est ignoré lors d’une reprise.

Chaque lot produit un rapport local limité aux métriques, catégories, politique, état, erreurs et empreintes non réversibles. Aucun contenu, expéditeur ou identifiant Gmail n’est enregistré dans le rapport.

La V7.1 ajoute une planification quotidienne en mémoire côté backend. Elle reprend uniquement le seuil, les catégories autorisées, l’heure, le fuseau et la taille du lot. Elle relit Gmail et génère une **simulation** anonymisée, mais n’appelle aucune route de mutation : les corrections humaines et règles personnalisées étant locales au navigateur, aucune action autonome ne serait suffisamment sûre. Cette tâche peut tourner navigateur fermé tant que le backend et la session OAuth en mémoire restent actifs. La configuration et les 20 rapports planifiés disparaissent au redémarrage ou à la déconnexion. Une planification durable demeure conditionnée à des jetons chiffrés, des sessions isolées et un ordonnanceur persistant.

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
5. Le backend redirige vers Google avec le scope `gmail.modify`, un accès hors ligne et un consentement explicite.
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
| Scope `gmail.modify` | Permettre le label réversible | Les routes applicatives restent limitées à ajouter/retirer le label MailMind |
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
- capacité distante réduite au label réversible malgré le scope Gmail requis ;
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

L'interface vise une expérience calme, claire et rassurante. Elle rappelle qu’aucune suppression n’existe et qu’une confirmation explicite précède chaque changement Gmail. Les erreurs de configuration, d'authentification ou de Gmail sont reformulées en français et affichées dans le contexte approprié.

La mise en page comporte trois paliers principaux :

- grand écran : navigation latérale fixe, barre de recherche et liste détaillée ;
- largeur intermédiaire : navigation latérale escamotable avec fond de protection ;
- mobile : contenu condensé, actions secondaires masquées et lignes de messages réorganisées.

Les états chargement, vide, erreur, déconnecté et configuré/non configuré sont explicitement prévus. Les préférences système de réduction des animations sont respectées.

L'interface propose également un thème clair et un thème sombre. Lors de la première visite, le choix suit la préférence du système ; une sélection explicite de l'utilisateur devient ensuite prioritaire et reste locale au navigateur. La bascule demeure disponible sur l'écran de connexion, dans l'application et sur mobile. Les deux palettes conservent les mêmes repères fonctionnels et des contrastes adaptés.

La PWA offre aujourd'hui le manifeste, l'icône, le mode autonome et la mise à jour automatique du service worker. L'usage réellement hors ligne n'est pas un objectif de la V1 : les e-mails restent dépendants du backend et de Gmail. Une évolution hors ligne devra éviter de mettre en cache des données sensibles sans consentement et sans chiffrement approprié.

## 12. Évolutivité V2 à V7

### V2 — Classification et nettoyage prudent

- ajouter un moteur de règles déterministe sur l'expéditeur, le domaine, le sujet, l'extrait, les labels et les liens ;
- produire des catégories telles que Adulte, Rencontres, Spam, Newsletter, Publicité, Arnaque, Important, Personnel, Travail et Facture ;
- associer une justification et un score aux résultats ;
- introduire une quarantaine réversible avant toute suppression ;
- conserver un mode simulation pour mesurer les faux positifs.

Le scope OAuth a été étendu à `gmail.modify` lors de l’activation de la quarantaine réversible. Toute nouvelle action Gmail nécessitera une revue séparée.

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

L’état actuel couvre les lots contrôlés déclenchés par l’utilisateur, l’audit local, l’arrêt, l’idempotence et la reprise manuelle. Une simulation quotidienne en mémoire peut fonctionner sans onglet ouvert tant que le backend reste actif. L’ordonnancement durable après redémarrage reste conditionné par une architecture de secrets, de sessions et de persistance adaptée.

## 13. Principes de conception durables

1. Demander la permission minimale pour chaque version.
2. Séparer la donnée Gmail source, l'analyse, la recommandation et l'action.
3. Préférer une action réversible et explicable.
4. Ne stocker que ce qui est indispensable, pour une durée connue.
5. Mesurer la qualité avant d'augmenter l'autonomie.
6. Garder le backend comme frontière de confiance avec Gmail.
7. Concevoir l'interface pour que l'utilisateur sache toujours ce que MailMind peut lire, décider et modifier.
8. Faire évoluer l'architecture de session et de persistance avant tout passage au multi-utilisateur ou au déploiement public.
