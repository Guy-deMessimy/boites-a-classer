-- Boss des fantômes (3.27.0) : il apparaît pendant un événement quand tous les comptes ensemble ont attrapé
-- 30 fantômes ; chaque coup lui retire 1 000 PV. Celui qui a porté le plus de coups gagne des badges.
-- Voir serveur/evenement.js et functions/api/evenement/[action].js. Effacé quand un nouvel événement commence.
ALTER TABLE comptes ADD COLUMN badges TEXT; -- liste JSON : « verifie » (vérifié par le site), « halloween »…
CREATE TABLE IF NOT EXISTS boss_evenement (
  evenement TEXT PRIMARY KEY, -- « depuis » de l'événement
  pv INTEGER NOT NULL,
  max INTEGER NOT NULL,
  apparu TEXT NOT NULL,
  vaincu TEXT,                -- date de sa défaite
  gagnant TEXT                -- comptes.id : le plus de coups portés (ex aequo : celui qui y est arrivé le premier)
);
CREATE TABLE IF NOT EXISTS coups_boss (
  evenement TEXT NOT NULL,
  compte TEXT NOT NULL,       -- comptes.id
  coups INTEGER NOT NULL DEFAULT 0,
  dernier INTEGER NOT NULL,   -- dernier coup compté (ms) : rythme maximal, départage
  PRIMARY KEY (evenement, compte)
);
