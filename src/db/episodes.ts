import type { Insertable } from '@lobomfz/db'

import { db, type DB } from '@/db/connection'

export const DbEpisodes = {
  async getBySeasonEpisode(
    tmdbMediaId: number,
    seasonNumber: number,
    episodeNumber: number
  ) {
    return await db
      .selectFrom('episodes as e')
      .innerJoin('seasons as s', 's.id', 'e.season_id')
      .where('s.tmdb_media_id', '=', tmdbMediaId)
      .where('s.season_number', '=', seasonNumber)
      .where('e.episode_number', '=', episodeNumber)
      .select('e.id')
      .executeTakeFirst()
  },

  async upsert(episodes: Insertable<DB['episodes']>[]) {
    if (episodes.length === 0) {
      return []
    }

    return await db
      .insertInto('episodes')
      .values(episodes)
      .onConflict((oc) =>
        oc.columns(['season_id', 'episode_number']).doUpdateSet({
          title: (eb) => eb.ref('excluded.title'),
        })
      )
      .returning(['id', 'season_id', 'episode_number', 'title'])
      .execute()
  },
}
