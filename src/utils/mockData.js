export const mockArtists = [
  { id: '1', name: 'Arijit Singh',   type: 'indian',        genre: 'Bollywood',        nationality: 'Indian',
    age: 37, totalConcerts: 142,
    photo: 'https://i.pravatar.cc/150?img=1',
    popularity: 87, monthlyStreams: 42000000,
    followers: { instagram: 8200000,  youtube: 12400000, spotify: 6100000,  facebook: 5400000,  applemusic: 3200000 },
    rog:       { instagram: 2.4,      youtube: 1.8,      spotify: 3.1,      facebook: 1.2,      applemusic: 2.8     } },

  { id: '2', name: 'Dua Lipa',       type: 'international', genre: 'Pop',              nationality: 'British',
    age: 29, totalConcerts: 98,
    photo: 'https://i.pravatar.cc/150?img=2',
    popularity: 94, monthlyStreams: 89000000,
    followers: { instagram: 87000000, youtube: 24000000, spotify: 41000000, facebook: 32000000, applemusic: 18000000 },
    rog:       { instagram: 0.8,      youtube: 1.2,      spotify: 1.5,      facebook: 0.6,      applemusic: 1.1     } },

  { id: '3', name: 'AR Rahman',      type: 'indian',        genre: 'Classical/Fusion', nationality: 'Indian',
    age: 57, totalConcerts: 215,
    photo: 'https://i.pravatar.cc/150?img=3',
    popularity: 82, monthlyStreams: 28000000,
    followers: { instagram: 4100000,  youtube: 9800000,  spotify: 3200000,  facebook: 7800000,  applemusic: 1900000 },
    rog:       { instagram: 1.1,      youtube: 0.9,      spotify: 1.4,      facebook: 0.7,      applemusic: 1.2     } },

  { id: '4', name: 'The Weeknd',     type: 'international', genre: 'R&B',              nationality: 'Canadian',
    age: 34, totalConcerts: 176,
    photo: 'https://i.pravatar.cc/150?img=4',
    popularity: 96, monthlyStreams: 112000000,
    followers: { instagram: 34000000, youtube: 31000000, spotify: 85000000, facebook: 21000000, applemusic: 42000000 },
    rog:       { instagram: 0.6,      youtube: 0.9,      spotify: 1.1,      facebook: 0.4,      applemusic: 0.9     } },

  { id: '5', name: 'Shreya Ghoshal', type: 'indian',        genre: 'Bollywood',        nationality: 'Indian',
    age: 39, totalConcerts: 188,
    photo: 'https://i.pravatar.cc/150?img=5',
    popularity: 79, monthlyStreams: 18000000,
    followers: { instagram: 9800000,  youtube: 7200000,  spotify: 2800000,  facebook: 6100000,  applemusic: 1400000 },
    rog:       { instagram: 1.9,      youtube: 1.3,      spotify: 2.2,      facebook: 1.0,      applemusic: 1.8     } },

  { id: '6', name: 'Ed Sheeran',     type: 'international', genre: 'Pop',              nationality: 'British',
    age: 33, totalConcerts: 312,
    photo: 'https://i.pravatar.cc/150?img=6',
    popularity: 98, monthlyStreams: 134000000,
    followers: { instagram: 44000000, youtube: 55000000, spotify: 92000000, facebook: 38000000, applemusic: 51000000 },
    rog:       { instagram: 0.4,      youtube: 0.7,      spotify: 0.9,      facebook: 0.3,      applemusic: 0.8     } },
]

