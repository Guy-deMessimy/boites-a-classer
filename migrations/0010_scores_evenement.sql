-- Classement des événements (3.26.0) : fantômes attrapés par compte pendant l'événement en cours ou le dernier arrêté
-- (serveur/evenement.js, functions/api/evenement/[action].js). Tout est effacé quand un nouvel événement commence.
CREATE TABLE IF NOT EXISTS scores_evenement (
  evenement TEXT NOT NULL,     -- « depuis » de l'événement (date de déclenchement)
  compte TEXT NOT NULL,        -- comptes.id
  points INTEGER NOT NULL DEFAULT 0,
  dernier INTEGER NOT NULL,    -- quand le dernier point a été compté (ms) : rythme maximal, et départage des ex aequo
  PRIMARY KEY (evenement, compte)
);
CREATE INDEX IF NOT EXISTS scores_evenement_points ON scores_evenement (evenement, points DESC, dernier);
