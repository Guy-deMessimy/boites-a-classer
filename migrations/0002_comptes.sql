-- Comptes (identifiant + mot de passe) pour la sauvegarde en ligne. Voir serveur/comptes.js.
-- Le mot de passe n'arrive jamais au serveur : le logiciel envoie un secret qu'il en dérive (PBKDF2, 600 000 tours),
-- et le serveur ne garde que l'empreinte SHA-256 de ce secret mêlé à un sel tiré au hasard.
-- Le travail d'un compte est rangé dans la table sauvegardes sous la clé « compte:<id> ».
CREATE TABLE IF NOT EXISTS comptes (
  id TEXT PRIMARY KEY,
  identifiant TEXT NOT NULL UNIQUE,
  sel BLOB NOT NULL,
  empreinte BLOB NOT NULL,
  cree TEXT NOT NULL,
  derniere TEXT NOT NULL -- dernière connexion ou dernière utilisation d'une session
);
CREATE INDEX IF NOT EXISTS comptes_derniere ON comptes (derniere);

-- Sessions ouvertes : empreinte SHA-256 du jeton remis au logiciel (le jeton lui-même n'est pas stocké).
CREATE TABLE IF NOT EXISTS sessions (
  jeton TEXT PRIMARY KEY,
  compte TEXT NOT NULL,
  derniere TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_compte ON sessions (compte);
CREATE INDEX IF NOT EXISTS sessions_derniere ON sessions (derniere);

-- Compteurs anti-abus (mots de passe essayés, comptes créés) : clé = empreinte, effacés à expiration.
CREATE TABLE IF NOT EXISTS limites (
  cle TEXT PRIMARY KEY,
  nombre INTEGER NOT NULL,
  fin TEXT NOT NULL
);
