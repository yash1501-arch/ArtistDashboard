import React from 'react'
import { useQuery } from '@tanstack/react-query'
import client from '../api/client'

// Check if user is authenticated
const isAuthenticated = () => {
  return !!localStorage.getItem('token')
}

export function useDashboardData({ timeFilter = 12 } = {}) {
  // Fetch KPIs
  const { data: kpisData, isLoading: kpisLoading, error: kpisError } = useQuery({
    queryKey: ['dashboard', 'kpis'],
    queryFn: async () => {
      const response = await client.get('/dashboard/kpis')
      return response.data.data
    },
    enabled: isAuthenticated(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  // Fetch top artists (get a larger pool to allow filtering by type)
  const { data: topArtistsData, isLoading: topArtistsLoading, error: topArtistsError } = useQuery({
    queryKey: ['dashboard', 'top-artists'],
    queryFn: async () => {
      const response = await client.get('/dashboard/top-artists?limit=100')
      // Assuming response.data.data.artists or response.data.artists based on dashboard controller
      return response.data.data?.artists || response.data.artists || []
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!kpisData && isAuthenticated(),
  })

  // Fetch follower trends per platform (Instagram, YouTube, Spotify)
  const { data: instagramTrends, isLoading: instagramLoading } = useQuery({
    queryKey: ['analytics', 'trends', 'instagram'],
    queryFn: async () => {
      const response = await client.get('/analytics/trends?metric=followers&platform=instagram')
      return response.data?.trends || []
    },
    staleTime: 10 * 60 * 1000,
    enabled: !!kpisData && isAuthenticated(),
  })

  const { data: youtubeTrends, isLoading: youtubeLoading } = useQuery({
    queryKey: ['analytics', 'trends', 'youtube'],
    queryFn: async () => {
      const response = await client.get('/analytics/trends?metric=followers&platform=youtube')
      return response.data?.trends || []
    },
    staleTime: 10 * 60 * 1000,
    enabled: !!kpisData && isAuthenticated(),
  })

  const { data: spotifyTrends, isLoading: spotifyLoading } = useQuery({
    queryKey: ['analytics', 'trends', 'spotify'],
    queryFn: async () => {
      const response = await client.get('/analytics/trends?metric=followers&platform=spotify')
      return response.data?.trends || []
    },
    staleTime: 10 * 60 * 1000,
    enabled: !!kpisData && isAuthenticated(),
  })

  // Fetch genre data
  const { data: genresData, isLoading: genresLoading, error: genresError } = useQuery({
    queryKey: ['analytics', 'genres'],
    queryFn: async () => {
      const response = await client.get('/analytics/genres')
      return response.data?.genres || []
    },
    staleTime: 10 * 60 * 1000,
    enabled: !!kpisData && isAuthenticated(),
  })

  // Fetch all artists for artistType mapping (limited to 1000)
  const { data: allArtistsRaw } = useQuery({
    queryKey: ['artists', 'all-for-dashboard'],
    queryFn: async () => {
      const response = await client.get('/artists?limit=1000')
      return response.data.data?.artists || []
    },
    staleTime: 10 * 60 * 1000,
    enabled: !!kpisData && isAuthenticated(),
  })

  // Fetch all concerts for revenue aggregation and totalConcerts calculation
  const { data: allConcertsRaw } = useQuery({
    queryKey: ['concerts', 'all-for-dashboard'],
    queryFn: async () => {
      const response = await client.get('/concerts?limit=1000')
      return response.data.data.concerts || []
    },
    staleTime: 10 * 60 * 1000,
    enabled: !!kpisData && isAuthenticated(),
  })

  // Fetch demographics data
  const { data: ageDemographicsData, isLoading: ageLoading } = useQuery({
    queryKey: ['analytics', 'demographics', 'age'],
    queryFn: async () => {
      const response = await client.get('/analytics/demographics/age')
      return response.data.data.breakdown || []
    },
    staleTime: 15 * 60 * 1000,
    enabled: !!kpisData && isAuthenticated(),
  })

  const { data: genderDemographicsData, isLoading: genderLoading } = useQuery({
    queryKey: ['analytics', 'demographics', 'gender'],
    queryFn: async () => {
      const response = await client.get('/analytics/demographics/gender')
      return response.data.data.breakdown || []
    },
    staleTime: 15 * 60 * 1000,
    enabled: !!kpisData && isAuthenticated(),
  })

  const isLoading = kpisLoading || topArtistsLoading || instagramLoading || youtubeLoading || spotifyLoading || genresLoading || ageLoading || genderLoading
  const error = kpisError // only fail if KPIs fail, since it's the main data point. Others can be optional.

  // Build artistId -> type map (from all artists)
  const artistTypeById = React.useMemo(() => {
    if (!allArtistsRaw) return {}
    const map = {}
    allArtistsRaw.forEach(artist => {
      const nationality = artist.nationality || ''
      const type = nationality.toLowerCase().includes('india') ? 'indian' : 'international'
      map[artist.id] = type
    })
    return map
  }, [allArtistsRaw])

  // Build artistId -> name map for concert display
  const artistNameMap = React.useMemo(() => {
    if (!allArtistsRaw) return {}
    const map = {}
    allArtistsRaw.forEach(artist => {
      map[artist.id] = artist.artistName
    })
    return map
  }, [allArtistsRaw])

  // Transform KPIs
  const kpis = kpisData ? {
    totalArtists: kpisData.totalArtists || 0,
    totalConcerts: kpisData.totalConcerts || 0,
    ticketsSoldYTD: kpisData.ticketsSoldYTD || 0,
    revenueYTD: kpisData.revenueYTD || 0,
    avgRoG: kpisData.avgRoGDaily ? parseFloat(kpisData.avgRoGDaily.toFixed(2)) : 0,
    topArtistByStreams: kpisData.topArtistByStreams || null,
  } : null

  // Transform top artists: convert API format to UI format
  // We'll process all topArtistsData (pool) and then apply artistType filter and sorting on client
  const transformedArtistsPool = React.useMemo(() => {
    if (!topArtistsData) return []

    return topArtistsData.map(item => {
      const artist = item.artist
      const nationality = artist.nationality || ''
      const genres = artist.genres || []
      // Use artistId to look up type from the artistTypeMap (built from all artists)
      const type = artistTypeById[artist.id] || 'international'
      const genre = genres.length > 0 ? genres[0].genre.name : 'Unknown'

      // Followers by platform
      const followers = {
        instagram: 0,
        youtube: 0,
        spotify: 0,
        facebook: 0,
        applemusic: 0,
      }
      const rog = {
        instagram: 0,
        youtube: 0,
        spotify: 0,
        facebook: 0,
        applemusic: 0,
      }

      if (item.platforms && Array.isArray(item.platforms)) {
        item.platforms.forEach(p => {
          const key = p.platform.toLowerCase()
          if (key in followers) {
            followers[key] = p.followers || 0
          }
        })
      }

      // Normalized popularity (0-100). Assume 100M followers = 100
      const popularity = Math.min(100, Math.round((item.totalFollowers || 0) / 1000000))

      // Approx monthly streams: 0.1% of total followers
      const monthlyStreams = Math.round(item.totalFollowers * 0.001)

      const photo = artist.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(artist.artistName)}&background=6366F1&color=fff`

      return {
        id: artist.id,
        name: artist.artistName,
        type,
        genre,
        nationality,
        age: 0,
        totalConcerts: 0, // will compute later from concerts
        popularity,
        monthlyStreams,
        followers,
        rog,
        photo,
        totalFollowers: item.totalFollowers || 0,
      }
    })
  }, [topArtistsData, artistTypeById])

  // Compute totalConcerts per artist from allConcerts
  const artistConcertCounts = React.useMemo(() => {
    if (!allConcertsRaw) return {}
    const counts = {}
    allConcertsRaw.forEach(concert => {
      const artistId = concert.artistId
      counts[artistId] = (counts[artistId] || 0) + 1
    })
    return counts
  }, [allConcertsRaw])

  // Combine transformedArtistsPool with concert counts:
  const topArtistsWithConcerts = React.useMemo(() => {
    if (!transformedArtistsPool.length) return []
    return transformedArtistsPool.map(artist => ({
      ...artist,
      totalConcerts: artistConcertCounts[artist.id] || 0,
    }))
  }, [transformedArtistsPool, artistConcertCounts])

  // Transform age demographics
  const ageData = React.useMemo(() => {
    if (!ageDemographicsData) return []
    return ageDemographicsData.map(item => ({
      name: capitalize(item.dimensionValue),
      value: Math.round(item._avg?.percentage || 0),
    }))
  }, [ageDemographicsData])

  // Transform gender demographics
  const genderData = React.useMemo(() => {
    if (!genderDemographicsData) return []
    return genderDemographicsData.map(item => ({
      name: capitalize(item.dimensionValue),
      value: Math.round(item._avg?.percentage || 0),
    }))
  }, [genderDemographicsData])

  // Combine trends into followerTrends
  const followerTrends = React.useMemo(() => {
    const allTrends = []
    const addTrends = (data, platform) => {
      if (!data || !Array.isArray(data)) return
      data.forEach(metric => {
        const date = new Date(metric.date)
        const monthYear = date.toLocaleDateString('en-US', { month: 'short' })
        let existing = allTrends.find(d => d.date === monthYear)
        if (existing) {
          existing[platform] += metric.followers || 0
        } else {
          const newEntry = { date: monthYear, instagram: 0, youtube: 0, spotify: 0 }
          newEntry[platform] = metric.followers || 0
          allTrends.push(newEntry)
        }
      })
    }

    addTrends(instagramTrends, 'instagram')
    addTrends(youtubeTrends, 'youtube')
    addTrends(spotifyTrends, 'spotify')

    // Sort by month order
    const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return allTrends.sort((a, b) => monthOrder.indexOf(a.date) - monthOrder.indexOf(b.date))
  }, [instagramTrends, youtubeTrends, spotifyTrends])

  // Transform genres
  const genreData = React.useMemo(() => {
    if (!genresData) return []
    return genresData.map(g => ({
      genre: g.genreName,
      streams: g.totalFollowers,
    }))
  }, [genresData])

  // Transform concerts to match UI format
  const transformedConcerts = React.useMemo(() => {
    if (!allConcertsRaw) return []
    return allConcertsRaw.map(c => ({
      id: c.id,
      artistId: c.artistId, // Keep artistId for type filtering
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
  }, [allConcertsRaw])

  return {
    data: {
      kpis,
      topArtistsPool: topArtistsWithConcerts,
      allConcerts: transformedConcerts,
      allArtists: allArtistsRaw, // expose for total artist count
      followerTrends,
      genres: genreData,
      ageData,
      genderData,
      artistIdToType: artistTypeById,
    },
    isLoading,
    error,
    // Individual loading states for possible use
    isKpisLoading: kpisLoading,
    isTopArtistsLoading: topArtistsLoading,
    isConcertsLoading: allConcertsRaw === undefined,
    isTrendsLoading: instagramLoading || youtubeLoading || spotifyLoading,
    isGenresLoading: genresLoading,
    isDemographicsLoading: ageLoading || genderLoading,
  }
}

// Helper function
function capitalize(str) {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}
