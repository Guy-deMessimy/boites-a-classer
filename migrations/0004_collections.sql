-- Collections du site : créées par un admin dans le logiciel, proposées à tout le monde (functions/api/collections.js).
-- donnees = la collection en JSON ({ id, nom, attributs, etres }), revérifiée par le logiciel à la lecture.
CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  donnees TEXT NOT NULL,
  date TEXT NOT NULL
);
