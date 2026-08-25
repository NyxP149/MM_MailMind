# MailMind — Déploiement

> Mise à jour V2 : le déploiement inclut classification locale et quarantaine Gmail réversible.

> Mise à jour V3 : le tableau de bord fonctionne sans service analytique externe.

> Mise à jour V4 : les règles personnalisées restent locales au navigateur.

> Mise à jour V5 : l'assistant IA est facultatif et nécessite une clé OpenAI conservée côté serveur.

> Mise à jour V6 : l'apprentissage fonctionne localement sans service ni base supplémentaire.

> Mise à jour V8 : déploiement Docker privé, accès par tunnel et persistance chiffrée.

> Mise à jour V9 : sas Gmail manuel `MailMind/À supprimer`, sans nouveau service ni nouveau scope OAuth.

> Mise à jour V10 : désabonnement contrôlé depuis les métadonnées Gmail, sans secret ni service backend supplémentaire.

## Statut actuel et périmètre

> **La V8 peut être publiée derrière Cloudflare Tunnel et Cloudflare Access pour un usage personnel privé. Elle ne doit pas être ouverte librement à plusieurs utilisateurs.**

Le frontend est une application React/Vite installable comme PWA. Le backend est une API Express qui réalise le flux Google OAuth 2.0 et appelle Gmail avec `gmail.modify`. Un unique client OAuth reste partagé par le processus Node.js. En V8, ses jetons peuvent être conservés dans une enveloppe chiffrée sur volume persistant, mais plusieurs visiteurs partageraient toujours le même état Gmail. Cette architecture convient à un service privé protégé par identité, pas à un service public.

## Déploiement privé V8 — procédure recommandée

### Prérequis

- Docker Desktop avec Docker Compose ;
- un domaine géré dans Cloudflare ;
- `cloudflared` installé sur la machine qui exécute MailMind ;
- Ollama démarré sur cette machine si l’IA locale doit rester active ;
- le projet Google Cloud et le compte Gmail déjà utilisés en local.

### 1. Générer la configuration privée

Depuis la racine du dépôt :

```powershell
.\deploy\initialize-deployment.ps1 -PublicUrl https://mailmind.votre-domaine.com
```

Pour un déploiement privé limité à cette machine, aucun domaine n'est requis :

```powershell
.\deploy\initialize-deployment.ps1 -PublicUrl http://localhost:8080 -ReuseBackendEnv
.\deploy\mailmind.ps1 config
.\deploy\mailmind.ps1 up
```

Ajoutez alors `http://localhost:8080` aux origines JavaScript autorisées et
`http://localhost:8080/api/auth/google/callback` aux URI de redirection du client OAuth Google.
L'exception HTTP est strictement limitée à `localhost`, conformément aux règles OAuth de Google.

Le script crée `.env.deploy`, génère `COOKIE_SECRET` et `DATA_ENCRYPTION_KEY`, puis refuse d’écraser un fichier existant. Ouvrez ce fichier et remplacez uniquement les valeurs Google :

```dotenv
GOOGLE_CLIENT_ID=votre-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=votre-secret-client
```

Ne commitez, ne transmettez et ne capturez jamais `.env.deploy`. Sauvegardez-le dans un gestionnaire de mots de passe : sans `DATA_ENCRYPTION_KEY`, les jetons chiffrés du volume sont irrécupérables.

### 2. Mettre à jour Google OAuth

Dans le client OAuth de type **Application Web**, ajoutez exactement :

```text
Origine JavaScript autorisée : https://mailmind.votre-domaine.com
URI de redirection autorisée  : https://mailmind.votre-domaine.com/api/auth/google/callback
```

Gardez également les valeurs localhost pour le développement. Tant que le projet Google reste en mode test, conservez votre adresse Gmail dans **Utilisateurs tests**.

### 3. Construire et démarrer MailMind

```powershell
.\deploy\mailmind.ps1 config
.\deploy\mailmind.ps1 up
.\deploy\mailmind.ps1 status
```

