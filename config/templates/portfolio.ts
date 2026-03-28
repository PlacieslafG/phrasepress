/**
 * PhrasePress — Template: Portfolio / Agenzia
 *
 * Studi creativi, agenzie digitali e freelance.
 * Progetti, servizi offerti e testimonial dei clienti.
 */

import { defineConfig } from '../../packages/core/src/config.js'

const DEFAULT_STAGES = [
  { name: 'draft',     label: 'Bozza',     initial: true },
  { name: 'published', label: 'Pubblicato' },
  { name: 'archived',  label: 'Archiviato', final: true },
]

export default defineConfig({
  codices: [

    // ── Progetto ──────────────────────────────────────────────────────────────
    {
      name: 'project', label: 'Progetti', icon: 'pi-briefcase',
      stages: DEFAULT_STAGES,
      blueprint: [
        { name: 'title',         type: 'string',   label: 'Titolo',            queryable: true, required: true },
        { name: 'slug',          type: 'slug',     label: 'Slug',              slugSource: 'title' },
        { name: 'client',        type: 'string',   label: 'Cliente',           queryable: true },
        { name: 'year',          type: 'number',   label: 'Anno',              queryable: true },
        { name: 'description',   type: 'textarea', label: 'Descrizione breve', queryable: true },
        { name: 'body',          type: 'richtext', label: 'Caso studio' },
        { name: 'live_url',      type: 'string',   label: 'URL live' },
        { name: 'featured_image', type: 'image',   label: 'Immagine copertina' },
        { name: 'gallery',       type: 'repeater', label: 'Galleria immagini',
          fieldOptions: { fields: [{ name: 'image', type: 'image', label: 'Immagine' }] } },
      ],
      displayField: 'title',
      listColumns: ['title', 'client', 'year', 'stage'],
    },

    // ── Servizio ──────────────────────────────────────────────────────────────
    {
      name: 'service', label: 'Servizi', icon: 'pi-star',
      stages: DEFAULT_STAGES,
      blueprint: [
        { name: 'title',       type: 'string',   label: 'Titolo',        queryable: true, required: true },
        { name: 'slug',        type: 'slug',     label: 'Slug',          slugSource: 'title' },
        { name: 'icon',        type: 'string',   label: 'Icona (PrimeIcons)' },
        { name: 'tagline',     type: 'string',   label: 'Tagline',       queryable: true },
        { name: 'description', type: 'richtext', label: 'Descrizione' },
        { name: 'price_range', type: 'string',   label: 'Fascia di prezzo' },
      ],
      displayField: 'title',
      listColumns: ['title', 'price_range', 'stage'],
    },

    // ── Testimonial ───────────────────────────────────────────────────────────
    {
      name: 'testimonial', label: 'Testimonial', icon: 'pi-comments',
      stages: DEFAULT_STAGES,
      blueprint: [
        { name: 'author',  type: 'string',  label: 'Nome',      queryable: true, required: true },
        { name: 'role',    type: 'string',  label: 'Ruolo',     queryable: true },
        { name: 'company', type: 'string',  label: 'Azienda',   queryable: true },
        { name: 'quote',   type: 'textarea', label: 'Citazione', queryable: true, required: true },
        { name: 'rating',  type: 'number',  label: 'Valutazione (1-5)', queryable: true },
        { name: 'photo',   type: 'image',   label: 'Foto' },
      ],
      displayField: 'author',
      listColumns: ['author', 'company', 'rating', 'stage'],
    },

  ],

  vocabularies: [
    {
      slug: 'technology',
      name: 'Tecnologie',
      codices: ['project'],
      hierarchical: false,
      icon: 'pi-code',
    },
    {
      slug: 'industry',
      name: 'Settore',
      codices: ['project', 'service'],
      hierarchical: false,
      icon: 'pi-building',
    },
  ],

  plugins: [
    // Seleziona i plugin durante il wizard (o aggiungili manualmente):
    // (await import('../../packages/plugins/media/src/index.js')).default,
    // (await import('../../packages/plugins/fields/src/index.js')).default,
    // (await import('../../packages/plugins/i18n/src/index.js')).default,
  ],
})
