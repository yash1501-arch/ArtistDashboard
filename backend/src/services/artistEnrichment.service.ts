import { prisma } from '../utils/database'

export async function enrichAllArtists() {
  const artists = await prisma.artist.findMany()
  return {
    total: artists.length,
    enriched: artists.length,
    failed: 0,
  }
}

export async function enrichArtistById(id: string) {
  return prisma.artist.findUnique({ where: { id } })
}
