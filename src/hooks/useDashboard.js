import { useQuery } from '@tanstack/react-query'
import client from '../api/client'

/**
 * Hook to fetch dashboard KPIs and top artists.
 *
 * @returns {Object} { kpis, topArtists, isLoading, error }
 */
function useDashboard() {
  // Fetch KPIs
  const { data: kpisData, isLoading: kpisLoading, error: kpisError } = useQuery({
    queryKey: ['dashboard', 'kpis'],
    queryFn: async () => {
      const res = await client.get('/dashboard/kpis')
      return res.data.data.kpis
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  // Fetch top artists
  const { data: topArtistsData, isLoading: topArtistsLoading, error: topArtistsError } = useQuery({
    queryKey: ['dashboard', 'top-artists'],
    queryFn: async () => {
      // Default to top 10 artists by followers across all platforms
      const res = await client.get('/dashboard/top-artists?limit=10')
      return res.data.data.artists || []
    },
    staleTime: 5 * 60 * 1000,
  })

  return {
    kpis: kpisData || null,
    topArtists: topArtistsData || [],
    isLoading: kpisLoading || topArtistsLoading,
    error: kpisError || topArtistsError,
  }
}

export default useDashboard
