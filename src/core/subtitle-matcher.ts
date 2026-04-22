import { mkdir } from 'fs/promises'
import { join } from 'path'

import { unzipSync } from 'fflate'
import { ratio } from 'fuzzball'
import axios from 'redaxios'

import { MIN_SYNC_CONFIDENCE } from '@/audio/audio-correlator'
import { config } from '@/lib/config'
import { db } from '@/db/connection'
import { DbDownloads } from '@/db/downloads'
import { DbReleases } from '@/db/releases'
import { Log } from '@/lib/log'
import { Parsers } from '@/lib/parsers'
import { Releases } from '@/core/releases'
import { TrackResolver } from '@/audio/track-resolver'
import { deriveId } from '@/lib/utils'

const FUZZY_THRESHOLD = 90
const MAX_ATTEMPTS = 5

const TIER_FUZZY = 0
const TIER_GROUP_SOURCE = 1
const TIER_SOURCE = 2
const TIER_NONE = 3

type MatchAttempt = {
  name: string
  confidence: number | null
  offset: number
  status: 'downloading' | 'testing' | 'matched' | 'no-match'
}

export class SubtitleMatcher extends TrackResolver {
  async match(
    opts: { lang?: string; season?: number; episode?: number },
    onProgress: (info: MatchAttempt) => void
  ) {
    const vadFileId = await this.resolveVadFileId()
    const referenceName = await this.resolveReferenceName()
    const subtitles = await new Releases().searchSubtitles(this.media.id, opts)

    if (subtitles.length === 0) {
      return {
        matched: null as MatchAttempt | null,
        tested: [] as MatchAttempt[],
      }
    }

    const ranked = this.rank(referenceName, subtitles).slice(0, MAX_ATTEMPTS)
    const tested: MatchAttempt[] = []

    for (const sub of ranked) {
      onProgress({
        name: sub.name,
        confidence: null,
        offset: 0,
        status: 'downloading',
      })

      const srtPath = await this.downloadSubtitle(sub.id)

      if (!srtPath) {
        const attempt: MatchAttempt = {
          name: sub.name,
          confidence: null,
          offset: 0,
          status: 'no-match',
        }

        tested.push(attempt)
        onProgress(attempt)

        continue
      }

      onProgress({
        name: sub.name,
        confidence: null,
        offset: 0,
        status: 'testing',
      })

      const { offset, confidence } = await this.correlateSubtitle(
        vadFileId,
        srtPath
      )

      Log.info(
        `auto-match: correlation offset=${offset.toFixed(3)}s confidence=${confidence?.toFixed(1) ?? 'null'}`
      )

      if (confidence !== null && confidence >= MIN_SYNC_CONFIDENCE) {
        const attempt: MatchAttempt = {
          name: sub.name,
          confidence,
          offset,
          status: 'matched',
        }

        tested.push(attempt)
        onProgress(attempt)

        return { matched: attempt, tested }
      }

      const attempt: MatchAttempt = {
        name: sub.name,
        confidence,
        offset,
        status: 'no-match',
      }

      tested.push(attempt)
      onProgress(attempt)
    }

    return { matched: null as MatchAttempt | null, tested }
  }

  rank<T extends { name: string }>(
    referenceName: string | null,
    subtitles: T[]
  ) {
    if (!referenceName || subtitles.length === 0) {
      return [...subtitles]
    }

    const ref = Parsers.releaseName(referenceName)
    const refTech = Parsers.technicalPart(referenceName)

    const withTier = subtitles.map((sub, index) => ({
      sub,
      index,
      tier: this.computeTier(refTech, ref, sub.name),
    }))

    withTier.sort((a, b) => a.tier - b.tier || a.index - b.index)

    return withTier.map((w) => w.sub)
  }

  private async resolveVadFileId() {
    let query = db
      .selectFrom('media_files as mf')
      .innerJoin('media_vad as mv', 'mv.media_file_id', 'mf.id')
      .where('mf.media_id', '=', this.media.id)
      .select('mf.id')

    if (this.media.episode_id !== undefined) {
      query = query.where('mf.episode_id', '=', this.media.episode_id)
    }

    const result = await query.executeTakeFirst()

    if (!result) {
      throw new Error('No VAD data found. Run scan first.')
    }

    return result.id
  }

