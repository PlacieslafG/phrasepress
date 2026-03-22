import { defineConfig } from '../packages/core/src/config.js'

export default defineConfig({
  postTypes: [
    // Esempio custom post type:
    // {
    //   name: 'product',
    //   label: 'Products',
    //   icon: 'pi-box',
    //   fields: [
    //     { name: 'price', type: 'number', label: 'Price', queryable: true },
    //     { name: 'sku',   type: 'string', label: 'SKU',   queryable: true },
    //   ],
    // },
  ],

  taxonomies: [
    // Esempio custom taxonomy:
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
  ],
})
