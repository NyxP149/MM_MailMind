# MailMind

MailMind est une application web personnelle qui connecte Gmail à une interface claire et responsive. La V2 peut appliquer ou retirer un label de quarantaine après confirmation explicite ; elle ne possède aucune fonction de suppression ou de mise à la corbeille.

## Fonctionnalités disponibles

- connexion Google OAuth 2.0 avec validation de l’état ;
- accès Gmail limité au scope `gmail.modify`, nécessaire pour lire les messages et gérer le label réversible ;
- jetons OAuth conservés uniquement en mémoire côté serveur ;
- liste paginée des messages et recherche locale ;
- interface responsive installable comme PWA ;
- thème clair ou sombre, initialisé selon le système puis mémorisé dans le navigateur ;
- aucun stockage du contenu des e-mails et aucune base de données.

### V2 — Classification prudente

- classification locale par règles explicables ;
- catégories Adultes, Rencontres, Spam, Arnaque, Newsletter, Publicité, Facture, Travail, Important et Autre ;
- score de confiance et motifs détectés visibles dans l’interface ;
- synthèse des messages analysés et filtres par catégorie ;
- quarantaine **virtuelle** pour les messages suspects : aucun déplacement ni changement n’est appliqué dans Gmail.
- correction manuelle des catégories dans les vues d’analyse ;
- validation « Confirmer » ou « Faux positif », conservée dans le stockage local du navigateur.
- scanner progressif permettant d’analyser 50, 100 ou 250 messages par session.
- tableau **Qualité** : précision observée, couverture, confirmations, faux positifs et corrections ;
- export JSON anonymisé des métriques et décisions, sans contenu d’e-mail.
- label Gmail réversible `MailMind/Quarantine`, appliqué message par message après une seconde confirmation ;
- restauration par retrait du label, sans déplacer le message ni altérer son état d’origine.

### V3 — Tableau de bord local

- synthèse du volume chargé et des validations ;
- nombre de messages actuellement labellisés dans Gmail et restaurations effectuées ;
- répartition visuelle des catégories ;
- historique local des actions sans identifiant ni contenu d’e-mail ;
- estimation indicative du temps économisé, avec hypothèses affichées dans l’interface.

### V4 — Règles personnalisées

- règles sur l’adresse, le domaine ou le nom de l’expéditeur et sur le sujet ;
- opérateurs « contient » et « est exactement » ;
- catégorie cible choisie par l’utilisateur ;
- activation, désactivation et suppression ;
- stockage local et application immédiate à tous les messages chargés.

### V5 — Assistant IA optionnel

- analyse à la demande d'un seul message sélectionné ;
- résumé, intention, catégorie, confiance, niveau de risque et recommandation ;
- aperçu exact des données avant envoi et consentement obligatoire pour chaque analyse ;
- sujet, domaine expéditeur, extrait limité et suggestion locale uniquement — aucun identifiant Gmail ni adresse complète ;
- réponse structurée via l'API OpenAI, avec `store: false` ;
- aucune action Gmail déclenchée par l'IA.

### V6 — Apprentissage local

- création d'exemples à partir des corrections manuelles explicites ;
- mémorisation locale limitée au domaine non partagé, aux mots-clés normalisés et à la catégorie corrigée ;
- activation prudente après deux domaines ou trois mots-clés concordants, avec au moins 75 % de cohérence ;
- priorité conservée aux corrections manuelles et aux règles personnalisées ;
- tableau de bord des préférences actives et des signaux encore en observation ;
- mémoire limitée à 500 exemples et entièrement réinitialisable ;
- aucune synchronisation, aucun appel IA et aucune action Gmail automatique.

Priorité de classification : correction manuelle d’un message, puis première règle personnalisée active correspondante, puis moteur automatique MailMind. Une règle ne déclenche jamais automatiquement une action Gmail.

Les corrections et validations sont propres au navigateur utilisé. Elles ne sont ni envoyées à Gmail ni synchronisées avec un serveur. Effacer les données du site dans le navigateur les réinitialise.

Le bouton **Analyser plus** poursuit la pagination Gmail à partir des messages déjà chargés. Chaque requête est limitée à 50 messages, les doublons sont éliminés par identifiant Gmail et l’interface est mise à jour après chaque lot.

La précision affichée correspond au nombre de suggestions confirmées parmi les suggestions effectivement vérifiées. Elle ne constitue pas une mesure globale tant que l’échantillon est petit ou non représentatif.

## Prérequis

- Node.js 20 ou supérieur ;
- npm 10 ou supérieur ;
- un compte Google et un projet Google Cloud.

## Installation

```bash
git clone https://github.com/NyxP149/MM_MailMind.git
cd MM_MailMind
npm install
```

Créez la configuration du backend :

```bash
cp backend/.env.example backend/.env
```

Sous PowerShell :

```powershell
Copy-Item backend/.env.example backend/.env
```

Complétez ensuite `backend/.env`, puis lancez les deux applications :

```bash
npm run dev
```

Sous Windows, vous pouvez aussi lancer directement :

```powershell
.\start-mailmind.ps1
```

Gardez ce terminal ouvert pendant l’utilisation de MailMind. Fermer le terminal arrête les serveurs locaux et rend `localhost:5173` inaccessible.

- Interface : http://localhost:5173
- API : http://localhost:3000/api/health

## Configuration Google Cloud

