-- Niveau imposé par l'enseignant à une classe : 'facile', 'normal' ou 'expert' ; NULL = au choix de chaque élève.
-- Le logiciel des élèves de la classe le suit, avec le bouton du niveau verrouillé (functions/api/classe/[action].js).
ALTER TABLE classes ADD COLUMN niveau TEXT;
