export const ALL_CAPABILITIES = [
  'read',
  'edit_posts',
  'edit_others_posts',
  'publish_posts',
  'delete_posts',
  'delete_others_posts',
  'manage_terms',
  'manage_users',
  'manage_roles',
  'manage_plugins',
  'manage_options',
  'upload_files',
] as const

export type Capability = (typeof ALL_CAPABILITIES)[number]

export function isValidCapability(cap: string): cap is Capability {
  return (ALL_CAPABILITIES as readonly string[]).includes(cap)
}

export function hasCapability(roleSlug: string, capabilities: string[], required: string): boolean {
  // Administrator ha implicitamente tutto
  if (roleSlug === 'administrator') return true
  return capabilities.includes(required)
}
