-- Inutilisée depuis la 2.6.0 (abonnement et classes retirés) : déjà appliquée en production, on la garde pour que les
-- bases locales aient les mêmes colonnes. Le logiciel ne lit ni n'écrit plus ces colonnes.
-- Abonnements (PayPal, 3 €/mois) et classes. Voir serveur/abonnements.js et functions/api/abonnement/, functions/api/classe/.
-- Un abonné crée et publie ses propres collections, et gère les élèves qui ont rejoint sa classe avec son code.
ALTER TABLE comptes ADD COLUMN abonnement TEXT;          -- identifiant de l'abonnement PayPal (I-…)
ALTER TABLE comptes ADD COLUMN abonne_jusqua TEXT;       -- droits d'abonné valables jusqu'à cette date (ISO)
ALTER TABLE comptes ADD COLUMN abonnement_verifie TEXT;  -- dernière lecture de l'abonnement chez PayPal
ALTER TABLE comptes ADD COLUMN code_classe TEXT;         -- code à donner aux élèves (abonnés)
ALTER TABLE comptes ADD COLUMN enseignant TEXT;          -- id du compte abonné dont l'élève a rejoint la classe
CREATE UNIQUE INDEX IF NOT EXISTS comptes_abonnement ON comptes (abonnement);
CREATE UNIQUE INDEX IF NOT EXISTS comptes_code_classe ON comptes (code_classe);
CREATE INDEX IF NOT EXISTS comptes_enseignant ON comptes (enseignant);

-- Auteur d'une collection du site (id de compte) : un abonné ne modifie que les siennes ; un admin, toutes.
ALTER TABLE collections ADD COLUMN auteur TEXT;
