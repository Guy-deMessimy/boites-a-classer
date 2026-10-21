-- Réglages du site, modifiés depuis la page d'administration. « maintenance » = « 1 » : site arrêté (functions/_middleware.js).
CREATE TABLE IF NOT EXISTS reglages (
  cle TEXT PRIMARY KEY,
  valeur TEXT NOT NULL
);
