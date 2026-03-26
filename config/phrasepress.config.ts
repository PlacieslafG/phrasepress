import { defineConfig } from '../packages/core/src/config.js'

export default defineConfig({
  postTypes: [
    // Uncomment to add a custom post type:
    // {
    //   name: 'product',
    //   label: 'Products',
    //   icon: 'pi-box',
    //   fields: [
    //     { name: 'price', type: 'number', label: 'Price', queryable: true },
    //   ],
    // },
  ],

  taxonomies: [
    // Uncomment to add a custom taxonomy:
    // {
    //   slug: 'genre',
    //   name: 'Genres',
    //   postTypes: ['product'],
    //   hierarchical: true,
    // },
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
