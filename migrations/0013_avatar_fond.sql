-- Couleur du rond de la photo de profil (3.36.0) : choisie par un admin avec l'emoji (POST /api/admin/avatar,
-- POST /api/admin/avatars), une des couleurs de FONDS_AVATAR (functions/api/admin/[action].js), dessinées par
-- app/profil.css ([data-fond]). Vide : couleur par défaut. Effacée quand la photo est enlevée.
ALTER TABLE comptes ADD COLUMN avatar_fond TEXT;
