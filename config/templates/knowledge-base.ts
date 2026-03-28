/**
 * PhrasePress — Template: Knowledge Base
 *
 * Piattaforma di supporto per un prodotto SaaS.
 * Tre tipi di contenuto con workflow di revisione editoriale.
 */

import { defineConfig } from '../../packages/core/src/config.js'

const REVIEW_STAGES = [
  { name: 'draft',      label: 'Bozza',       initial: true },
  { name: 'in_review',  label: 'In revisione' },
  { name: 'published',  label: 'Pubblicato' },
  { name: 'deprecated', label: 'Deprecato',   final: true },
  { name: 'trash',      label: 'Cestino',     final: true },
]

export default defineConfig({
  codices: [

    // ── Articolo Knowledge Base ──────────────────────────────────────────────
    {
      name: 'article', label: 'Articoli KB', icon: 'pi-book',
      stages: REVIEW_STAGES,
      blueprint: [
        { name: 'title',       type: 'string',   label: 'Titolo',             queryable: true,  required: true },
        { name: 'slug',        type: 'slug',     label: 'Slug',               slugSource: 'title' },
        { name: 'summary',     type: 'textarea', label: 'Sommario breve',     queryable: true,  required: true },
        { name: 'body',        type: 'richtext', label: 'Contenuto' },
        { name: 'helpful_yes', type: 'number',   label: 'Voti utili',         queryable: true },
        { name: 'helpful_no',  type: 'number',   label: 'Voti non utili',     queryable: true },
        { name: 'version',     type: 'string',   label: 'Versione prodotto',  queryable: true },
      ],
      displayField: 'title',
      listColumns: ['title', 'stage', 'updatedAt'],
    },

    // ── Guida step-by-step ───────────────────────────────────────────────────
    {
      name: 'guide', label: 'Guide', icon: 'pi-map',
      stages: REVIEW_STAGES,
      blueprint: [
        { name: 'title',         type: 'string',   label: 'Titolo',              queryable: true, required: true },
        { name: 'slug',          type: 'slug',     label: 'Slug',                slugSource: 'title' },
        { name: 'intro',         type: 'textarea', label: 'Introduzione',        queryable: true },
        { name: 'body',          type: 'richtext', label: 'Contenuto' },
        { name: 'prerequisites', type: 'textarea', label: 'Prerequisiti' },
        { name: 'reading_time',  type: 'number',   label: 'Tempo lettura (min)', queryable: true },
        { name: 'difficulty',    type: 'select',   label: 'Difficoltà',          queryable: true,
          options: ['beginner', 'intermediate', 'advanced'] },
      ],
      displayField: 'title',
      listColumns: ['title', 'stage', 'updatedAt'],
    },

    // ── Release Note ─────────────────────────────────────────────────────────
    {
      name: 'release_note', label: 'Release Notes', icon: 'pi-tag',
      stages: [
        { name: 'draft',     label: 'Bozza',      initial: true },
        { name: 'published', label: 'Pubblicato' },
        { name: 'trash',     label: 'Cestino',    final: true },
      ],
      blueprint: [
        { name: 'version',      type: 'string',   label: 'Versione',           queryable: true, required: true },
        { name: 'slug',         type: 'slug',     label: 'Slug',               slugSource: 'version' },
        { name: 'highlights',   type: 'textarea', label: 'Highlights',         queryable: true },
        { name: 'changes',      type: 'richtext', label: 'Dettaglio modifiche' },
        { name: 'breaking',     type: 'boolean',  label: 'Breaking changes',   queryable: true },
        { name: 'release_date', type: 'date',     label: 'Data di rilascio',   queryable: true },
      ],
      displayField: 'version',
      listColumns: ['version', 'release_date', 'breaking', 'stage'],
    },

  ],

  vocabularies: [
    {
      slug: 'topic',
      name: 'Topic',
      codices: ['article', 'guide'],
      hierarchical: true,
      icon: 'pi-sitemap',
    },
    {
      slug: 'product-area',
      name: 'Area prodotto',
      codices: ['article', 'guide', 'release_note'],
      hierarchical: false,
      icon: 'pi-th-large',
    },
  ],

  plugins: [
    // Seleziona i plugin durante il wizard (o aggiungili manualmente):
    // (await import('../../packages/plugins/media/src/index.js')).default,
    // (await import('../../packages/plugins/fields/src/index.js')).default,
    // (await import('../../packages/plugins/i18n/src/index.js')).default,
  ],
})
