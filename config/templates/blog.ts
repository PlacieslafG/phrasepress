/**
 * PhrasePress — Template: Blog
 *
 * Blog classico con post, pagine statiche, categorie e tag.
 */

import { defineConfig } from '../../packages/core/src/config.js'

const DEFAULT_STAGES = [
  { name: 'draft',     label: 'Bozza',      initial: true },
  { name: 'published', label: 'Pubblicato' },
  { name: 'trash',     label: 'Cestino',    final: true  },
]

export default defineConfig({
  codices: [

    // ── Post ────────────────────────────────────────────────────────────────
    {
      name: 'post', label: 'Post', icon: 'pi-file-edit',
      stages: DEFAULT_STAGES,
      blueprint: [
        { name: 'title',          type: 'string',   label: 'Titolo',            queryable: true,  required: true },
        { name: 'slug',           type: 'slug',     label: 'Slug',              slugSource: 'title' },
        { name: 'excerpt',        type: 'textarea', label: 'Estratto',          queryable: true },
        { name: 'content',        type: 'richtext', label: 'Contenuto' },
        { name: 'featured_image', type: 'image',    label: 'Immagine in evidenza' },
      ],
      displayField: 'title',
      listColumns: ['title', 'stage', 'updatedAt'],
    },

    // ── Page ────────────────────────────────────────────────────────────────
    {
      name: 'page', label: 'Pagine', icon: 'pi-file-o',
      stages: DEFAULT_STAGES,
      blueprint: [
        { name: 'title',   type: 'string',   label: 'Titolo',    queryable: true, required: true },
        { name: 'slug',    type: 'slug',     label: 'Slug',      slugSource: 'title' },
        { name: 'content', type: 'richtext', label: 'Contenuto' },
      ],
      displayField: 'title',
      listColumns: ['title', 'stage', 'updatedAt'],
    },

  ],

  vocabularies: [
    { slug: 'category', name: 'Categorie', codices: ['post'], hierarchical: true,  icon: 'pi-sitemap' },
    { slug: 'tag',      name: 'Tag',       codices: ['post'], hierarchical: false, icon: 'pi-tags' },
  ],

  plugins: [
    // Seleziona i plugin durante il wizard (o aggiungili manualmente):
    // (await import('../../packages/plugins/media/src/index.js')).default,
    // (await import('../../packages/plugins/fields/src/index.js')).default,
    // (await import('../../packages/plugins/i18n/src/index.js')).default,
  ],
})
