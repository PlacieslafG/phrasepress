/**
 * PhrasePress — Template: Testata Editoriale
 *
 * Giornale online o rivista digitale.
 * Articoli di notizie, editoriali e workflow di pubblicazione professionale.
 */

import { defineConfig } from '../../packages/core/src/config.js'

const NEWS_STAGES = [
  { name: 'draft',            label: 'Bozza',             initial: true },
  { name: 'ready_to_publish', label: 'Pronto alla pubbl.' },
  { name: 'published',        label: 'Pubblicato' },
  { name: 'archived',         label: 'Archiviato',        final: true },
]

export default defineConfig({
  codices: [

    // ── Articolo ──────────────────────────────────────────────────────────────
    {
      name: 'article', label: 'Articoli', icon: 'pi-file-edit',
      stages: NEWS_STAGES,
      blueprint: [
        { name: 'headline',       type: 'string',   label: 'Titolo',          queryable: true, required: true },
        { name: 'slug',           type: 'slug',     label: 'Slug',            slugSource: 'headline' },
        { name: 'standfirst',     type: 'textarea', label: 'Occhiello',       queryable: true },
        { name: 'body',           type: 'richtext', label: 'Testo' },
        { name: 'author',         type: 'string',   label: 'Autore',          queryable: true },
        { name: 'breaking',       type: 'boolean',  label: 'Breaking news',   queryable: true },
        { name: 'exclusive',      type: 'boolean',  label: 'Esclusiva',       queryable: true },
        { name: 'publish_date',   type: 'date',     label: 'Data pubblicazione', queryable: true },
        { name: 'featured_image', type: 'image',    label: 'Immagine' },
      ],
      displayField: 'headline',
      listColumns: ['headline', 'author', 'breaking', 'stage'],
    },

    // ── Editoriale ────────────────────────────────────────────────────────────
    {
      name: 'editorial', label: 'Editoriali', icon: 'pi-pencil',
      stages: NEWS_STAGES,
      blueprint: [
        { name: 'title',    type: 'string',   label: 'Titolo',    queryable: true, required: true },
        { name: 'slug',     type: 'slug',     label: 'Slug',      slugSource: 'title' },
        { name: 'author',   type: 'string',   label: 'Firma',     queryable: true, required: true },
        { name: 'position', type: 'select',   label: 'Tipo',      queryable: true,
          options: ['opinion', 'editorial', 'analysis', 'column'] },
        { name: 'body',     type: 'richtext', label: 'Testo' },
        { name: 'publish_date', type: 'date', label: 'Data pubblicazione', queryable: true },
      ],
      displayField: 'title',
      listColumns: ['title', 'author', 'position', 'stage'],
    },

  ],

  vocabularies: [
    {
      slug: 'rubric',
      name: 'Rubriche',
      codices: ['article', 'editorial'],
      hierarchical: true,
      icon: 'pi-sitemap',
    },
    {
      slug: 'topic',
      name: 'Argomenti',
      codices: ['article', 'editorial'],
      hierarchical: false,
      icon: 'pi-tags',
    },
    {
      slug: 'region',
      name: 'Regioni',
      codices: ['article'],
      hierarchical: false,
      icon: 'pi-map-marker',
    },
  ],

  plugins: [
    // Seleziona i plugin durante il wizard (o aggiungili manualmente):
    // (await import('../../packages/plugins/media/src/index.js')).default,
    // (await import('../../packages/plugins/fields/src/index.js')).default,
    // (await import('../../packages/plugins/i18n/src/index.js')).default,
  ],
})
