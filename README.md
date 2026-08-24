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

Ajoutez dans `backend/.env` :

```dotenv
OPENAI_API_KEY=votre-cle-api
OPENAI_MODEL=gpt-5.4-nano
```

Redémarrez ensuite MailMind. La clé reste dans le backend et n'est jamais envoyée au navigateur. Sans cette configuration, toutes les versions précédentes continuent de fonctionner et la vue Assistant affiche simplement les instructions d'activation.

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

Les versions V1 à V5 sont disponibles : Gmail, classification prudente, dashboard, règles personnalisées et assistant IA à la demande. La prochaine étape est la V6, consacrée à l'apprentissage progressif à partir des corrections explicites. Toute action destructive reste désactivée.
