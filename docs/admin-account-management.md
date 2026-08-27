# Gestion des comptes administrateurs

Les comptes de `admin.glossed.app` sont distincts des profils client et prestataire.
Le navigateur ne crée jamais une identité Auth privilégiée et ne reçoit jamais de
clé `service_role`.

## Provisioning sûr

1. Un opérateur de confiance crée l’identité Supabase Auth hors du navigateur.
2. L’email est confirmé et `raw_app_meta_data.account_type` vaut `admin` avant la
   création, afin que le trigger d’inscription ne crée pas de profil `public.users`.
3. Un super-administrateur ouvre **Administrateurs**, recherche l’email, choisit
   les rôles et prévisualise l’activation.
4. L’activation exige un MFA récent, une justification et une confirmation.

Une identité possédant un profil client/prestataire ne peut pas être promue. Il
faut une identité Auth administrative séparée.

## Garde-fous

- lecture réservée à `administrators.read` ;
- mutations réservées à `administrators.manage` avec MFA récent ;
- prévisualisation courte et invalidée si le compte change entre-temps ;
- exécution atomique et idempotente ;
- auto-modification interdite ;
- dernier super-administrateur actif impossible à retirer ou suspendre ;
- justification, état avant/après, session et MFA inscrits dans l’audit immuable.

La suspension ou la désactivation prend effet immédiatement côté serveur : les
RPC suivantes refusent la session, même si son JWT n’est pas encore expiré.
