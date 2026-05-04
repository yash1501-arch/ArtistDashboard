import { create } from 'zustand'

const useFilterStore = create((set) => ({
  artistType:     null,
  selectedArtist: null,
  selectedGenre:  null,
  dateRange:      null,

  setArtistType:  (type) => set({ artistType: type }),
  setArtist:      (id)   => set({ selectedArtist: id }),
  setGenre:       (g)    => set({ selectedGenre: g }),
  setDateRange:   (r)    => set({ dateRange: r }),
}))

export default useFilterStore