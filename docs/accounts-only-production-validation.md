# Validation de production — lancement « comptes uniquement »

Cette procédure valide le premier lancement public de Glossed : les visiteurs
peuvent créer un compte client ou professionnel, terminer leur profil, consulter
les profils publics et utiliser la messagerie. Les réservations, propositions et
paiements restent fermés.

Elle ne vaut pas autorisation d'ouvrir les réservations. Le flag `bookings` doit
rester désactivé jusqu'à la revue juridique finale et au pilote Stripe Live.

## Périmètre et règles de sécurité

- Cible bêta actuelle : `https://glossed.vercel.app` tant que
  `https://www.glossed.app` conserve la landing page.
- Administration : `https://admin.glossed.app` avec MFA.
- Utiliser uniquement des comptes jetables appartenant à Glossed/EWCS.
- Ne jamais tester une suspension sur un administrateur.
- Ne jamais laisser un compte suspendu après la recette.
- Ne jamais activer le flag `bookings` pour cette recette.
- Noter le commit, l'URL exacte du déploiement, la date, le testeur et les
  références générées. Ne pas copier de secret, mot de passe ou code MFA dans le
  compte rendu.

## Porte automatique

La suite authentifiée est volontairement non destructive : elle intercepte toute
écriture Supabase inattendue et bloque tout appel Stripe. Elle vérifie :

- les sessions client et pro et leurs restrictions de rôle ;
- la validité des acceptations juridiques des comptes E2E ;
- le compte client et le compte professionnel ;
- la découverte, le catalogue de services et le chargement réel de Google Places ;
- le profil public professionnel avec réservation désactivée ;
- le rendu des conversations sur mobile ;
- le formulaire Contact sans envoyer d'e-mail quotidien ;
- l'isolation de l'administration et sa frontière MFA ;
- l'absence d'action de réservation, proposition ou paiement disponible.

Avant la recette manuelle :

```bash
npm run check
npm run test:e2e:auth
```

Le workflow GitHub `Authenticated E2E` exécute la même suite chaque jour. Une
exécution verte sur le commit à publier est obligatoire.

## Recette manuelle destructive et e-mails

Ces contrôles ne sont pas planifiés dans la CI, car ils créent des utilisateurs,
envoient un vrai message ou modifient temporairement un compte.

### 1. Inscription client et preuve juridique

1. Créer un client avec une nouvelle adresse e-mail contrôlée.
2. Vérifier que les liens vers les Conditions client et la Confidentialité sont
   accessibles avant l'acceptation.
3. Confirmer l'e-mail depuis la boîte de réception, terminer l'onboarding et se
   reconnecter dans une nouvelle session privée.
4. Vérifier que le tableau de bord, le compte et les paramètres sont accessibles
   sans nouvelle demande d'acceptation.
5. Vérifier côté base que `user_legal_acceptances` contient les versions courantes,
   l'horodatage serveur et le contexte `signup`. Ne modifier aucune ligne.

### 2. Inscription et profil professionnel

1. Créer un professionnel avec une seconde adresse e-mail contrôlée.
2. Accepter les Conditions client, la Confidentialité et les Conditions
   professionnelles, puis confirmer l'e-mail.
3. Terminer l'onboarding avec une adresse belge proposée par Google.
4. Renseigner un nom commercial, au moins un service, une description et une zone
   de travail ; ouvrir ensuite son profil public depuis une session client.
5. Vérifier que le bouton affiche `Bookings opening soon`, qu'il est désactivé et
   qu'aucun prix fixe trompeur n'est présenté.

### 3. Découverte, Google Maps et messagerie

1. Depuis le client jetable, rechercher le service et la zone du professionnel.
2. Vérifier l'absence de `RefererNotAllowedMapError`,
   `ApiNotActivatedMapError` et `BillingNotEnabledMapError` dans la console.
3. Ouvrir le profil trouvé, démarrer une conversation et échanger un message dans
   chaque sens.
4. Recharger les deux sessions et vérifier que le fil, les noms et les avatars
   restent cohérents sur ordinateur et sur une largeur de 320 px.

### 4. Livraison réelle du formulaire Contact

1. Envoyer un seul message identifiable, par exemple sujet
   `RECETTE PROD COMPTES UNIQUEMENT`, depuis une adresse contrôlée.
2. Vérifier l'écran de succès et conserver la référence affichée.
3. Vérifier la réception dans la boîte de support, le `Reply-To` vers l'expéditeur
   et l'absence de données sensibles dans l'objet.
4. Vérifier que la demande correspondante existe dans `contact_requests` avec un
   statut de livraison réussi. Ne pas exposer son contenu dans le compte rendu.

### 5. Suspension et réactivation administrateur

Suivre également [Contrôle des comptes utilisateurs](./admin-user-account-controls.md).

1. Dans l'administration, rechercher le client jetable, ouvrir sa fiche et saisir
   un motif de recette d'au moins dix caractères.
2. Le suspendre, puis vérifier que sa session et une nouvelle connexion ne donnent
   plus accès aux données applicatives.
3. Vérifier dans l'historique de la fiche que l'acteur, le motif et la transition
   `active → suspended` sont présents.
4. Réactiver immédiatement le compte avec un second motif explicite.
5. Vérifier la transition `suspended → active`, puis une connexion client normale.

### 6. Barrières réservation, proposition et paiement

Sans activer de flag et sans forger de requête de production :

1. Ouvrir directement `/dashboard/new` et vérifier l'écran
   `Bookings are opening soon`.
2. Vérifier sur le profil professionnel que la réservation est désactivée.
3. Vérifier qu'aucune proposition ne peut être initiée depuis le tableau de bord pro.
4. Conserver comme preuve serveur le succès de `npm run test:sql`, qui exerce les
   triggers de blocage sur une base locale jetable, et de `npm run check:public-launch`,
   qui protège aussi les fonctions de checkout.

## Compte rendu de recette

Copier ce tableau dans l'issue ou la PR de lancement :

| Contrôle                                | Résultat | Preuve non sensible  |
| --------------------------------------- | -------- | -------------------- |
| Commit et déploiement identifiés        | À faire  | SHA + URL            |
| `npm run check`                         | À faire  | URL du run CI        |
| `Authenticated E2E`                     | À faire  | URL du run CI        |
| Inscription et e-mail client            | À faire  | heure + alias masqué |
| Acceptations client versionnées         | À faire  | versions uniquement  |
| Inscription et profil pro               | À faire  | identifiant profil   |
| Google Places et découverte             | À faire  | origine + capture    |
| Messagerie bidirectionnelle             | À faire  | heure, sans contenu  |
| Contact réellement livré                | À faire  | référence formulaire |
| Suspension puis réactivation            | À faire  | identifiants d'audit |
| Réservation/proposition/paiement fermés | À faire  | run SQL + capture UI |

Le lancement « comptes uniquement » est validé seulement lorsque chaque ligne est
verte, que le compte suspendu est redevenu actif et que `bookings` est toujours
désactivé. Tout échec crée un correctif séparé et impose de rejouer la ligne
concernée ainsi que la porte automatique.
