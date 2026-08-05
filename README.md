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

Prérequis : une version récente de Node.js compatible avec Vite 7 et un projet Supabase configuré.

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Renseigner au minimum `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` et `VITE_GOOGLE_MAPS_API_KEY` dans `.env.local`.

Commandes utiles :

```powershell
npm run lint       # contrôle sans modifier les fichiers
npm run lint:fix   # applique les corrections ESLint disponibles
npm run build      # build de production dans dist/
npm run check      # lint puis build
```

Le dépôt contient aussi un `pnpm-lock.yaml` historique. Tant qu'un gestionnaire unique n'a pas été choisi, utiliser npm, qui correspond au `package-lock.json` actuellement installé.

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

Le front compile, mais le projet ne contient pas encore les migrations SQL permettant de recréer le schéma, les politiques RLS, les triggers et les buckets Storage. Avant une remise en production, il faut également renforcer l'authentification et les autorisations des Edge Functions qui utilisent la clé `service_role`.

Les parcours prioritaires à valider sont : authentification/onboarding, création d'une réservation, proposition d'un professionnel, paiement, webhook, annulation/remboursement et messagerie.
