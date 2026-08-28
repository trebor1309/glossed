# Pilote financier v2 — Stripe Test

Date d'exécution : 28 août 2026.

Ce pilote a été exécuté sur Supabase local avec des objets Stripe exclusivement
en mode Test. Aucun feature flag n'a été activé sur un environnement distant et
aucun objet Stripe Live n'a été lu ou modifié.

## Parcours Stripe exécuté

| Scénario | Couverture | Résultat |
| --- | --- | --- |
| Deux créations Checkout simultanées | Stripe Test + Supabase local | Une seule session payable et une seule réservation de liquidité. |
| Paiement par carte Test | Checkout hébergé Stripe | Paiement de 99,00 EUR confirmé. Aucun `transfer_data` ni transfert au paiement. |
| Webhook Checkout signé livré deux fois | Webhook Stripe Test signé | Une seule écriture de paiement, une seule attribution et un seul événement local. |
| Attribution de la mission | Supabase local | Proposition choisie `accepted`, concurrente `not_selected`, demande `awarded`. |
| Fin déclarée puis confirmation client | Edge Functions + Supabase local | Exécution `concluded`, libération immédiate et notifications créées. |
| Transfert différé | Stripe Test | Un transfert de 90,00 EUR avec `source_transaction`, une seule tentative réussie. |
| Grand livre | Supabase local | 28 800 cents au débit et au crédit ; solde agrégé nul. |
| Payout standard | Stripe Test | Le transfert reste `pending` pour un payout standard et le solde standard disponible est nul. Aucun payout n'a été créé. |

Les méthodes dynamiques ont été vérifiées sur une configuration Stripe Test
dédiée : carte, wallets et Bancontact activés, SEPA Direct Debit désactivé.

## Branches validées par les tests reproductibles

Les suites SQL locales couvrent les branches qui ne peuvent pas toutes être
forcées proprement sur une même chronologie Stripe Test :

- expiration et échec Checkout, libération du verrou et restauration de la
  sélection ;
- confirmation client immédiate et concurrence des confirmations ;
- absence de confirmation puis libération idempotente à 48 heures ;
- signalement d'un problème avant libération et blocage atomique ;
- annulation commerciale et passage en revue ;
- remboursement intégral ;
- allocation partielle avec commission recalculée au centime ;
- transfert déjà réalisé, inversion et remboursement ;
- chargeback distinct du litige Glossed, récupération provisoire, victoire,
  perte, retransfert et déficit ;
- payouts standards et instantanés, concurrence, échecs et événements signés ;
- projections admin Missions, Finance, Litiges, Risque, Incidents et Audit ;
- notifications et unicité des écritures associées.

## Anomalies découvertes et corrigées

1. Stripe refuse un `transfer_group` explicite sur un transfert utilisant
   `source_transaction` lorsque la charge source possède déjà son groupe. Le
   champ redondant a été retiré du transfert initial et du retransfert après
   récupération provisoire. `source_transaction` reste l'unique lien Stripe.
2. Le worker payout masquait certaines erreurs PostgREST sous le libellé
   « Unknown ». Il conserve désormais leur message utile, notamment lorsque le
   solde Stripe n'est pas encore disponible.
3. Le harnais pilote vérifie désormais le formulaire Checkout actuel, la double
   livraison signée, les invariants d'unicité et le grand livre équilibré.
4. Stripe peut rendre un montant éligible à un Instant Payout alors qu'il est
   encore `pending` pour un payout standard. La contrainte locale qui imposait
   `instant_available <= available` a été corrigée par une migration additive,
   avec un test de non-régression reproduisant la réponse Stripe Test réelle.

## Limites du pilote

- L'onboarding Express hébergé par Stripe présente un CAPTCHA. Pour automatiser
  les mouvements Test sans contourner ce contrôle, le pilote utilise un compte
  destinataire Test contrôlé par API avec capacités transferts/payouts actives.
  Seule la base locale jetable tolère temporairement `dashboard = none` ; les
  migrations et le code de production continuent d'exiger Express.
- Stripe Test conserve le transfert dans le solde standard `pending` selon sa
  chronologie de règlement. Il peut simultanément l'exposer comme éligible à un
  Instant Payout : ces deux vues sont maintenant stockées séparément. Aucun
  payout standard ne peut être créé tant que `available` reste nul ; ce refus est
  le comportement attendu et le lifecycle payout reste couvert par les tests
  SQL et de contrat.
- Les chargebacks, remboursements et déficits ont été simulés via les workflows
  locaux reproductibles. Ils n'ont pas tous produit un nouvel objet Stripe Test,
  afin d'éviter de confondre plusieurs branches financières sur le même paiement.

## Conditions avant activation contrôlée

- terminer un onboarding Express Test manuel et rejouer le transfert sans la
  tolérance locale de fixture ;
- attendre ou fournir un solde Connect Test disponible, puis observer un payout
  standard complet et son webhook signé ;
- exécuter un chargeback Stripe Test complet lorsque le simulateur fournit une
  chronologie stable pour paiement, transfert, inversion et décision ;
- vérifier la configuration Radar Test et les scénarios à risque avant toute
  décision d'activation ;
- garder tous les feature flags v2 désactivés en Production jusqu'à une décision
  de déploiement séparée.
