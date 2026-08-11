# Glossed

Glossed est une marketplace de prestations mettant en relation des clients et des professionnels. Le front propose deux dashboards, la réservation, les offres, la messagerie, les profils publics et les paiements Stripe Connect.

## Stack

- React 19 et Vite 7
- React Router
- Supabase (Auth, Postgres, Realtime, Storage et Edge Functions)
- Stripe Checkout et Connect
- Tailwind CSS et Bootstrap Icons
- Google Maps

## Démarrage local

Prérequis : Node.js 24, npm 11 et un projet Supabase configuré. Les versions
attendues sont déclarées dans `package.json` et `.nvmrc`.

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Renseigner au minimum `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` et `VITE_GOOGLE_MAPS_API_KEY` dans `.env.local`.

Commandes utiles :

```powershell
npm run lint       # contrôle sans modifier les fichiers
npm run lint:e2e   # contrôle des tests et lanceurs Playwright
npm run lint:fix   # applique les corrections ESLint disponibles
npm run build      # build de production dans dist/
npm run check:bundle # vérifie le budget du chunk JavaScript initial
npm run check      # lint, build et budget du bundle
npm run test:e2e   # tests navigateur Playwright sans données distantes
npm run test:e2e:auth # tests authentifiés distants en lecture seule
```

npm est l'unique gestionnaire de paquets du projet. `package-lock.json` doit être
mis à jour et committé avec toute modification des dépendances. La CI et Vercel
installent les dépendances avec `npm ci`.

## Tests navigateur

Le premier lot Playwright couvre les pages publiques, la navigation principale,
les routes inconnues et les redirections des routes protégées sans session. Le
serveur de test reçoit par défaut une configuration Supabase locale factice et les
requêtes vers Supabase et Stripe sont bloquées : ces tests ne lisent ni ne
modifient aucune donnée distante.

Après `npm ci`, installer Chromium une fois puis lancer les tests :

```powershell
npx playwright install chromium
npm run test:e2e
```

Les tests authentifiés utilisent uniquement des comptes et un projet de test via
des variables `E2E_*` non versionnées.

### Parcours authentifiés en lecture seule

Les parcours client, prestataire et administrateur utilisent un déploiement de test
réel, mais bloquent toute écriture métier Supabase ainsi que tout appel Stripe. Ils
vérifient uniquement la connexion, la restauration de session et les autorisations
des routes.

La connexion peut mettre à jour les métadonnées techniques de Supabase Auth, telles
que `last_sign_in_at`, mais aucune table métier n’est modifiée.

Copier `.env.e2e.auth.example` vers `.env.e2e.auth`, puis renseigner trois comptes
de test distincts et déjà onboardés :

```powershell
Copy-Item .env.e2e.auth.example .env.e2e.auth
npm run test:e2e:auth
```

Le compte client doit avoir le rôle actif `client`, le prestataire le rôle permanent
et actif `pro`, et seul le troisième compte doit être administrateur. Le fichier
`.env.e2e.auth` et les états de session Playwright sont ignorés par Git.

Le workflow manuel `Authenticated E2E` lit la même configuration depuis les variables
`E2E_BASE_URL` et `E2E_SUPABASE_URL` de l’environnement GitHub `e2e`, ainsi que les
six secrets `E2E_*_EMAIL` et `E2E_*_PASSWORD`. Il ne doit être activé qu’avec des
comptes dédiés au projet de test.

## Organisation

- `src/router` : routes publiques, onboarding et protections d'accès
- `src/pages/dashboard` : parcours client
- `src/pages/prodashboard` : parcours professionnel
- `src/components/chat` : messagerie Supabase Realtime
- `src/lib` : client Supabase et accès aux données
- `supabase/functions` : fonctions privilégiées pour Stripe Connect et les remboursements
- `api/stripe-webhook.js` : proxy Vercel conservant le corps brut des webhooks Stripe

## Configuration et secrets

Copier `.env.example` vers `.env.local`. Les variables préfixées par `VITE_` sont publiques dans le navigateur. Ne jamais y placer de clé Stripe secrète ni la clé Supabase `service_role`.

Les secrets des Edge Functions doivent être configurés côté Supabase, par exemple :

```powershell
supabase secrets set STRIPE_SECRET_KEY=... STRIPE_WEBHOOK_SECRET=... APP_URL=... ALLOWED_ORIGINS=...
```

Les fonctions appelées par un utilisateur conservent la vérification JWT Supabase par défaut. Seule `stripe-payment-webhook` utilise `verify_jwt = false`, car elle authentifie Stripe avec la signature du corps brut et `STRIPE_WEBHOOK_SECRET`.

Le proxy Vercel `/api/stripe-webhook` nécessite `SUPABASE_STRIPE_WEBHOOK_URL`. Dans Stripe, l'endpoint à déclarer est l'URL publique de ce proxy et l'événement requis est `checkout.session.completed`.

## État de la reprise

Les migrations Supabase reproductibles, les politiques RLS, les buckets privés
et les fonctions Stripe sécurisées sont versionnés dans `supabase/`. Les parcours
Stripe, les flux fonctionnels principaux et la vérification des professionnels ont
été validés en environnement de test.

Les tests navigateur publics et authentifiés sont automatisés. Les routes et les
modales sont chargées à la demande, et la CI impose un budget de 500 ko au chunk
JavaScript initial. Les prochains travaux portent sur le traitement progressif
des avertissements du front.