Vérifiez localement `http://localhost:8080` et `http://localhost:8080/api/health`. La santé doit afficher `persistenceReady: true`. Le port Docker est lié à `127.0.0.1` : il n’est pas publié sur le réseau local. `down` arrête les conteneurs sans supprimer le volume ; n’utilisez pas `docker compose down -v` sauf si vous voulez effacer les jetons et l’état planifié.

### 4. Créer le tunnel Cloudflare

```powershell
cloudflared tunnel login
cloudflared tunnel create mailmind
cloudflared tunnel route dns mailmind mailmind.votre-domaine.com
```

Copiez `deploy/cloudflared-config.example.yml` vers le fichier de configuration `cloudflared`, puis remplacez l’identifiant, le chemin du fichier d’identifiants et le domaine. Le service cible doit rester `http://localhost:8080`. Démarrez ensuite :

```powershell
cloudflared tunnel run mailmind
```

Après validation en mode interactif, installez `cloudflared` comme service Windows pour un fonctionnement permanent.

Référence officielle : [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/).

### 5. Protéger obligatoirement le domaine

Dans Cloudflare Zero Trust, créez une application **Access > Applications > Self-hosted** pour `mailmind.votre-domaine.com`. Ajoutez une politique **Allow** limitée à votre adresse e-mail et refusez tout autre visiteur. Testez dans une fenêtre privée : Cloudflare Access doit apparaître avant MailMind.

Cloudflare Access protège l’entrée, mais Google OAuth reste l’autorisation Gmail. Une fois Access validé, ouvrez le domaine public, reconnectez Google une fois et vérifiez que la carte latérale indique **Jetons chiffrés · Déploiement privé V8**.

