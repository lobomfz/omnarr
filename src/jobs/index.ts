import { Database } from 'bun:sqlite'
import { mkdirSync } from 'fs'
import { dirname, join } from 'path'

import { BunMQ } from '@lobomfz/bunmq'

import { envVariables } from '@/lib/env'

const jobsDbPath = join(dirname(envVariables.OMNARR_DB_PATH), 'jobs.sqlite')

mkdirSync(dirname(jobsDbPath), { recursive: true })

const jobsDb = new Database(jobsDbPath)

jobsDb.run('PRAGMA journal_mode = WAL')
jobsDb.run('PRAGMA synchronous = NORMAL')

export const { Queue, Worker } = new BunMQ({ db: jobsDb })
