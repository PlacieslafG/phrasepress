import { defineConfig } from '../packages/core/src/config.js'

const DEFAULT_STAGES = [
  { name: 'draft',     label: 'Bozza',      initial: true },
  { name: 'published', label: 'Pubblicato' },
  { name: 'trash',     label: 'Cestino',    final: true  },
]

export default defineConfig({
  codices: [
    {
      name: 'post', label: 'Posts', icon: 'pi-file-edit',
      stages: DEFAULT_STAGES,
      blueprint: [
        { name: 'title',   type: 'string',   label: 'Titolo',    queryable: true, required: true },
        { name: 'slug',    type: 'slug',     label: 'Slug',      slugSource: 'title' },
        { name: 'content', type: 'richtext', label: 'Contenuto' },
      ],
      displayField: 'title',
    },
    {
      name: 'page', label: 'Pages', icon: 'pi-file-o',
      stages: DEFAULT_STAGES,
      blueprint: [
        { name: 'title',   type: 'string',   label: 'Titolo',    queryable: true, required: true },
        { name: 'slug',    type: 'slug',     label: 'Slug',      slugSource: 'title' },
        { name: 'content', type: 'richtext', label: 'Contenuto' },
      ],
      displayField: 'title',
    },
    // Aggiungi altri codici qui:
    // {
    //   name: 'product', label: 'Products', icon: 'pi-box',
    //   stages: DEFAULT_STAGES,
    //   blueprint: [
    //     { name: 'title', type: 'string', label: 'Titolo', queryable: true, required: true },
    //     { name: 'slug',  type: 'slug',   label: 'Slug',   slugSource: 'title' },
    //     { name: 'price', type: 'number', label: 'Prezzo', queryable: true },
    //   ],
    //   displayField: 'title',
    // },
  ],

  vocabularies: [
    { slug: 'category', name: 'Categories', codices: ['post'], hierarchical: true  },
    { slug: 'tag',       name: 'Tags',       codices: ['post'], hierarchical: false },
    // Aggiungi altri vocabolari qui:
    // { slug: 'genre', name: 'Genres', codices: ['product'], hierarchical: true },
  ],

  plugins: [
    (await import('../packages/plugins/media/src/index.js')).default,
    (await import('../packages/plugins/fields/src/index.js')).default,
    (await import('../packages/plugins/forms/src/index.js')).default,
    (await import('../packages/plugins/mailer/src/index.js')).default,
    (await import('../packages/plugins/i18n/src/index.js')).default,
    (await import('../packages/plugins/db-monitor/src/index.js')).default,
  ],
})
