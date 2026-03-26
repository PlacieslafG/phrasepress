/**
 * PhrasePress — Esempio: Knowledge Base / Documentazione tecnica
 *
 * Scenario: piattaforma di supporto per un prodotto SaaS.
 * Nessun "post" o "page" in stile WordPress.
 * Tre tipi di contenuto (article, guide, release_note) con workflow di review.
 * Vocabolari per topic, area di prodotto e livello di difficoltà.
 */

import { defineConfig } from '../packages/core/src/config.js'

// Workflow con step di revisione editoriale prima della pubblicazione
const REVIEW_STAGES = [
  { name: 'draft',       label: 'Bozza',        initial: true  },
  { name: 'in_review',   label: 'In revisione'                 },
  { name: 'published',   label: 'Pubblicato'                   },
  { name: 'deprecated',  label: 'Deprecato',    final: true    },
  { name: 'trash',       label: 'Cestino',      final: true    },
]

export default defineConfig({
  codices: [

    // ── Articolo Knowledge Base ──────────────────────────────────────────────
    // Risponde a domande specifiche degli utenti (es. "Come resetto la password?")
    {
      name: 'article', label: 'Articoli KB', icon: 'pi-book',
      stages: REVIEW_STAGES,
      blueprint: [
        { name: 'title',       type: 'string',   label: 'Titolo',             queryable: true,  required: true  },
        { name: 'slug',        type: 'slug',     label: 'Slug',               slugSource: 'title'               },
        { name: 'summary',     type: 'textarea', label: 'Sommario breve',     queryable: true,  required: true  },
        { name: 'body',        type: 'richtext', label: 'Contenuto'                                             },
        { name: 'helpful_yes', type: 'number',   label: 'Voti utili',         queryable: true                   },
        { name: 'helpful_no',  type: 'number',   label: 'Voti non utili',     queryable: true                   },
        { name: 'version',     type: 'string',   label: 'Versione prodotto',  queryable: true                   },
      ],
      displayField: 'title',
    },

    // ── Guida step-by-step ───────────────────────────────────────────────────
    // Tutorial con prerequisiti e stima del tempo di lettura
    {
      name: 'guide', label: 'Guide', icon: 'pi-map',
      stages: REVIEW_STAGES,
      blueprint: [
        { name: 'title',        type: 'string',   label: 'Titolo',             queryable: true, required: true },
        { name: 'slug',         type: 'slug',     label: 'Slug',               slugSource: 'title'             },
        { name: 'intro',        type: 'textarea', label: 'Introduzione',       queryable: true                 },
        { name: 'body',         type: 'richtext', label: 'Contenuto'                                           },
        { name: 'prerequisites',type: 'textarea', label: 'Prerequisiti'                                        },
        { name: 'reading_time', type: 'number',   label: 'Tempo lettura (min)',queryable: true                  },
        { name: 'difficulty',   type: 'select',   label: 'Difficoltà',        queryable: true,
          options: ['beginner', 'intermediate', 'advanced']                                                     },
      ],
      displayField: 'title',
    },

    // ── Release Note ─────────────────────────────────────────────────────────
    // Changelog versionato. Uno per release.
    {
      name: 'release_note', label: 'Release Notes', icon: 'pi-tag',
      stages: [
        { name: 'draft',     label: 'Bozza',      initial: true },
        { name: 'published', label: 'Pubblicato'                },
        { name: 'trash',     label: 'Cestino',    final: true   },
      ],
      blueprint: [
        { name: 'version',    type: 'string',   label: 'Versione',   queryable: true, required: true },
        { name: 'slug',       type: 'slug',     label: 'Slug',       slugSource: 'version'           },
        { name: 'highlights', type: 'textarea', label: 'Highlights', queryable: true                 },
        { name: 'changes',    type: 'richtext', label: 'Dettaglio modifiche'                         },
        { name: 'breaking',   type: 'boolean',  label: 'Breaking changes',  queryable: true          },
        { name: 'release_date', type: 'date',   label: 'Data di rilascio',  queryable: true          },
      ],
      displayField: 'version',
    },

  ],

  vocabularies: [

    // Topic gerarchico (es. Account > Fatturazione, Integrazioni > API > Webhooks)
    {
      slug: 'topic',
      name: 'Topic',
      codices: ['article', 'guide'],
      hierarchical: true,
      icon: 'pi-sitemap',
    },

    // Area di prodotto — flat tag (es. dashboard, mobile-app, cli)
    {
      slug: 'product-area',
      name: 'Area prodotto',
      codices: ['article', 'guide', 'release_note'],
      hierarchical: false,
      icon: 'pi-th-large',
    },

  ],

  plugins: [
    (await import('../packages/plugins/media/src/index.js')).default,
    (await import('../packages/plugins/fields/src/index.js')).default,
    (await import('../packages/plugins/i18n/src/index.js')).default,
    // forms e mailer non servono in una KB interna
    // db-monitor utile in sviluppo
    (await import('../packages/plugins/db-monitor/src/index.js')).default,
    (await import('../packages/plugins/backup/src/index.js')).default,
  ],
})
