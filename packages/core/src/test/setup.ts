// Eseguito da Vitest in ogni worker PRIMA che vengano importati i file di test.
// Le variabili d'ambiente sono già iniettate da vitest.config.ts `test.env`.
import { runMigrations } from '../db/migrate.js'
import { seedDatabase } from '../db/seed.js'

runMigrations()
await seedDatabase()