1. Ouvrez la [console Google Cloud](https://console.cloud.google.com/) et créez un projet.
2. Dans **API et services > Bibliothèque**, activez **Gmail API**.
3. Dans **Google Auth Platform**, configurez l’écran de consentement.
4. Pour un projet personnel en mode test, ajoutez votre adresse Gmail dans **Utilisateurs tests**.
5. Dans **Clients**, créez un client OAuth de type **Application Web**.
6. Ajoutez cette URI de redirection autorisée, exactement :

   ```text
   http://localhost:3000/api/auth/google/callback
   ```

7. Copiez l’ID client et le secret dans `backend/.env`.
8. Générez une valeur `COOKIE_SECRET` d’au moins 32 caractères. Exemple avec Node :

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

Le fichier `.env` est ignoré par Git. Ne publiez jamais le secret client ni les jetons OAuth.

## Configuration facultative de l'assistant V5

### Ollama local — recommandé pour un usage gratuit

Installez Ollama, téléchargez un modèle avec `ollama pull qwen3:4b`, puis ajoutez dans `backend/.env` :

```dotenv
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:4b
```

Ollama doit rester démarré pendant l'utilisation de l'Assistant. Les données minimisées restent sur la machine et aucune clé API n'est nécessaire.

Les analyses sont lancées comme des tâches backend temporaires. Elles continuent si l'utilisateur change de vue ou recharge l'interface, puis le résultat est récupéré automatiquement au retour dans l'Assistant. Les résultats expirent après 30 minutes et disparaissent au redémarrage du backend.

### OpenAI — optionnel

Pour utiliser OpenAI à la place, ajoutez :

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=votre-cle-api
OPENAI_MODEL=gpt-5.4-nano
```

Redémarrez ensuite MailMind. La clé OpenAI reste dans le backend et n'est jamais envoyée au navigateur. Sans fournisseur valide, toutes les versions précédentes continuent de fonctionner et la vue Assistant affiche simplement les instructions d'activation.

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Lance le frontend et le backend |
| `npm test` | Exécute les tests des deux espaces |
| `npm run build` | Génère la PWA de production |
| `npm start` | Lance uniquement l’API |

## Architecture

```text
frontend/  React + Vite + PWA
backend/   Express + Google OAuth2 + Gmail API
```

Les appels Gmail passent exclusivement par le backend. Le frontend ne reçoit jamais les jetons Google. Dans cette V1 sans base de données, une relance du backend demande simplement de reconnecter Gmail.

## Sécurité et limites de la V1

- Le scope demandé est `gmail.modify`, classé restreint par Google. En mode test personnel, seul un utilisateur test explicitement autorisé peut consentir.
- Les seules mutations implémentées ajoutent ou retirent `MailMind/Quarantine`. Aucune route de suppression, corbeille, envoi ou modification de contenu n’existe.
- Les jetons vivent uniquement en mémoire et disparaissent au redémarrage.
- L’application est conçue pour un usage personnel local. Avant un déploiement public, ajoutez une session persistante chiffrée, HTTPS, une politique d’accès et une procédure de rotation des secrets.

## Roadmap

Les versions V1 à V7 sont disponibles : Gmail, classification prudente, dashboard, règles personnalisées, assistant IA locale à la demande, apprentissage à partir des corrections et agent autonome contrôlé. La V7 permet de simuler puis d’autoriser un lot de labels de quarantaine réversibles selon un seuil et des catégories explicites. Elle produit des rapports exportables sans contenu d’e-mail. Toute action destructive reste désactivée.

## Agent contrôlé V7

La vue **Agent contrôlé** construit un plan sur les messages déjà chargés. Par défaut, elle fonctionne en simulation. Pour autoriser Gmail, l’utilisateur doit activer le mode contrôlé, armer explicitement le lot et confirmer une seconde fois le nombre d’actions proposé.

L’agent peut uniquement ajouter `MailMind/Quarantine`. Il ignore les messages déjà labellisés, laisse tous les cas ambigus inchangés et peut être interrompu entre deux actions. Les rapports locaux sont limités aux 30 plus récents et contiennent des compteurs, catégories, résultats et empreintes non réversibles — jamais de sujet, d’expéditeur, d’extrait ou d’identifiant Gmail.

### Planification V7.1

La vue **Agent contrôlé** permet aussi d’activer une simulation quotidienne à une heure locale et pour un lot de 10, 20 ou 50 messages. Cette tâche est exécutée par le backend : elle peut donc continuer si l’onglet ou le navigateur est fermé, à condition que `npm run dev` reste lancé et que la connexion Gmail en mémoire soit encore valide. Elle ne pose jamais de label et produit uniquement un rapport anonymisé à valider manuellement.

Cette planification locale n’est pas durable : sa configuration et ses 20 derniers rapports disparaissent au redémarrage du backend ou à la déconnexion. Une planification de production persistante nécessitera toujours une base de données, un stockage chiffré des jetons OAuth, des sessions isolées par utilisateur et un ordonnanceur durable.

### Centre d’activité V7.2

Le centre d’activité réunit les simulations manuelles, les simulations planifiées et les lots contrôlés. Il affiche les volumes analysés et exécutés, permet de filtrer les dix rapports les plus récents et d’exporter un rapport ou l’historique complet en JSON. L’agrégation déduplique les rapports par identifiant et conserve leur ordre chronologique. Les exports restent minimisés : aucun sujet, expéditeur, extrait ou identifiant Gmail n’y est ajouté.
