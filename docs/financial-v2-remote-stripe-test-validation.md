# Validation distante du moteur financier v2 — Stripe Test

Date d'exécution : 3 septembre 2026.

Cette validation a été exécutée sur le projet Supabase distant et le compte
Stripe exclusivement en mode Test. Les feature flags v2 n'ont été activés que
pendant le pilote et ont été restaurés à leur état initial après les contrôles.
Aucun objet, secret ou paramètre Stripe Live n'a été lu ou modifié.

## Parcours validés à distance

| Scénario | Résultat |
| --- | --- |
| Onboarding Connect Express | Compte Test Express créé via Accounts v2, onboarding hébergé terminé et capacités `transfers`/`payouts` actives. Une exigence documentaire future non bloquante reste visible côté Stripe Test. |
| Checkout v2 concurrent | Deux appels simultanés ont réutilisé une seule Checkout Session payable et une seule réservation de liquidité. La configuration dynamique Test expose cartes, wallets et Bancontact, avec SEPA Direct Debit désactivé. |
| Paiement et webhook signé | Paiement Test de 99,00 EUR confirmé uniquement par le webhook signé. Trois livraisons du même événement ont produit une seule ligne d'événement et un seul paiement local. |
| Attribution | La proposition choisie est `accepted`, la proposition concurrente `not_selected` et la demande `awarded`. L'instantané contractuel conserve 80,00 EUR de prestation, 10,00 EUR de déplacement, 90,00 EUR bruts prestataire et 9,00 EUR de frais Glossed. |
| Fin et confirmation | La déclaration anticipée a été refusée. Après l'échéance, deux déclarations prestataire et deux confirmations client concurrentes avec une opération stable ont été traitées de façon idempotente. |
| Libération et transfert | La confirmation client a libéré 90,00 EUR et créé un seul transfert Stripe Test avec la charge d'origine comme `source_transaction`. |
| Checkout expiré | Session Test expirée et impayée, aucune ligne de paiement, verrou de liquidité libéré, sélection `failed_unpaid`, demande rouverte et proposition `reconfirmation_required`. |
| Remboursement intégral | Annulation prestataire, allocation prestataire/frais Glossed à zéro et remboursement Test unique de 99,00 EUR malgré deux demandes concurrentes. Le dossier est résolu après le webhook. |
| Allocation partielle | 45,00 EUR bruts prestataire, 4,50 EUR de frais Glossed et 49,50 EUR remboursés au client. Un seul remboursement et un seul transfert lié à la charge source. |
| Chargeback | Dispute Test créée après transfert, récupération provisoire unique de 90,00 EUR, zéro déficit, décision Stripe gagnée puis retransfert unique de 90,00 EUR. Les événements `created`, `updated` et `closed` sont signés et appliqués une seule fois. |
| Payout standard | Payout Connect Test de 45,00 EUR créé lorsque le solde est devenu `available`, puis confirmé `paid` par les webhooks signés. Un second passage du worker n'a rien recréé. |
| Radar Test | Le paiement principal est autorisé en mode Test et son niveau de risque Stripe est enregistré pour les projections administratives. |

## Cohérence comptable et administrative

- Dossier principal à retrouver dans l'admin : demande
  `4e0bacbe-2048-48f7-bddd-bb92d46609b0`, proposition
  `ef516a40-b286-4436-b216-386d14f5f1f1` et paiement
  `32d6610c-97a1-4154-abbb-b5a17fce9794`.
- Chaque lot du grand livre contrôlé présente un total net de zéro centime.
- Les identifiants Checkout, PaymentIntent, Charge, remboursement, transfert,
  inversion, retransfert, dispute et payout sont conservés pour rapprochement.
- Les données sont présentes dans les sources des vues administratives Missions,
  Finance, Risque, Incidents et Audit.
- Les RPC administratives financières refusent une session sans MFA récent ; la
  vérification visuelle de ces projections nécessite donc une session admin AAL2
  et n'a pas été contournée par le pilote.
- Un incident Test créé volontairement lors du diagnostic du solde insuffisant
  reste en revue manuelle afin de conserver la trace exacte de l'échec observé.

## Anomalies découvertes et corrigées

1. La création Accounts v2 utilisait le mauvais champ pour la clé d'idempotence
   réservée et omettait le pays d'identité requis. Elle utilise maintenant la clé
   stable renvoyée par la réservation atomique et la dernière déclaration
   d'éligibilité du prestataire.
2. Les workers internes comparaient le bearer token à une valeur d'environnement
   qui peut différer de la clé JWT réellement injectée. Ils exigent maintenant un
   JWT vérifié portant le claim `service_role`; un JWT utilisateur est refusé.
3. Stripe classe `balance_insufficient` comme erreur de requête invalide alors
   que l'opération doit être retentée. Les transferts et payouts conservent
   désormais cet échec en état retryable.
4. Un événement `refund.updated` sans `failure_reason` omettait le paramètre RPC
   et produisait HTTP 500. La valeur absente est maintenant transmise comme
   `null`.
5. Un remboursement réussi pouvait laisser l'annulation ouverte tant qu'aucun
   appel séparé ne finalisait la résolution. Le webhook reprend désormais
   idempotemment la finalisation, y compris après une livraison déjà enregistrée,
   et déclenche l'éventuel transfert d'allocation.
6. Un payout déjà `paid` cessait d'être déduit du solde interne disponible, ce
   qui permettait de le repayer lors d'un futur créneau. La vue de solde conserve
   maintenant tous les payouts non échoués/non annulés dans le montant engagé.

## Branches restant couvertes par des tests reproductibles

- libération automatique après 48 heures sans confirmation client ;
- problème/no-show signalé avant libération et blocage atomique ;
- échec définitif de paiement distinct de l'expiration ;
- chargeback perdu et déficit de récupération, qui ne peuvent pas être combinés
  proprement avec le scénario Stripe Test gagnant exécuté ;
- Instant Payout et ses cas d'inéligibilité ;
- concurrence SQL exhaustive des workers, validée par la suite SQL en CI.

## Limites avant une activation contrôlée

- confirmer visuellement les projections de la mission pilote dans
  `admin.glossed.app` avec une session administrateur MFA récente ;
- traiter ou clôturer explicitement l'incident Test de solde insuffisant avant de
  considérer la file d'incidents pilote comme vide ;
- valider juridiquement et opérationnellement les prérequis déjà identifiés avant
  toute activation Production ;
- conserver tous les feature flags financiers v2 désactivés en Production jusqu'à
  une décision et un déploiement séparés.
