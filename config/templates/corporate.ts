/**
 * PhrasePress — Template: Sito Aziendale
 *
 * Sito corporate con pagine statiche, team, case study e servizi.
 */

import { defineConfig } from '../../packages/core/src/config.js'

const DEFAULT_STAGES = [
  { name: 'draft',     label: 'Bozza',     initial: true },
  { name: 'published', label: 'Pubblicato' },
  { name: 'archived',  label: 'Archiviato', final: true },
]

export default defineConfig({
  codices: [

    // ── Pagina ────────────────────────────────────────────────────────────────
    {
      name: 'page', label: 'Pagine', icon: 'pi-file-o',
      stages: DEFAULT_STAGES,
      blueprint: [
        { name: 'title',    type: 'string',   label: 'Titolo',    queryable: true, required: true },
        { name: 'slug',     type: 'slug',     label: 'Slug',      slugSource: 'title' },
        { name: 'content',  type: 'richtext', label: 'Contenuto' },
        { name: 'meta_description', type: 'textarea', label: 'Meta description', queryable: true },
      ],
      displayField: 'title',
      listColumns: ['title', 'stage', 'updatedAt'],
    },

    // ── Membro del team ────────────────────────────────────────────────────────
    {
      name: 'team_member', label: 'Team', icon: 'pi-users',
      stages: DEFAULT_STAGES,
      blueprint: [
        { name: 'name',     type: 'string',   label: 'Nome',           queryable: true, required: true },
        { name: 'slug',     type: 'slug',     label: 'Slug',           slugSource: 'name' },
        { name: 'role',     type: 'string',   label: 'Ruolo',          queryable: true, required: true },
        { name: 'bio',      type: 'richtext', label: 'Biografia' },
        { name: 'email',    type: 'string',   label: 'Email' },
        { name: 'linkedin', type: 'string',   label: 'URL LinkedIn' },
        { name: 'photo',    type: 'image',    label: 'Foto' },
        { name: 'order',    type: 'number',   label: 'Ordine visualizzazione', queryable: true },
      ],
      displayField: 'name',
      listColumns: ['name', 'role', 'stage'],
    },

    // ── Case Study ────────────────────────────────────────────────────────────
    {
      name: 'case_study', label: 'Case Study', icon: 'pi-chart-line',
      stages: DEFAULT_STAGES,
      blueprint: [
        { name: 'title',          type: 'string',   label: 'Titolo',           queryable: true, required: true },
        { name: 'slug',           type: 'slug',     label: 'Slug',             slugSource: 'title' },
        { name: 'client',         type: 'string',   label: 'Cliente',          queryable: true },
        { name: 'summary',        type: 'textarea', label: 'Sommario',         queryable: true },
        { name: 'challenge',      type: 'richtext', label: 'La sfida' },
        { name: 'solution',       type: 'richtext', label: 'La soluzione' },
        { name: 'results',        type: 'richtext', label: 'I risultati' },
        { name: 'featured_image', type: 'image',    label: 'Immagine copertina' },
      ],
      displayField: 'title',
      listColumns: ['title', 'client', 'stage'],
    },

    // ── Servizio ─────────────────────────────────────────────────────────────
    {
      name: 'service', label: 'Servizi', icon: 'pi-cog',
      stages: DEFAULT_STAGES,
      blueprint: [
        { name: 'title',       type: 'string',   label: 'Titolo',      queryable: true, required: true },
        { name: 'slug',        type: 'slug',     label: 'Slug',        slugSource: 'title' },
        { name: 'icon',        type: 'string',   label: 'Icona (PrimeIcons)' },
        { name: 'tagline',     type: 'string',   label: 'Tagline',     queryable: true },
        { name: 'description', type: 'richtext', label: 'Descrizione' },
        { name: 'order',       type: 'number',   label: 'Ordine visualizzazione', queryable: true },
      ],
      displayField: 'title',
      listColumns: ['title', 'tagline', 'stage'],
    },

  ],

  vocabularies: [
    {
      slug: 'department',
      name: 'Dipartimenti',
      codices: ['team_member'],
      hierarchical: false,
      icon: 'pi-users',
    },
    {
      slug: 'industry',
      name: 'Settori',
      codices: ['case_study', 'service'],
      hierarchical: false,
      icon: 'pi-building',
    },
  ],

  plugins: [
    // Seleziona i plugin durante il wizard (o aggiungili manualmente):
    // (await import('../../packages/plugins/media/src/index.js')).default,
    // (await import('../../packages/plugins/fields/src/index.js')).default,
    // (await import('../../packages/plugins/forms/src/index.js')).default,
  ],
})