  private async resolveReferenceName() {
    let query = db
      .selectFrom('media_tracks as mt')
      .innerJoin('media_files as mf', 'mf.id', 'mt.media_file_id')
      .innerJoin('downloads as d', 'd.id', 'mf.download_id')
      .leftJoin('releases as r', 'r.source_id', 'd.source_id')
      .where('mf.media_id', '=', this.media.id)
      .where('mt.stream_type', '=', 'video')
      .where('mt.is_default', '=', true)
      .select('r.name')

    if (this.media.episode_id !== undefined) {
      query = query.where('mf.episode_id', '=', this.media.episode_id)
    }

    const result = await query.executeTakeFirst()

    return result?.name ?? null
  }

  private async downloadSubtitle(releaseId: string) {
    const release = await DbReleases.getById(releaseId)

    if (!release) {
      return null
    }

    const tracksRoot = config.root_folders?.tracks

    if (!tracksRoot) {
      throw new Error('No tracks root folder configured')
    }

    const tracksDir = join(tracksRoot, this.media.id)
    const lang = release.language?.toLowerCase() ?? 'und'
    const sourceHash = deriveId(release.source_id)

    const targetDir =
      release.season_number != null && release.episode_number != null
        ? join(
            tracksDir,
            `s${String(release.season_number).padStart(2, '0')}e${String(release.episode_number).padStart(2, '0')}`
          )
        : tracksDir

    await mkdir(targetDir, { recursive: true })

    const download = await DbDownloads.create({
      media_id: this.media.id,
      source_id: release.source_id,
      download_url: release.download_url,
      source: 'subtitle',
      status: 'downloading',
    })

    try {
      const { data: zipData } = await axios<ArrayBuffer>({
        url: release.download_url,
        responseType: 'arrayBuffer',
      })

      const files = unzipSync(new Uint8Array(zipData))
      const srtEntries = Object.keys(files).filter((f) => f.endsWith('.srt'))

      if (srtEntries.length === 0) {
        await DbDownloads.update(download.id, {
          status: 'error',
          error_at: new Date(),
        })

        return null
      }

      const targetPath = join(targetDir, `sub_${lang}_${sourceHash}.srt`)

      await Bun.write(targetPath, files[srtEntries[0]])

      await DbDownloads.update(download.id, {
        status: 'completed',
        progress: 1,
        content_path: targetPath,
      })

      Log.info(`auto-match: subtitle saved path=${targetPath}`)

      return targetPath
    } catch (err) {
      await DbDownloads.update(download.id, {
        status: 'error',
        error_at: new Date(),
      }).catch((err) =>
        Log.warn(
          `auto-match: status update failed download=${download.id} error="${err instanceof Error ? err.message : String(err)}"`
        )
      )

      Log.warn(
        `auto-match: download failed release=${releaseId} error="${err instanceof Error ? err.message : String(err)}"`
      )

      return null
    }
  }

  private computeTier(
    refTechnical: string,
    ref: { group: string | null; source: string | null },
    subtitleName: string
  ) {
    const subTech = Parsers.technicalPart(subtitleName)

    if (ratio(refTechnical, subTech) >= FUZZY_THRESHOLD) {
      return TIER_FUZZY
    }

    const sub = Parsers.releaseName(subtitleName)

    const groupMatch =
      ref.group !== null &&
      sub.group !== null &&
      ref.group.toLowerCase() === sub.group.toLowerCase()

    const sourceMatch =
      ref.source !== null &&
      sub.source !== null &&
      ref.source.toLowerCase() === sub.source.toLowerCase()

    if (groupMatch && sourceMatch) {
      return TIER_GROUP_SOURCE
    }

    if (sourceMatch) {
      return TIER_SOURCE
    }

    return TIER_NONE
  }
}
