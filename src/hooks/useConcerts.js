import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import client from '../api/client'

/**
 * Hook to fetch concerts with optional filters and infinite scrolling.
 */
export function useConcerts({ city, startDate, endDate, limit = 50 } = {}) {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = useInfiniteQuery({
    queryKey: ['concerts', city, startDate, endDate],
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams()
      if (city && city !== 'All') params.append('city', city)
      if (startDate) params.append('startDate', startDate)
      if (endDate) params.append('endDate', endDate)
      params.append('page', pageParam.toString())
      params.append('limit', limit.toString())

      const response = await client.get(`/concerts?${params.toString()}`)
      const { concerts, pagination } = response?.data?.data || { concerts: [], pagination: {} }
      
      const mapped = concerts.map(c => ({
        id: c.id,
        artistId: c.artistId,
        artist: c.artist?.artistName || 'Unknown Artist',
        name: c.concertName,
        date: new Date(c.concertDate),
        city: c.city,
        state: c.state,
        country: c.country,
        venue: c.venueName,
        capacity: c.capacity,
        tickets_sold: c.ticketsSold,
        avg_ticket_price: Number(c.avgTicketPrice || 0),
        total_revenue: Number(c.totalRevenue || 0),
        lat: Number(c.latitude || 0),
        lng: Number(c.longitude || 0),
        sponsors: c.sponsors || [],
      }))

      return {
        concerts: mapped,
        nextPage: pageParam < pagination.pages ? pageParam + 1 : undefined,
        total: pagination.total
      }
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 1,
    staleTime: 5 * 60 * 1000,
  })

  // Flatten the pages into a single array for easier consumption
  const concerts = data?.pages.flatMap(page => page.concerts) || []
  const total = data?.pages[0]?.total || 0

  return { 
    data: concerts, 
    total,
    isLoading, 
    error, 
    fetchNextPage, 
    hasNextPage, 
    isFetchingNextPage 
  }
}

/**
 * Hook to fetch a single concert by ID.
 */
export function useConcertDetail(id) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['concert', id],
    queryFn: async () => {
      if (!id) return null
      const response = await client.get(`/concerts/${id}`)
      // axios returns { data: { success: true, data: { concert: {...} } } }
      const c = response?.data?.data?.concert
      if (!c) return null

      return {
        id: c.id,
        artistId: c.artistId,
        artist: c.artist?.artistName || 'Unknown Artist',
        name: c.concertName,
        date: new Date(c.concertDate),
        city: c.city,
        state: c.state,
        country: c.country,
        venue: c.venueName,
        capacity: c.capacity,
        tickets_sold: c.ticketsSold,
        avg_ticket_price: Number(c.avgTicketPrice || 0),
        total_revenue: Number(c.totalRevenue || 0),
        lat: Number(c.latitude || 0),
        lng: Number(c.longitude || 0),
        sponsors: c.sponsors || [], // Backend might not have this yet, but keeping for compatibility
        audienceDemographics: c.audienceDemographics || []
      }
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  })

  return { data, isLoading, error }
}