export const mockConcerts = [
  // ── Arijit Singh ──
  { id: 'c1',  artist: 'Arijit Singh', name: 'Arijit Live 2024',
    date: '2024-12-15', city: 'Mumbai',    state: 'Maharashtra', country: 'India',
    venue: 'MMRDA Grounds',         capacity: 50000, tickets_sold: 47200,
    avg_ticket_price: 2800, total_revenue: 132160000,
    lat: 19.0760, lng: 72.8777, sponsors: ['JioSaavn', 'Pepsi'] },

  { id: 'c1b', artist: 'Arijit Singh', name: 'Arijit Singh Live 2023',
    date: '2023-11-10', city: 'Delhi',     state: 'Delhi',       country: 'India',
    venue: 'Jawaharlal Nehru Stadium', capacity: 60000, tickets_sold: 58000,
    avg_ticket_price: 2600, total_revenue: 150800000,
    lat: 28.7041, lng: 77.1025, sponsors: ['Spotify', 'Pepsi'] },

  { id: 'c1c', artist: 'Arijit Singh', name: 'Arijit Singh World Tour 2022',
    date: '2022-09-05', city: 'Bangalore', state: 'Karnataka',   country: 'India',
    venue: 'Palace Grounds',         capacity: 45000, tickets_sold: 39000,
    avg_ticket_price: 2400, total_revenue: 93600000,
    lat: 12.9716, lng: 77.5946, sponsors: ['JioSaavn'] },

  // ── Dua Lipa ──
  { id: 'c2',  artist: 'Dua Lipa', name: 'Future Nostalgia Tour 2024',
    date: '2024-11-20', city: 'Delhi',     state: 'Delhi',       country: 'India',
    venue: 'Jawaharlal Nehru Stadium', capacity: 75000, tickets_sold: 71000,
    avg_ticket_price: 5500, total_revenue: 390500000,
    lat: 28.7041, lng: 77.1025, sponsors: ['BookMyShow', 'Spotify'] },

  { id: 'c2b', artist: 'Dua Lipa', name: 'Radical Optimism Tour 2023',
    date: '2023-08-14', city: 'Mumbai',    state: 'Maharashtra', country: 'India',
    venue: 'DY Patil Stadium',       capacity: 55000, tickets_sold: 54000,
    avg_ticket_price: 5800, total_revenue: 313200000,
    lat: 19.0445, lng: 73.0169, sponsors: ['Visa', 'BookMyShow'] },

  { id: 'c2c', artist: 'Dua Lipa', name: 'Dua Lipa Live 2022',
    date: '2022-06-22', city: 'Bangalore', state: 'Karnataka',   country: 'India',
    venue: 'KTPO Convention Centre', capacity: 20000, tickets_sold: 19800,
    avg_ticket_price: 4800, total_revenue: 95040000,
    lat: 12.9716, lng: 77.5946, sponsors: ['Spotify'] },

  // ── AR Rahman ──
  { id: 'c3',  artist: 'AR Rahman', name: 'Symphony of Life 2024',
    date: '2024-10-05', city: 'Chennai',   state: 'Tamil Nadu',  country: 'India',
    venue: 'YMCA Grounds',           capacity: 30000, tickets_sold: 29800,
    avg_ticket_price: 3200, total_revenue: 95360000,
    lat: 13.0827, lng: 80.2707, sponsors: ['Amazon Music'] },

  { id: 'c3b', artist: 'AR Rahman', name: 'AR Rahman Live 2023',
    date: '2023-05-18', city: 'Mumbai',    state: 'Maharashtra', country: 'India',
    venue: 'MMRDA Grounds',          capacity: 40000, tickets_sold: 36000,
    avg_ticket_price: 3000, total_revenue: 108000000,
    lat: 19.0760, lng: 72.8777, sponsors: ['Amazon Music', 'JioSaavn'] },

  { id: 'c3c', artist: 'AR Rahman', name: 'Netru Indru 2022',
    date: '2022-03-12', city: 'Hyderabad', state: 'Telangana',   country: 'India',
    venue: 'GMC Balayogi Stadium',   capacity: 35000, tickets_sold: 28000,
    avg_ticket_price: 2800, total_revenue: 78400000,
    lat: 17.4065, lng: 78.4772, sponsors: ['Sun TV'] },

  // ── The Weeknd ──
  { id: 'c4',  artist: 'The Weeknd', name: 'After Hours Tour 2024',
    date: '2024-09-14', city: 'Bangalore', state: 'Karnataka',   country: 'India',
    venue: 'Palace Grounds',         capacity: 40000, tickets_sold: 38500,
    avg_ticket_price: 6000, total_revenue: 231000000,
    lat: 12.9716, lng: 77.5946, sponsors: ['Red Bull', 'Apple Music'] },

  { id: 'c4b', artist: 'The Weeknd', name: 'Starboy Tour 2023',
    date: '2023-07-29', city: 'Mumbai',    state: 'Maharashtra', country: 'India',
    venue: 'DY Patil Stadium',       capacity: 55000, tickets_sold: 52000,
    avg_ticket_price: 6500, total_revenue: 338000000,
    lat: 19.0445, lng: 73.0169, sponsors: ['Red Bull', 'Pepsi'] },

  { id: 'c4c', artist: 'The Weeknd', name: 'The Weeknd Live 2022',
    date: '2022-11-03', city: 'Delhi',     state: 'Delhi',       country: 'India',
    venue: 'Jawaharlal Nehru Stadium', capacity: 75000, tickets_sold: 68000,
    avg_ticket_price: 5500, total_revenue: 374000000,
    lat: 28.7041, lng: 77.1025, sponsors: ['Apple Music'] },

  // ── Shreya Ghoshal ──
  { id: 'c5',  artist: 'Shreya Ghoshal', name: 'Shreya Live 2024',
    date: '2024-08-22', city: 'Kolkata',   state: 'West Bengal', country: 'India',
    venue: 'Netaji Indoor Stadium',  capacity: 12000, tickets_sold: 11800,
    avg_ticket_price: 1800, total_revenue: 21240000,
    lat: 22.5726, lng: 88.3639, sponsors: ['Saregama'] },

  { id: 'c5b', artist: 'Shreya Ghoshal', name: 'Shreya Unplugged 2023',
    date: '2023-02-14', city: 'Pune',      state: 'Maharashtra', country: 'India',
    venue: 'Balewadi Stadium',       capacity: 15000, tickets_sold: 14200,
    avg_ticket_price: 1600, total_revenue: 22720000,
    lat: 18.5912, lng: 73.7790, sponsors: ['Saregama', 'Zee Music'] },

  { id: 'c5c', artist: 'Shreya Ghoshal', name: 'Shreya Golden Hits 2022',
    date: '2022-12-20', city: 'Chennai',   state: 'Tamil Nadu',  country: 'India',
    venue: 'YMCA Grounds',           capacity: 18000, tickets_sold: 15500,
    avg_ticket_price: 1500, total_revenue: 23250000,
    lat: 13.0827, lng: 80.2707, sponsors: ['Sun Music'] },

  // ── Ed Sheeran ──
  { id: 'c6',  artist: 'Ed Sheeran', name: 'Mathematics Tour 2024',
    date: '2024-07-10', city: 'Mumbai',    state: 'Maharashtra', country: 'India',
    venue: 'DY Patil Stadium',       capacity: 55000, tickets_sold: 55000,
    avg_ticket_price: 7500, total_revenue: 412500000,
    lat: 19.0445, lng: 73.0169, sponsors: ['Visa', 'JBL', 'BookMyShow'] },

  { id: 'c6b', artist: 'Ed Sheeran', name: 'Divide Tour 2023',
    date: '2023-03-11', city: 'Delhi',     state: 'Delhi',       country: 'India',
    venue: 'Jawaharlal Nehru Stadium', capacity: 75000, tickets_sold: 75000,
    avg_ticket_price: 7000, total_revenue: 525000000,
    lat: 28.7041, lng: 77.1025, sponsors: ['Visa', 'Heineken', 'BookMyShow'] },

  { id: 'c6c', artist: 'Ed Sheeran', name: 'Equals Tour 2022',
    date: '2022-05-25', city: 'Bangalore', state: 'Karnataka',   country: 'India',
    venue: 'Palace Grounds',         capacity: 40000, tickets_sold: 38800,
    avg_ticket_price: 6500, total_revenue: 252200000,
    lat: 12.9716, lng: 77.5946, sponsors: ['JBL', 'Visa'] },
]

