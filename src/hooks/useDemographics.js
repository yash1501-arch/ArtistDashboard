import { useQuery } from '@tanstack/react-query'
import client from '../api/client'

/**
 * Hook to fetch demographic data for the Demographics page.
 * Fetches age distribution, gender distribution, and geographic data.
 *
 * @param {Object} options
 * @param {string} options.artistId - Optional filter for specific artist
 * @returns {Object} Data, loading, and error states
 */
export function useDemographics({ artistId } = {}) {
  // Build API URL with optional artistId filter
  const url = artistId ? `/analytics/demographics?artistId=${artistId}` : '/analytics/demographics'

  // Fetch age distribution data
  const { data: ageData, isLoading: ageLoading, error: ageError } = useQuery({
    queryKey: ['demographics', 'age', artistId],
    queryFn: async () => {
      const response = await client.get(url)
      // Expected response structure:
      // {
      //   data: {
      //     ageBreakdown: [{ dimensionValue: '18-24', _avg: { percentage: 34 } }, ...]
      //   }
      // }
      return response?.data?.data?.breakdown || []
    },
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes
  })

  // Fetch gender distribution data
  const { data: genderData, isLoading: genderLoading, error: genderError } = useQuery({
    queryKey: ['demographics', 'gender', artistId],
    queryFn: async () => {
      const response = await client.get(url)
      // Expected response structure similar to ageData
      return response?.data?.data?.breakdown || []
    },
    staleTime: 10 * 60 * 1000,
  })

  // Fetch geographic data
  const { data: geoData, isLoading: geoLoading, error: geoError } = useQuery({
    queryKey: ['demographics', 'geo', artistId],
    queryFn: async () => {
      const response = await client.get(url)
      // Expected response structure:
      // {
      //   data: {
      //     locationData: [
      //       { city: 'Mumbai', audience: 4200000, latitude: 19.0760, longitude: 72.8777 },
      //       ...
      //     ]
      //   }
      // }
      return response?.data?.data?.locations || []
    },
    staleTime: 10 * 60 * 1000,
  })

  // Combined loading state
  const isLoading = ageLoading || genderLoading || geoLoading
  const error = ageError || genderError || geoError

  // Transform data for visualization components
  const transformAgeData = (rawData) => {
    if (!rawData) return []
    return rawData.map(item => ({
      name: capitalize(item.dimensionValue || 'Unknown'),
      value: Math.round(item._avg?.percentage || 0),
    }))
  }

  const transformGenderData = (rawData) => {
    if (!rawData) return []
    return rawData.map(item => ({
      name: capitalize(item.dimensionValue || 'Unknown'),
      value: Math.round(item._avg?.percentage || 0),
    }))
  }

  const transformGeoData = (rawData) => {
    if (!rawData) return []
    return rawData.map(item => ({
      city: item.city || 'Unknown',
      audience: item.audience || 0,
      lat: item.latitude || 0,
      lng: item.longitude || 0,
    }))
  }

  // Combined data state
  return {
    data: {
      ageData: ageData ? transformAgeData(ageData) : [],
      genderData: genderData ? transformGenderData(genderData) : [],
      geoData: geoData ? transformGeoData(geoData) : [],
      isLoading,
      isError: !!error,
      // Individual error states for potential UI components
      isAgeError: !!ageError,
      isGenderError: !!genderError,
      isGeoError: !!geoError,
    },
  }
}

// Helper function for capitalizing strings
function capitalize(str) {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}