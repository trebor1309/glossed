# Exploitation et demandes de droits RGPD

Ce document décrit le socle opérationnel livré avec la PR #55. Il ne remplace
pas la validation d'un juriste ni le registre des traitements de l'exploitant.

## Canal et responsabilité

- L'exploitant actuel est EWCS, tel qu'indiqué dans les mentions légales.
- Les utilisateurs authentifiés déposent une demande depuis **Settings → Your
  data and privacy rights**.
- Une demande publique peut toujours être envoyée depuis `/contact` avec le
  sujet `privacy`, notamment lorsqu'une personne ne peut plus se connecter.
- Tous les formulaires publics apparaissent dans `admin.glossed.app/support`
  avec leur état de livraison Resend. L'administrateur répond par email, puis
  clôture le dossier avec une note de résolution auditée.
- Avant la bêta, `support@glossed.app` doit être créé comme boîte ou alias suivi
  quotidiennement. Tant qu'il n'existe pas, `contact@ewcs.be` reste le point de
  réception opérationnel documenté.
- Les demandes authentifiées apparaissent dans
  `admin.glossed.app/confidentialite`. Les rôles Support et Super administrateur
  disposent de la file ; toute modification d'état exige une MFA récente.

## Délais et états

Le délai cible initial est calculé à un mois calendrier après la réception. La
file ordonne les dossiers par échéance et signale les retards.

1. `received` : demande enregistrée depuis une session authentifiée ;
2. `identity_check` : une vérification complémentaire est nécessaire ;
3. `in_progress` : identité vérifiée et analyse en cours ;
4. `completed`, `refused` ou `cancelled` : état terminal avec une note
   opérationnelle obligatoire.

Une demande complexe peut justifier une prolongation conforme au RGPD, mais la
personne doit être informée dans le délai initial. La version actuelle ne calcule
pas automatiquement cette prolongation : elle doit être documentée dans la note
du dossier et suivie par Support.

## Vérification d'identité

Une session Glossed authentifiée est un premier signal, pas une preuve suffisante
pour toutes les opérations à risque. Ne jamais demander de document d'identité
dans le champ libre. Si un contrôle supplémentaire est nécessaire :

1. passer le dossier à `identity_check` ;
2. utiliser un canal approuvé et limiter les données demandées au strict
   nécessaire ;
3. ne passer à `in_progress` qu'après vérification ;
4. supprimer les copies temporaires selon la durée validée dans le registre de
   conservation.

## Effacement et fermeture de compte

Le bouton utilisateur crée une demande d'effacement ; il ne supprime rien
directement. La clé `public.users.id → auth.users.id` est volontairement en
`ON DELETE RESTRICT` : supprimer d'abord l'identité Auth laisserait un profil
orphelin et rendrait les contrôles incohérents.

Avant toute exécution manuelle :

1. vérifier l'identité et les éventuelles obligations de conservation ;
2. suspendre l'accès si la fermeture doit être immédiate ;
3. inventorier missions, paiements, factures, litiges, messages, fichiers,
   acceptations juridiques et journaux d'audit liés ;
4. appliquer la matrice de conservation validée : effacer, anonymiser ou isoler
   chaque catégorie ;
5. retirer le profil public et les fichiers non conservés ;
6. supprimer `public.users` uniquement lorsque ses dépendances le permettent,
   puis supprimer l'identité Supabase Auth ;
7. consigner le résultat et la justification dans le dossier, puis informer la
   personne.

Il est interdit de contourner les contraintes avec un `CASCADE` global. Les
preuves contractuelles, financières, de sécurité et d'audit doivent être
traitées catégorie par catégorie.

## Matrice de conservation à faire valider avant la bêta publique

La durée exacte n'est volontairement pas codée tant que la base légale et les
obligations belges n'ont pas été validées. Le registre doit au minimum couvrir :

| Catégorie                | Finalité / base          | Début du délai  | Durée validée | Sort final               | Responsable  |
| ------------------------ | ------------------------ | --------------- | ------------- | ------------------------ | ------------ |
| Profil et coordonnées    | fonctionnement du compte | fermeture       | À valider     | effacement/anonymisation | Support      |
| Acceptations juridiques  | preuve contractuelle     | fin du contrat  | À valider     | conservation limitée     | Exploitant   |
| Réservations et échanges | exécution / litige       | fin de mission  | À valider     | tri et anonymisation     | Support      |
| Paiements et factures    | comptabilité / fiscalité | opération       | À valider     | conservation légale      | Exploitant   |
| Vérification pro         | conformité prestataire   | fin de relation | À valider     | effacement contrôlé      | Vérification |
| Sécurité et audit        | sécurité / preuve        | événement       | À valider     | rotation / anonymisation | Exploitant   |
| Support et demandes RGPD | suivi et preuve          | clôture         | À valider     | conservation limitée     | Support      |

## Routine d'exploitation

### Quotidien

- contrôler la file RGPD et les échéances ;
- contrôler la boîte support et les échecs d'envoi Resend ;
- contrôler les incidents, comptes suspendus et vérifications pro en attente ;
- ne jamais copier de données personnelles dans un ticket GitHub ou un log de
  déploiement.

### Hebdomadaire

- examiner les demandes proches de l'échéance ;
- contrôler les journaux d'erreur Vercel, Supabase et Resend sans exporter plus
  de données que nécessaire ;
- vérifier que les sauvegardes prévues par le plan Supabase sont disponibles ;
- tester sur un environnement non-production le parcours de restauration prévu.

### Avant chaque déploiement

1. exécuter `npm run check` et `npm run test:sql` ;
2. vérifier les migrations et sauvegarder l'état nécessaire au retour arrière ;
3. contrôler les variables Production, notamment `VITE_PUBLIC_APP_URL`, Resend,
   les origines autorisées et les redirections Supabase Auth ;
4. effectuer les smoke tests authentifiés en lecture seule ;
5. documenter l'heure, le commit, l'opérateur et le résultat du déploiement.

### Messagerie transactionnelle avant bêta publique

- créer et vérifier le domaine d'envoi Glossed dans Resend ;
- créer `support@glossed.app` (boîte ou alias suivi) et une adresse d'envoi
  transactionnelle telle que `notifications@glossed.app` ;
- configurer le SMTP personnalisé Supabase Auth avec ce domaine ;
- personnaliser au nom de Glossed les modèles de confirmation, récupération de
  mot de passe et changement d'adresse ;
- envoyer un message réel vers plusieurs fournisseurs de messagerie et vérifier
  expéditeur, Reply-To, SPF, DKIM, DMARC, liens et classement antispam ;
- conserver les identifiants SMTP/Resend uniquement dans les secrets de la
  plateforme, jamais dans Vite ni dans le dépôt.

## Incident impliquant des données personnelles

1. contenir l'incident sans détruire les preuves ;
2. noter heure de détection, systèmes, catégories de données et personnes
   potentiellement concernées ;
3. révoquer ou faire tourner les secrets compromis et préserver un journal des
   actions ;
4. qualifier le risque avec le responsable du traitement et le conseil juridique ;
5. appliquer les obligations de notification à l'autorité et aux personnes dans
   les délais applicables ;
6. corriger, vérifier, puis réaliser un retour d'expérience documenté.

## Références normatives

- RGPD, articles 5, 12 à 21 et 32 à 34 ;
- Commission européenne, principes de traitement et gestion des demandes des
  personnes concernées ;
- Autorité de protection des données belge pour les modalités nationales et les
  notifications de violation.