Références officielles : [applications auto-hébergées Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/) et [règles OAuth Google](https://developers.google.com/identity/protocols/oauth2/web-server).

### 6. Ollama depuis Docker

Le backend utilise `http://host.docker.internal:11434`. Gardez Ollama démarré et testez une analyse. N’exposez jamais le port 11434 au tunnel ou à Internet. Si Docker ne peut pas joindre Ollama, désactivez temporairement l’assistant avec `AI_PROVIDER=openai` et une clé vide, ou configurez explicitement Ollama pour accepter uniquement les connexions nécessaires depuis Docker en conservant le pare-feu actif.

### Exploitation et mises à jour

```powershell
git pull
.\deploy\mailmind.ps1 up
.\deploy\mailmind.ps1 logs
```

La reconstruction conserve le volume `mailmind-data`. Après chaque mise à jour, vérifiez `/api/health`, la connexion Gmail, une simulation V7.1, le thème et le service worker. Le script `mailmind.ps1` ne contient volontairement aucune commande de suppression du volume.

### Sauvegarde et récupération

- sauvegarder `.env.deploy` séparément et de façon chiffrée ;
- sauvegarder le volume Docker uniquement si la reprise sans reconnexion est importante ;
- ne jamais restaurer le volume sans la même `DATA_ENCRYPTION_KEY` ;
- utiliser **Déconnecter Gmail** avant d’abandonner une installation afin de révoquer et effacer les jetons ;
- si la clé est perdue, supprimer explicitement le volume, générer une nouvelle configuration et reconnecter Google.

Le classificateur V2 s’exécute sans service d’IA externe. Les recommandations seules ne modifient pas Gmail. Le label actuel est `MailMind/À supprimer` ; l’ancien `MailMind/Quarantine` est migré automatiquement. La V9 utilise le scope `gmail.modify` déjà accordé et ne demande donc pas de nouvelle autorisation. Les actions Spam et Corbeille restent manuelles, bornées au sas et protégées par confirmation. Un journal d’audit en mémoire conserve les 100 dernières actions sans contenu d’e-mail.

### Exploitation du sas V9

Après la mise à jour, ouvrez **Sas de nettoyage** une première fois : le backend crée le label Gmail ou renomme l’ancien. Dans Gmail, le label apparaît dans la colonne de gauche sous `MailMind/À supprimer` et peut être consulté ou vidé manuellement.

Le seuil de 300 est informatif et ne nécessite aucun ordonnanceur supplémentaire. Le bouton de vidage déplace les messages vers la corbeille Gmail après saisie de la phrase exacte ; il ne les supprime pas définitivement. Pour un contrôle après déploiement, vérifiez le compteur, ouvrez le lien Gmail et testez d’abord isolation puis restauration sur un message sans importance. Ne testez Spam ou Corbeille qu’avec un message que vous acceptez de déplacer.

### Exploitation du désabonnement V10

La V10 ne demande aucun scope OAuth, variable d’environnement, conteneur ou accès sortant supplémentaire au backend. Le navigateur contacte la destination HTTPS déclarée seulement après confirmation. Un bloqueur de fenêtres ou une politique d’entreprise peut empêcher l’ouverture ; dans ce cas, autorisez ponctuellement les fenêtres pour MailMind ou utilisez directement le lien de désabonnement dans Gmail.

Testez d’abord avec une newsletter légitime que vous reconnaissez. Vérifiez le domaine présenté dans la confirmation. Pour un expéditeur inconnu, un spam ou une arnaque, utilisez plutôt le signalement Spam : une requête de désabonnement peut informer l’expéditeur que l’adresse est active. Le résultat final dépend du service tiers et ne peut pas être confirmé par MailMind.

Les validations V2 sont actuellement conservées dans `localStorage`. Elles survivent aux rechargements et redémarrages locaux, mais pas à l’effacement des données du site, au changement de navigateur ou d’origine. Un déploiement multi-appareil devra les déplacer vers un stockage serveur authentifié, isolé par utilisateur, avec chiffrement et politique de rétention.

Le scanner étendu n’ajoute aucun processus asynchrone au déploiement : la pagination est pilotée par le navigateur pendant que la page reste ouverte. Les appels Gmail sont séquentiels par lots de 50 au maximum. Pour des scans futurs de plusieurs milliers de messages, il faudra introduire une file de tâches, une reprise sur erreur, un suivi persistant et une gestion explicite des quotas Gmail.

Le tableau Qualité est calculé entièrement côté client. L’export JSON est généré et téléchargé localement sans être transmis au backend. Un futur service de synchronisation devra demander un consentement explicite avant tout envoi de données de feedback et conserver le même principe de minimisation.

Le tableau de bord V3 est également calculé côté client et ne nécessite ni base analytique ni télémétrie. Son historique est limité au navigateur actuel. Un déploiement multi-appareil devra définir une politique de rétention, un schéma d’événements sans contenu Gmail et une suppression accessible à l’utilisateur avant d’activer une synchronisation.

Les règles V4 n’ajoutent aucun service au déploiement. Elles résident dans `localStorage`, ne sont pas synchronisées et n’exécutent aucune mutation Gmail. Une future synchronisation devra isoler les règles par utilisateur, valider les valeurs côté serveur et prévoir export, import et suppression complète.

La V5 ajoute une dépendance réseau facultative vers l'API OpenAI. Chaque analyse est initiée par l'utilisateur, limitée à un seul message minimisé et envoyée avec `store: false`. Le déploiement doit conserver la clé dans son gestionnaire de secrets, limiter le débit de la route IA, surveiller les coûts et informer l'utilisateur du transfert vers un sous-traitant externe. L'absence de clé désactive proprement cette vue sans affecter Gmail ni les versions précédentes.

La V6 ne crée aucun appel réseau supplémentaire. Ses exemples et son modèle dérivé restent dans `localStorage`, avec une limite de 500 corrections et une commande de réinitialisation. Un déploiement multi-appareil ne doit pas synchroniser cette mémoire sans consentement, chiffrement, isolation par utilisateur, export et suppression complète. La suppression des données du site efface la mémoire V6.

Avant une mise en production publique, il faut notamment ajouter une vraie gestion des utilisateurs et des sessions, isoler les jetons par utilisateur, les chiffrer au repos, protéger les routes et les actions sensibles, puis faire vérifier l'application OAuth par Google si son audience l'exige. La section « Passage en production publique » détaille ces changements.

## Lancement local

### Prérequis

- Node.js 20 ou supérieur ;
- npm 10 ou supérieur ;
- un projet Google Cloud avec Gmail API activée ;
- un client OAuth de type **Application Web**.

### Installation

Depuis la racine du dépôt :

```powershell
npm install
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

Renseigner ensuite `backend/.env` :

```dotenv
GOOGLE_CLIENT_ID=identifiant-client.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=secret-client
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
FRONTEND_URL=http://localhost:5173
PORT=3000
COOKIE_SECRET=chaine-aleatoire-longue-et-unique
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:4b
OPENAI_API_KEY=cle-api-optionnelle-pour-la-v5
OPENAI_MODEL=gpt-5.4-nano
```

Le fichier `frontend/.env` peut conserver la valeur locale :

```dotenv
VITE_API_URL=http://localhost:3000
```

Générer `COOKIE_SECRET` avec au moins 32 octets aléatoires :

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Ne jamais versionner les fichiers `.env`. Lancer ensuite les deux services :

```powershell
npm run dev
```

- frontend : `http://localhost:5173` ;
- santé de l'API : `http://localhost:3000/api/health`.

Avec Ollama, le modèle reste chargé quelques minutes après une analyse. Sur une machine sans accélération GPU, une requête locale peut prendre plusieurs dizaines de secondes ; l'interface la poursuit en arrière-plan et récupère son résultat au retour sur la vue Assistant.

## Exploitation de l’agent V7

L’agent V7 s’exécute uniquement lorsque MailMind et le backend sont actifs. Il traite séquentiellement le lot déjà chargé dans le navigateur et utilise la route réversible de quarantaine. Une fermeture ou un rechargement pendant un lot réel arrête l’orchestration frontend ; au prochain lancement, le plan est recalculé et les messages déjà labellisés sont ignorés.

Les 30 derniers rapports sont stockés dans le `localStorage` du navigateur sous `mailmind:agent-reports:v1`. Ils ne contiennent pas de contenu d’e-mail, mais doivent tout de même être considérés comme des données locales d’audit. Effacer les données du site supprime ces rapports. L’export JSON est volontairement minimisé.

La V7.1 propose une simulation quotidienne côté backend. Elle peut fonctionner navigateur fermé et n’exécute aucune action Gmail. En développement sans V8, la configuration et les 20 rapports planifiés sont volatils. Avec le volume chiffré V8, ils survivent au redémarrage ; la déconnexion les efface volontairement. Utilisez d’abord **Simuler maintenant** pour valider la politique.

Ne pas considérer cette fonction comme un ordonnanceur de production. Avant toute persistance ou exécution réelle planifiée, ajouter : stockage chiffré des jetons OAuth, séparation des utilisateurs, base durable, ordonnanceur avec verrou distribué ou transactionnel, politique de reprise, rétention d’audit définie et mécanisme explicite de révocation.

Le centre d’activité V7.2 ne requiert aucune variable ni permission supplémentaire. Les rapports manuels restent liés au stockage local du navigateur ; les rapports planifiés restent liés au processus backend. Un export JSON constitue une copie locale sous le contrôle de l’utilisateur : il faut l’archiver ou le supprimer selon la politique de confidentialité personnelle, même s’il ne contient pas le contenu des e-mails.

Dans Google Cloud, l'URI de redirection autorisée doit correspondre **exactement** à `http://localhost:3000/api/auth/google/callback`. Ajouter le compte Gmail dans les utilisateurs tests si l'écran de consentement est encore en mode test.

## Variables d'environnement et secrets

### Backend

| Variable | Obligatoire | Usage |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | oui | identifiant du client OAuth Google |
| `GOOGLE_CLIENT_SECRET` | oui | secret du client OAuth Google |
| `GOOGLE_REDIRECT_URI` | oui | callback absolu déclaré dans Google Cloud |
| `COOKIE_SECRET` | oui | signature du cookie temporaire d'état OAuth |
| `FRONTEND_URL` | oui en production | origine exacte autorisée par CORS et destination des redirections |
| `PORT` | non | port d'écoute du backend, `3000` par défaut |
| `NODE_ENV` | oui en production | utiliser `production` pour activer notamment le cookie `Secure` |
| `AI_PROVIDER` | non | fournisseur V5 : `ollama` ou `openai` ; `openai` par défaut pour compatibilité |
| `OLLAMA_BASE_URL` | avec Ollama distant | API Ollama, `http://127.0.0.1:11434` par défaut |
| `OLLAMA_MODEL` | non | modèle local, `qwen3:4b` par défaut |
| `OPENAI_API_KEY` | avec `AI_PROVIDER=openai` | secret exclusivement serveur |
| `OPENAI_MODEL` | non | modèle OpenAI, `gpt-5.4-nano` par défaut |
| `DATA_ENCRYPTION_KEY` | V8 | secret d’au moins 32 caractères ; chiffre les jetons et l’état agent |
| `TOKEN_STORE_PATH` | V8 | chemin persistant de l’enveloppe OAuth, `/data/oauth.enc` dans Docker |
| `AGENT_STATE_PATH` | V8 | chemin persistant de l’état agent, `/data/agent-state.enc` dans Docker |

### Frontend

| Variable | Obligatoire | Usage |
| --- | --- | --- |
| `VITE_API_URL` | non avec le proxy V8 | URL publique du backend séparé ; sinon l’origine courante est utilisée |

Toute variable préfixée `VITE_` est visible par le navigateur. Aucun secret ne doit donc être placé dans la configuration frontend. En production, stocker les secrets backend dans le gestionnaire de secrets de l'hébergeur, avec accès limité au service API. Prévoir une procédure de rotation de `GOOGLE_CLIENT_SECRET`, `COOKIE_SECRET` et de la clé de chiffrement des jetons. Ne jamais écrire leur valeur dans les logs.

## Build et vérification de la PWA

Le build de production génère le frontend dans `frontend/dist` :

```powershell
npm test
npm run build
npm run preview --workspace frontend
```

Vérifier dans le navigateur :

- que le manifeste, l'icône et le service worker sont chargés sans erreur ;
- que l'installation PWA est proposée sur un navigateur compatible ;
- que la navigation et les ressources statiques fonctionnent après actualisation ;
- que `VITE_API_URL` désigne bien l'API de production ;
- que les mises à jour du service worker ne laissent pas une ancienne version durablement en cache.

Une PWA exige HTTPS hors `localhost`. Ne pas mettre en cache les réponses Gmail ou les routes d'authentification dans le service worker. Après chaque déploiement, contrôler le manifeste et le service worker dans l'onglet **Application** des outils développeur.

## Stratégie de déploiement production

Une topologie simple consiste à héberger :

- le contenu statique de `frontend/dist` sur un hébergeur frontend ou un CDN ;
- le backend Node.js sur un service managé, derrière HTTPS ;
- plus tard, une base de données et un gestionnaire de clés/secrets managés.

Exemple de domaines :

```text
Frontend : https://mailmind.example.com
Backend  : https://api.mailmind.example.com
Callback : https://api.mailmind.example.com/api/auth/google/callback
```

Configuration correspondante au moment du build et au démarrage :

```dotenv
# frontend/.env.production — valeur publique intégrée au build
VITE_API_URL=https://api.mailmind.example.com

# environnement du backend — secrets fournis par la plateforme
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://mailmind.example.com
GOOGLE_REDIRECT_URI=https://api.mailmind.example.com/api/auth/google/callback
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
COOKIE_SECRET=...
```

Déployer le backend comme un processus persistant avec `npm start`. La plateforme doit injecter son port si nécessaire, terminer TLS, effectuer des contrôles de santé sur `/api/health`, redémarrer le processus en cas d'échec et centraliser des logs expurgés. Le frontend doit servir `index.html` pour les routes applicatives et appliquer une politique de cache courte à ce fichier, mais longue et immutable aux ressources versionnées.

### Google OAuth en production

Dans le client OAuth Google :

1. déclarer l'origine JavaScript autorisée exacte `https://mailmind.example.com` si le flux ou de futurs composants Google l'utilisent côté navigateur ;
2. déclarer l'URI de redirection exacte `https://api.mailmind.example.com/api/auth/google/callback` ;
3. conserver séparément les URI locales et de production, idéalement avec des clients OAuth distincts ;
4. configurer l'écran de consentement, les domaines autorisés, les coordonnées de support, la page d'accueil et les liens de confidentialité requis ;
5. maintenir `gmail.modify` comme plafond et limiter le code aux labels réversibles ;
6. soumettre l'application à la vérification Google avant une audience externe si Google l'exige pour ce scope et ce mode de publication.

Le schéma, le domaine, le port, le chemin et la casse du callback doivent correspondre à la configuration Google. Un écart produit généralement `redirect_uri_mismatch`.

### HTTPS, CORS et cookies

- Forcer HTTPS et rediriger tout trafic HTTP vers HTTPS ; activer HSTS après validation complète des domaines.
- Autoriser par CORS uniquement l'origine frontend exacte. Ne pas utiliser `*` avec `credentials: true`.
- Le cookie OAuth actuel est `HttpOnly`, signé, `SameSite=Lax` et devient `Secure` lorsque `NODE_ENV=production`.
- Si frontend et API sont réellement cross-site, `SameSite=Lax` peut ne pas convenir aux futurs cookies de session : utiliser alors `SameSite=None; Secure`, limiter précisément le domaine et tester le callback sur les navigateurs ciblés. Des sous-domaines d'un même site sont préférables.
- Si le backend est derrière un proxy et émet des cookies sécurisés ou applique une limitation par IP, configurer explicitement `trust proxy` avec la topologie réelle.
- Pour une session authentifiée par cookie, ajouter une protection CSRF sur les routes mutatives, une durée de vie courte, une rotation d'identifiant après connexion et une invalidation côté serveur à la déconnexion.
- Définir des en-têtes de sécurité adaptés, une CSP testée, une limite de taille des requêtes et une limitation de débit sur l'authentification et l'API.

## Persistance chiffrée et isolation — requises avant production publique

La V8 chiffre durablement l’unique objet OAuth d’une installation privée. Il faut encore remplacer ce modèle global avant toute ouverture multi-utilisateur :

1. créer une identité applicative et une session serveur propres à chaque utilisateur ;
2. stocker les jetons par utilisateur dans une base durable, sans jamais les envoyer au frontend ;
3. chiffrer les jetons au niveau applicatif avec un algorithme authentifié, par exemple AES-256-GCM, et une clé gérée par KMS/gestionnaire de secrets — jamais dans la même base ;
4. conserver nonce/IV, version de clé et tag d'authentification avec le ciphertext ;
5. chiffrer en particulier le refresh token, limiter l'accès de la base et du service, et prévoir la rotation des clés avec rechiffrement progressif ;
6. rafraîchir les access tokens côté backend, gérer la concurrence des refreshs et persister les nouveaux jetons renvoyés par Google ;
7. révoquer les jetons lors de la déconnexion ou de la suppression du compte, puis supprimer les données associées ;
8. ne journaliser ni jetons, ni codes OAuth, ni contenu d'e-mails, et expurger les erreurs provenant des fournisseurs ;
9. ajouter des tests d'isolation garantissant qu'un utilisateur ne peut jamais lire les données Gmail d'un autre.

Le chiffrement au repos ne remplace pas le contrôle d'accès, TLS, la rotation, l'audit ni la réduction des données conservées.

## Passage en production publique

La publication doit rester bloquée tant que les points structurants suivants ne sont pas terminés :

- authentification multi-utilisateur et autorisation sur chaque route ;
- sessions persistantes sécurisées et stockage chiffré des jetons par utilisateur ;
- politique de confidentialité, conditions d'utilisation et procédure de suppression/export des données ;
- vérification OAuth Google et justification des scopes, lorsque requises ;
- séparation des environnements développement, préproduction et production ;
- gestionnaire de secrets, rotation et révocation documentées ;
- protection CSRF, limitation de débit, journalisation de sécurité et alertes ;
- sauvegardes chiffrées, restauration testée et politique de rétention minimale ;
- revue de dépendances, tests de sécurité et réponse aux incidents ;
- mécanisme explicite de confirmation et de récupération avant toute future action Gmail destructive.

## Checklist avant déploiement

### Qualité et disponibilité

- [ ] `npm test` réussit.
- [ ] `npm run build` réussit sans avertissement bloquant.
- [ ] `/api/health` répond et ne révèle aucun secret.
- [ ] Le frontend utilise l'URL API de l'environnement visé.
- [ ] Les redémarrages, délais réseau et erreurs Gmail donnent un comportement maîtrisé.
- [ ] Le rollback vers le build précédent est documenté et testé.

### Sécurité

- [ ] Aucun `.env`, secret, jeton ou code OAuth n'est présent dans Git, le bundle frontend ou les logs.
- [ ] Tous les secrets de production sont longs, uniques et injectés par un gestionnaire de secrets.
- [ ] HTTPS est obligatoire ; certificats et renouvellement sont supervisés.
- [ ] CORS contient uniquement l'origine frontend prévue.
- [ ] Cookies : `HttpOnly`, `Secure`, `SameSite` approprié, portée et durée minimales.
- [ ] Le scope Google est limité à `gmail.modify` et aucune route destructive n’est exposée.
- [ ] Les jetons sont isolés par utilisateur et chiffrés au repos avant toute ouverture publique.
- [ ] CSRF, limitation de débit, validation des entrées et en-têtes de sécurité sont testés.
- [ ] Les dépendances font l'objet d'un audit et d'un plan de mise à jour.
- [ ] Déconnexion, révocation Google et suppression des données sont vérifiées.

## Diagnostic

| Symptôme | Vérifications |
| --- | --- |
| `/api/health` indique `oauthReady: false` | contrôler les quatre variables OAuth obligatoires et redémarrer le backend |
| `redirect_uri_mismatch` chez Google | comparer caractère par caractère `GOOGLE_REDIRECT_URI` et l'URI autorisée dans Google Cloud |
| retour `invalid_state` | vérifier que le cookie OAuth est reçu au callback, que `COOKIE_SECRET` est stable entre instances et que `Secure`/`SameSite` correspondent au contexte HTTPS |
| erreur CORS dans le navigateur | vérifier `FRONTEND_URL`, le schéma/port exacts, puis la présence de `credentials: true` des deux côtés si des cookies applicatifs sont utilisés |
| connexion perdue après redémarrage | vérifier `persistenceReady`, le volume `mailmind-data`, les trois variables V8 et la stabilité de `DATA_ENCRYPTION_KEY` |
| un seul compte semble partagé | limitation critique de l'architecture V1 ; ne pas ouvrir le service et ajouter l'isolation par utilisateur |
| PWA non installable | vérifier HTTPS, manifeste, icône et service worker dans les outils développeur |
| frontend mis à jour mais ancienne interface visible | vider/mettre à jour le service worker, contrôler les règles de cache et vérifier que `index.html` n'est pas mis en cache trop longtemps |
| thème incorrect au premier affichage | vérifier que le script de thème de `index.html` est autorisé par la CSP et que `localStorage` n'est pas bloqué |
| erreurs 401 Gmail | vérifier l'expiration/révocation, le refresh token et l'état de la session ; en V1, reconnecter Gmail |
| cookies absents derrière un proxy | vérifier HTTPS public, `NODE_ENV=production`, les attributs du cookie et la configuration proxy du backend |

Pour diagnostiquer sans fuite de données, journaliser des identifiants de corrélation, codes d'erreur et durées, mais jamais les jetons, codes d'autorisation, secrets, cookies ni le contenu des e-mails.
