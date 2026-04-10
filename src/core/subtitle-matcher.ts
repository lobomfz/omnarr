import { ratio } from 'fuzzball'

import { PubSub } from '@/api/pubsub'
import { MIN_SYNC_CONFIDENCE } from '@/audio/audio-correlator'
import { TrackResolver } from '@/audio/track-resolver'
import { Releases } from '@/core/releases'
import { SubtitleDownload } from '@/core/subtitle-download'
import { db } from '@/db/connection'
import { resolveTracksDir } from '@/lib/config'
import { Log } from '@/lib/log'
import { Parsers } from '@/lib/parsers'

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
  async match(opts: { lang?: string; season?: number; episode?: number }) {
    const vadFileId = await this.resolveVadFileId()
    const referenceName = await this.resolveReferenceName()
    const subtitles = await new Releases().searchSubtitles(this.media.id, opts)
    const tested: MatchAttempt[] = []

    if (subtitles.length === 0) {
      return { matched: null, tested }
    }

    const ranked = this.rank(referenceName, subtitles).slice(0, MAX_ATTEMPTS)
    const tracksDir = resolveTracksDir(this.media.id)
    const downloader = new SubtitleDownload()

    for (const sub of ranked) {
      await this.publish({
        name: sub.name,
        confidence: null,
        offset: 0,
        status: 'downloading',
      })

      const result = await downloader.download({
        source_id: sub.source_id,
        download_url: sub.download_url,
        media_id: this.media.id,
        tracks_dir: tracksDir,
        language: sub.language,
        season_number: sub.season_number,
        episode_number: sub.episode_number,
      })

      if (!result) {
        const attempt: MatchAttempt = {
          name: sub.name,
          confidence: null,
          offset: 0,
          status: 'no-match',
        }

        tested.push(attempt)
        await this.publish(attempt)

        continue
      }

      await this.publish({
        name: sub.name,
        confidence: null,
        offset: 0,
        status: 'testing',
      })

      const { offset, confidence } = await this.correlateSubtitle(
        vadFileId,
        result.path
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
        await this.publish(attempt)

        return { matched: attempt, tested }
      }

      const attempt: MatchAttempt = {
        name: sub.name,
        confidence,
        offset,
        status: 'no-match',
      }

      tested.push(attempt)
      await this.publish(attempt)
    }

    return { matched: null, tested }
  }

  private async publish(attempt: MatchAttempt) {
    await PubSub.publish('subtitle_progress', {
      media_id: this.media.id,
      ...attempt,
    })
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
      ref.group !== null && sub.group !== null && ref.group === sub.group

    const sourceMatch =
      ref.source !== null && sub.source !== null && ref.source === sub.source

    if (groupMatch && sourceMatch) {
      return TIER_GROUP_SOURCE
    }

    if (sourceMatch) {
      return TIER_SOURCE
    }

    return TIER_NONE
  }
}