export const mockFollowerTrends = [
  { date: 'Jan', instagram: 7200000, youtube: 10800000, spotify: 5200000 },
  { date: 'Feb', instagram: 7400000, youtube: 11000000, spotify: 5400000 },
  { date: 'Mar', instagram: 7600000, youtube: 11300000, spotify: 5500000 },
  { date: 'Apr', instagram: 7700000, youtube: 11500000, spotify: 5650000 },
  { date: 'May', instagram: 7900000, youtube: 11800000, spotify: 5700000 },
  { date: 'Jun', instagram: 8000000, youtube: 12000000, spotify: 5850000 },
  { date: 'Jul', instagram: 8050000, youtube: 12100000, spotify: 5900000 },
  { date: 'Aug', instagram: 8100000, youtube: 12200000, spotify: 6000000 },
  { date: 'Sep', instagram: 8120000, youtube: 12250000, spotify: 6020000 },
  { date: 'Oct', instagram: 8150000, youtube: 12300000, spotify: 6050000 },
  { date: 'Nov', instagram: 8180000, youtube: 12350000, spotify: 6080000 },
  { date: 'Dec', instagram: 8200000, youtube: 12400000, spotify: 6100000 },
]

export const mockAgeData = [
  { name: '13–17', value: 12 },
  { name: '18–24', value: 34 },
  { name: '25–34', value: 28 },
  { name: '35–44', value: 16 },
  { name: '45+',   value: 10 },
]

export const mockGenderData = [
  { name: 'Male',       value: 54 },
  { name: 'Female',     value: 42 },
  { name: 'Non-binary', value: 4  },
]

export const mockGenreData = [
  { genre: 'Bollywood',        streams: 4200000 },
  { genre: 'Pop',              streams: 3800000 },
  { genre: 'R&B',              streams: 2900000 },
  { genre: 'Classical/Fusion', streams: 1800000 },
  { genre: 'Hip-Hop',          streams: 1600000 },
  { genre: 'Electronic',       streams: 1100000 },
]

export const mockKpis = {
  totalArtists:   6,
  totalConcerts:  18,
  ticketsSoldYTD: 253300,
  revenueYTD:     1282760000,
  avgRoG:         1.6,
}