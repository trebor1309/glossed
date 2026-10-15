# Configuration web de production

Ce document décrit la configuration attendue pour le lancement web de Glossed.
Les valeurs secrètes et les clés API ne sont jamais versionnées dans le dépôt.

## Domaines

- `https://www.glossed.app` : application publique canonique.
- `https://glossed.app` : redirection permanente vers le domaine canonique, chemin conservé.
- `https://admin.glossed.app` : application d'administration.

Les trois domaines doivent être rattachés au même projet Vercel que ce dépôt. Après
chaque déploiement, vérifier que `www.glossed.app` sert le même hash d'asset que le
dernier déploiement Production et que le domaine nu redirige sans boucle.

Pendant la bêta fermée, définir `VITE_PUBLIC_APP_URL=https://glossed.vercel.app`
dans Vercel pour que les liens de confirmation Supabase reviennent toujours sur
le déploiement canonique, même lorsqu'une inscription est initiée depuis une URL
technique de déploiement. Au basculement de l'application sur le domaine public,
remplacer cette valeur par `https://www.glossed.app` et mettre à jour en même temps
les URL de redirection autorisées dans Supabase Auth.

## Google Maps et Places

Le projet Google Cloud de production doit avoir une facturation active et ces API
activées :

- Maps JavaScript API ;
- Places API (New).

Créer une clé navigateur dédiée à la production, limitée à ces deux API et aux
référents HTTP suivants :

    https://www.glossed.app
    https://glossed.app

Ajouter la clé dans Vercel sous `VITE_GOOGLE_MAPS_API_KEY`, uniquement pour
l'environnement Production. Une autre clé restreinte doit être utilisée pour les
déploiements Preview ; ne pas autoriser globalement `*.vercel.app`.

Le chargeur envoie uniquement l'origine comme référent (`authReferrerPolicy:
"origin"`) : les restrictions doivent donc viser les origines ci-dessus, sans
chemin.

L'application charge la version hebdomadaire de Maps pour la région belge et
utilise `PlaceAutocompleteElement` de Places API (New). Les écrans qui exigent des
coordonnées restent bloqués sur une sélection Google. L'onboarding accepte une
saisie manuelle si Google est indisponible afin de ne pas empêcher la création du
profil.

## Contrôles après déploiement

1. Ouvrir la page d'accueil et confirmer que les assets correspondent au dernier
   déploiement Production.
2. Vérifier la redirection de `glossed.app` vers `www.glossed.app`.
3. Tester une adresse belge dans l'onboarding, la découverte, une réservation et
   la zone de travail professionnelle.
4. Vérifier dans la console navigateur l'absence de `RefererNotAllowedMapError`,
   `ApiNotActivatedMapError` et `BillingNotEnabledMapError`.
5. Confirmer que `admin.glossed.app` ouvre toujours `admin.html`.
6. Lancer `npm run check:production-web` avant fusion.

La configuration exacte des domaines Vercel et des restrictions Google Cloud est
une opération d'infrastructure externe : elle doit être revue à chaque changement
de domaine avant une mise en production.
