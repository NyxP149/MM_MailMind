# MailMind

MailMind est une application web personnelle qui connecte Gmail à une interface claire et responsive. Cette première version est volontairement **en lecture seule** : elle affiche les e-mails, mais ne peut ni les modifier ni les supprimer.

## Fonctionnalités V1

- connexion Google OAuth 2.0 avec validation de l’état ;
- accès Gmail limité au scope `gmail.readonly` ;
- jetons OAuth conservés uniquement en mémoire côté serveur ;
- liste paginée des messages et recherche locale ;
- interface responsive installable comme PWA ;
- aucun stockage du contenu des e-mails et aucune base de données.

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

- Le scope demandé est `gmail.readonly`, inférieur au scope de modification envisagé dans la feuille de route.
- Aucune route de suppression, d’archivage ou de labellisation n’existe.
- Les jetons vivent uniquement en mémoire et disparaissent au redémarrage.
- L’application est conçue pour un usage personnel local. Avant un déploiement public, ajoutez une session persistante chiffrée, HTTPS, une politique d’accès et une procédure de rotation des secrets.

## Roadmap

La suite prévue : classification par règles et quarantaine (V2), tableau de bord (V3), règles personnalisées (V4), puis intelligence artificielle et apprentissage progressif. Toute action destructive restera désactivée tant qu’elle n’aura pas de validation explicite et de mécanisme de récupération.
