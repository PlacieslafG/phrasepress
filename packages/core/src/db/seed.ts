import { hash } from 'argon2'
import { eq } from 'drizzle-orm'
import { db } from './client.js'
import { roles, users } from './schema.js'

const ALL_CAPABILITIES = [
  'read',
  'edit_folios',
  'edit_others_folios',
  'publish_folios',
  'delete_folios',
  'delete_others_folios',
  'manage_terms',
  'manage_users',
  'manage_roles',
  'manage_plugins',
  'manage_options',
  'upload_files',
]

const DEFAULT_ROLES = [
  {
    name: 'Administrator',
    slug: 'administrator',
    capabilities: ALL_CAPABILITIES,
  },
  {
    name: 'Editor',
    slug: 'editor',
    capabilities: ['read', 'edit_folios', 'edit_others_folios', 'publish_folios', 'delete_folios', 'manage_terms'],
  },
  {
    name: 'Author',
    slug: 'author',
    capabilities: ['read', 'edit_folios', 'publish_folios', 'delete_folios'],
  },
]

export async function seedDatabase() {
  const existing = db.select({ id: users.id }).from(users).limit(1).all()
  if (existing.length > 0) return

  // Inserisci i ruoli di default
  for (const role of DEFAULT_ROLES) {
    db.insert(roles)
      .values({ name: role.name, slug: role.slug, capabilities: JSON.stringify(role.capabilities) })
      .onConflictDoNothing()
      .run()
  }

  // Crea l'utente admin
  const adminPassword = process.env['ADMIN_PASSWORD']
  if (!adminPassword) throw new Error('ADMIN_PASSWORD env variable is required for initial seed')

  const adminRole = db.select({ id: roles.id }).from(roles).where(eq(roles.slug, 'administrator')).get()
  if (!adminRole) throw new Error('Administrator role not found after seed')

  const passwordHash = await hash(adminPassword)

  db.insert(users).values({
    username:     'admin',
    email:        'admin@phrasepress.local',
    passwordHash,
    roleId:       adminRole.id,
    createdAt:    Math.floor(Date.now() / 1000),
  }).run()

  console.log('[db] seed completed — admin user created')
}
