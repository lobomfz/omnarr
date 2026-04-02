import { beforeEach, describe, expect, test } from 'bun:test'

import { database } from '@/db/connection'
import { DbEpisodes } from '@/db/episodes'
import { DbSeasons } from '@/db/seasons'
import { DbTmdbMedia } from '@/db/tmdb-media'

beforeEach(() => {
  database.reset()
})

async function seedSeason() {
  const tmdb = await DbTmdbMedia.upsert({
    tmdb_id: 1399,
    media_type: 'tv',
    title: 'Breaking Bad',
    imdb_id: 'tt0903747',
    year: 2008,
  })

  const [season] = await DbSeasons.upsert([
    {
      tmdb_media_id: tmdb.id,
      season_number: 1,
      title: 'Season 1',
      episode_count: 7,
    },
  ])

  return { tmdb, season }
}

describe('DbEpisodes', () => {
  test('upsert inserts episodes', async () => {
    const { season } = await seedSeason()

    const episodes = await DbEpisodes.upsert([
      { season_id: season.id, episode_number: 1, title: 'Pilot' },
      { season_id: season.id, episode_number: 2, title: "Cat's in the Bag..." },
    ])

    expect(episodes).toHaveLength(2)
    expect(episodes[0].episode_number).toBe(1)
    expect(episodes[0].title).toBe('Pilot')
    expect(episodes[1].episode_number).toBe(2)
  })

  test('upsert updates title on conflict', async () => {
    const { season } = await seedSeason()

    await DbEpisodes.upsert([
      { season_id: season.id, episode_number: 1, title: 'Pilot' },
    ])

    const updated = await DbEpisodes.upsert([
      { season_id: season.id, episode_number: 1, title: 'Pilot (Extended)' },
    ])

    expect(updated).toHaveLength(1)
    expect(updated[0].title).toBe('Pilot (Extended)')
  })

  test('upsert with empty array returns empty', async () => {
    const episodes = await DbEpisodes.upsert([])

    expect(episodes).toHaveLength(0)
  })

  test('getBySeasonEpisode returns matching episode', async () => {
    const { tmdb, season } = await seedSeason()

    await DbEpisodes.upsert([
      { season_id: season.id, episode_number: 1, title: 'Pilot' },
      { season_id: season.id, episode_number: 2, title: "Cat's in the Bag..." },
    ])

    const ep = await DbEpisodes.getBySeasonEpisode(tmdb.id, 1, 2)

    expect(ep).not.toBeUndefined()
    expect(ep!.id).toBeGreaterThan(0)
  })

  test('getBySeasonEpisode returns undefined when not found', async () => {
    const { tmdb } = await seedSeason()

    const ep = await DbEpisodes.getBySeasonEpisode(tmdb.id, 1, 99)

    expect(ep).toBeUndefined()
  })
})
