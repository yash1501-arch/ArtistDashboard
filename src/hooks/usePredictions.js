import { useQuery } from '@tanstack/react-query'

export function useAutoPredict(artistId, city, capacity, enabled) {
  return useQuery({
    queryKey: ['autoPredict', artistId, city, capacity],
    queryFn: async () => {
      if (!artistId || !city) return null
      return null
    },
    enabled: enabled,
    staleTime: Infinity,
    retry: false,
  })
}

export function useModelInfo() {
  return useQuery({
    queryKey: ['modelInfo'],
    queryFn: async () => ({ models: [] }),
    staleTime: Infinity,
    retry: false,
  })
}
