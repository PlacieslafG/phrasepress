module.exports = {
  apps: [
    {
      name:        'phrasepress',
      script:      './packages/core/dist/server.js',
      // SQLite non supporta accesso concorrente da più processi Node
      instances:   1,
      autorestart: true,
      watch:       false,
      max_memory_restart: '512M',
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
}
