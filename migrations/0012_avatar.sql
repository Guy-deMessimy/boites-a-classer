-- Photo de profil (3.29.1) : un emoji par compte, choisi par un admin dans la page site/admin/
-- (POST /api/admin/avatar). Montré à la place de 👤 dans le logiciel, devant le nom dans la liste admin et
-- dans les classements des événements. Vide : pas de photo de profil.
ALTER TABLE comptes ADD COLUMN avatar TEXT;
