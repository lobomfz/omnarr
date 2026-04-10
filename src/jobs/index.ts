import { Database } from 'bun:sqlite'
import { mkdirSync } from 'fs'
import { dirname } from 'path'

import { BunMQ } from '@lobomfz/bunmq'

import { envVariables } from '@/lib/env'

if (envVariables.OMNARR_JOBS_PATH !== ':memory:') {
  mkdirSync(dirname(envVariables.OMNARR_JOBS_PATH), { recursive: true })
}

const jobsDb = new Database(envVariables.OMNARR_JOBS_PATH)

jobsDb.run('PRAGMA journal_mode = WAL')
jobsDb.run('PRAGMA synchronous = NORMAL')

export const { Queue, Worker } = new BunMQ({ db: jobsDb })
