/**
 * PhrasePress — Template: E-commerce / Catalogo
 *
 * Catalogo prodotti con SKU, prezzi, disponibilità e recensioni clienti.
 */

import { defineConfig } from '../../packages/core/src/config.js'

const PRODUCT_STAGES = [
  { name: 'draft',        label: 'Bozza',           initial: true },
  { name: 'active',       label: 'Attivo' },
  { name: 'out_of_stock', label: 'Esaurito' },
  { name: 'archived',     label: 'Archiviato',      final: true },
]

const REVIEW_STAGES = [
  { name: 'pending',   label: 'In attesa',   initial: true },
  { name: 'approved',  label: 'Approvata' },
  { name: 'rejected',  label: 'Rifiutata',   final: true },
]

export default defineConfig({
  codices: [

    // ── Prodotto ──────────────────────────────────────────────────────────────
    {
      name: 'product', label: 'Prodotti', icon: 'pi-box',
      stages: PRODUCT_STAGES,
      blueprint: [
        { name: 'title',          type: 'string',   label: 'Nome prodotto',     queryable: true, required: true },
        { name: 'slug',           type: 'slug',     label: 'Slug',              slugSource: 'title' },
        { name: 'sku',            type: 'string',   label: 'SKU',               queryable: true },
        { name: 'short_desc',     type: 'textarea', label: 'Descrizione breve', queryable: true },
        { name: 'description',    type: 'richtext', label: 'Descrizione completa' },
        { name: 'price',          type: 'number',   label: 'Prezzo (€)',        queryable: true, required: true },
        { name: 'compare_price',  type: 'number',   label: 'Prezzo barrato (€)', queryable: true },
        { name: 'stock_qty',      type: 'number',   label: 'Quantità in stock', queryable: true },
        { name: 'weight',         type: 'number',   label: 'Peso (kg)',         queryable: true },
        { name: 'featured_image', type: 'image',    label: 'Immagine principale' },
        { name: 'gallery',        type: 'repeater', label: 'Galleria',
          fieldOptions: { fields: [{ name: 'image', type: 'image', label: 'Immagine' }] } },
      ],
      displayField: 'title',
      listColumns: ['title', 'sku', 'price', 'stage'],
    },

    // ── Recensione ────────────────────────────────────────────────────────────
    {
      name: 'review', label: 'Recensioni', icon: 'pi-star',
      stages: REVIEW_STAGES,
      blueprint: [
        { name: 'author',     type: 'string',  label: 'Nome autore',     queryable: true, required: true },
        { name: 'rating',     type: 'number',  label: 'Valutazione (1-5)', queryable: true, required: true },
        { name: 'title',      type: 'string',  label: 'Titolo recensione', queryable: true },
        { name: 'body',       type: 'textarea', label: 'Testo',           queryable: true },
        { name: 'verified',   type: 'boolean', label: 'Acquisto verificato', queryable: true },
        { name: 'product_id', type: 'string',  label: 'ID Prodotto',     queryable: true },
      ],
      displayField: 'author',
      listColumns: ['author', 'rating', 'verified', 'stage'],
    },

  ],

  vocabularies: [
    {
      slug: 'category',
      name: 'Categorie',
      codices: ['product'],
      hierarchical: true,
      icon: 'pi-sitemap',
    },
    {
      slug: 'brand',
      name: 'Brand',
      codices: ['product'],
      hierarchical: false,
      icon: 'pi-tag',
    },
    {
      slug: 'tag',
      name: 'Tag',
      codices: ['product'],
      hierarchical: false,
      icon: 'pi-tags',
    },
  ],

  plugins: [
    // Seleziona i plugin durante il wizard (o aggiungili manualmente):
    // (await import('../../packages/plugins/media/src/index.js')).default,
    // (await import('../../packages/plugins/fields/src/index.js')).default,
    // (await import('../../packages/plugins/forms/src/index.js')).default,
  ],
})
