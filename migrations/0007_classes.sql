-- Rôle enseignant, classes et comptes d'élèves (2.9.0). Voir serveur/classes.js et functions/api/classe/[action].js.
-- Le rôle enseignant est donné par un admin (page site/admin/). Un enseignant crée des classes et, dedans, les comptes
-- de ses élèves : un élève n'a pas de mot de passe, il se connecte avec un code personnel dont le serveur ne garde que
-- l'empreinte (code_eleve). Les colonnes de la migration 0006 (abonnement, retiré) ne servent pas ici.
ALTER TABLE comptes ADD COLUMN est_enseignant INTEGER NOT NULL DEFAULT 0;
ALTER TABLE comptes ADD COLUMN nom TEXT;         -- élève : prénom choisi par l'enseignant
ALTER TABLE comptes ADD COLUMN classe TEXT;      -- élève : sa classe (classes.id)
ALTER TABLE comptes ADD COLUMN code_eleve TEXT;  -- élève : empreinte SHA-256 de son code de connexion
CREATE UNIQUE INDEX IF NOT EXISTS comptes_code_eleve ON comptes (code_eleve);
CREATE INDEX IF NOT EXISTS comptes_classe ON comptes (classe);

CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  enseignant TEXT NOT NULL, -- comptes.id
  nom TEXT NOT NULL,
  cree TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS classes_enseignant ON classes (enseignant);
