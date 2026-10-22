-- Exercices donnés par l'enseignant à une classe (3.9.0) : liste JSON d'identifiants de collections.
-- Les élèves de la classe les voient en tête de la liste des collections (« 📌 Donnés par ton enseignant »).
ALTER TABLE classes ADD COLUMN exercices TEXT;
