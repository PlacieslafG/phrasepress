-- Rinomina le capabilities dei ruoli da nomenclatura WordPress a PhrasePress
-- edit_posts → edit_folios, delete_posts → delete_folios, ecc.
UPDATE roles SET capabilities = REPLACE(
  REPLACE(
    REPLACE(
      REPLACE(
        REPLACE(capabilities, '"edit_others_posts"', '"edit_others_folios"'),
        '"delete_others_posts"', '"delete_others_folios"'
      ),
      '"edit_posts"', '"edit_folios"'
    ),
    '"publish_posts"', '"publish_folios"'
  ),
  '"delete_posts"', '"delete_folios"'
);
