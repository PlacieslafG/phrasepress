// Fastify route plugins — see docs/03-post-types.md through docs/07-auth.md
export { default as postsRoutes }                       from './posts.js'
export { default as taxonomiesRoutes, postTermsRoutes } from './taxonomies.js'
export { default as pluginsRoutes }                     from './plugins.js'
export { default as authRoutes }                        from './auth.js'
export { default as usersRoutes }                       from './users.js'
export { default as rolesRoutes }                       from './roles.js'
export { metaRoutes }                                   from './meta.js'
