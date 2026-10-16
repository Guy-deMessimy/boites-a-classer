-- Sauvegardes en ligne : une ligne par version, rangée sous l'empreinte SHA-256 du code de sauvegarde
-- (le code lui-même n'est jamais stocké). donnees = JSON compressé (gzip) envoyé par le logiciel, non lu par le serveur.
CREATE TABLE IF NOT EXISTS sauvegardes (
  cle TEXT NOT NULL,
  version INTEGER NOT NULL,
  date TEXT NOT NULL,
  donnees BLOB NOT NULL,
  PRIMARY KEY (cle, version)
);
CREATE INDEX IF NOT EXISTS sauvegardes_date ON sauvegardes (date);
