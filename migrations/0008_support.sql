-- Service client (2.10.0). Voir functions/api/support/[action].js (côté visiteur) et functions/api/admin/[action].js.
-- Une conversation par compte, ou par navigateur pour un visiteur sans compte (jeton tiré au hasard, gardé dans le
-- navigateur ; le serveur n'en garde que l'empreinte SHA-256). L'admin répond depuis la page site/admin/.
CREATE TABLE IF NOT EXISTS support_fils (
  id TEXT PRIMARY KEY,
  compte TEXT,              -- comptes.id (visiteur connecté)
  cle TEXT,                 -- empreinte du jeton du navigateur (visiteur sans compte)
  cree TEXT NOT NULL,
  maj TEXT NOT NULL,        -- date du dernier message
  resolu INTEGER NOT NULL DEFAULT 0,
  non_lus_admin INTEGER NOT NULL DEFAULT 0,
  non_lus_client INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS support_fils_compte ON support_fils (compte);
CREATE UNIQUE INDEX IF NOT EXISTS support_fils_cle ON support_fils (cle);
CREATE INDEX IF NOT EXISTS support_fils_maj ON support_fils (maj);

CREATE TABLE IF NOT EXISTS support_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fil TEXT NOT NULL,
  auteur TEXT NOT NULL,     -- 'client' ou 'admin'
  texte TEXT NOT NULL,
  date TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS support_messages_fil ON support_messages (fil, id);
