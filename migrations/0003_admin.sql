-- Comptes administrateurs (voir functions/api/admin/[action].js). Un compte devient admin à la main :
--   npx wrangler d1 execute boites-a-classer --remote --command "UPDATE comptes SET admin = 1 WHERE identifiant = '…'"
ALTER TABLE comptes ADD COLUMN admin INTEGER NOT NULL DEFAULT 0;
