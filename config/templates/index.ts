export const TEMPLATES = [
  {
    id: 'blog',
    label: 'Blog',
    description: 'Blog classico con post, pagine, categorie e tag',
    file: 'blog.ts',
  },
  {
    id: 'knowledge-base',
    label: 'Knowledge Base',
    description: 'Piattaforma di supporto con articoli, guide e release notes',
    file: 'knowledge-base.ts',
  },
  {
    id: 'portfolio',
    label: 'Portfolio / Agenzia',
    description: 'Progetti, servizi e testimonial per studi creativi o agenzie',
    file: 'portfolio.ts',
  },
  {
    id: 'ecommerce',
    label: 'E-commerce / Catalogo',
    description: 'Catalogo prodotti con SKU, prezzi, disponibilità e recensioni',
    file: 'ecommerce.ts',
  },
  {
    id: 'news',
    label: 'Testata Editoriale',
    description: 'Articoli di notizie, editoriali e workflow di pubblicazione',
    file: 'news.ts',
  },
  {
    id: 'corporate',
    label: 'Sito Aziendale',
    description: 'Pagine, team, case study e servizi per siti corporate',
    file: 'corporate.ts',
  },
] as const

export type TemplateId = (typeof TEMPLATES)[number]['id']
