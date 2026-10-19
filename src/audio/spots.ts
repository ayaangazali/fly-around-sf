export type SpotWhen = 'always' | 'fog' | 'day' | 'awake' | 'clock';

export interface SoundSpot {
  id: string;
  name: string;
  icon: string;
  hear: string;
  fact: string;
  sources: string[];
  at?: [number, number];
  lines?: [number, number][][];
  alt: number;
  radius: number;
  ref: number;
  gain: number;
  when: SpotWhen;
}

const CABLE_LINES: [number, number][][] = [
  [[37.78489, -122.40773], [37.79198, -122.40915], [37.79517, -122.4098], [37.7956, -122.41003], [37.79544, -122.41136]],
  [[37.79371, -122.39622], [37.79186, -122.41076], [37.79104, -122.41717], [37.79046, -122.42184]],
  [[37.79544, -122.41136], [37.7963, -122.41171], [37.80215, -122.4129], [37.80361, -122.41483], [37.80488, -122.41513]],
  [[37.79544, -122.41136], [37.7954, -122.41165], [37.7946, -122.418], [37.7964, -122.41848], [37.80655, -122.42053]],
];

const WATERFRONT: [number, number][] = [
  [37.77661, -122.38731], [37.7783, -122.38746], [37.78146, -122.38775], [37.78289, -122.38788], [37.78546, -122.38763],
  [37.78725, -122.38744], [37.78974, -122.38831], [37.7966, -122.39471], [37.79801, -122.39291], [37.79985, -122.39767],
  [37.80148, -122.39573], [37.80218, -122.39974], [37.80348, -122.39754], [37.80459, -122.39853], [37.80728, -122.40044],
  [37.80783, -122.40236], [37.80889, -122.40438], [37.81004, -122.40616], [37.81143, -122.41044], [37.8094, -122.4119],
  [37.8115, -122.42041], [37.80921, -122.41831], [37.81025, -122.42283], [37.80664, -122.42468], [37.80817, -122.42653],
  [37.80923, -122.43018], [37.80904, -122.43169], [37.8056, -122.43362], [37.80756, -122.43588], [37.80537, -122.44717],
  [37.80885, -122.44003], [37.80555, -122.45435], [37.80508, -122.46303], [37.80576, -122.46604],
];

const OCEAN_BEACH: [number, number][] = [[37.77571, -122.51315], [37.76977, -122.51226], [37.76367, -122.51202], [37.73395, -122.50778]];

export const SPOTS: SoundSpot[] = [
  {
    id: 'ggb-south-horn',
    name: 'Golden Gate foghorn, south tower',
    icon: '📯',
    hear: 'One deep two-second note every 20 seconds, only when thick fog rolls under the bridge.',
    fact: 'Two horns on the south tower pier, about 40 feet above the water, sound together as one low tone. Together the bridge horns run about two and a half hours a day on average.',
    sources: ['https://www.goldengate.org/bridge/history-research/bridge-features/foghorns-beacons/', 'https://navcen.uscg.gov/sites/default/files/pdf/lightLists/LightList_V6_2025.pdf', 'https://www.openstreetmap.org/way/1330586852'],
    at: [37.814333, -122.477739],
    alt: 12,
    radius: 5000,
    ref: 220,
    gain: 1,
    when: 'fog',
  },
  {
    id: 'ggb-midspan-horn',
    name: 'Golden Gate foghorns, mid-span',
    icon: '📯',
    hear: 'Two higher one-second blasts in two different tones, then a long 36-second pause, in thick fog.',
    fact: 'Three horns hang below the roadway at mid-span, and the lower of the two tones points west. On foggy summer days they can sound for more than five hours.',
    sources: ['https://www.goldengate.org/bridge/history-research/bridge-features/foghorns-beacons/', 'https://navcen.uscg.gov/sites/default/files/pdf/lightLists/LightList_V6_2025.pdf'],
    at: [37.8197535, -122.478572],
    alt: 60,
    radius: 5000,
    ref: 220,
    gain: 0.85,
    when: 'fog',
  },
  {
    id: 'alcatraz-horn',
    name: 'Alcatraz north foghorn',
    icon: '📯',
    hear: 'Two two-second blasts every 30 seconds from the north end of the island when the fog is thick.',
    fact: 'Each Coast Guard foghorn in the bay has its own pattern so sailors can tell them apart blind. Boaters can switch this one on themselves by keying VHF channel 81A five times within 10 seconds.',
    sources: ['https://navcen.uscg.gov/sites/default/files/pdf/lightLists/LightList_V6_2025.pdf', 'https://www.kqed.org/news/11272504/foghorns-who-presses-the-play-button'],
    at: [37.828128, -122.425512],
    alt: 10,
    radius: 4200,
    ref: 180,
    gain: 0.8,
    when: 'fog',
  },
  {
    id: 'cable-car-bells',
    name: 'Cable car bells',
    icon: '🔔',
    hear: 'Crews ringing their bells and the cable humming in its slot along the Powell, Mason, Hyde and California lines, 7 AM to 11 PM.',
    fact: 'The cars have no motors. Each one grips a steel cable that runs under the street at a constant 9.5 mph, and every July the crews compete in a bell ringing contest in Union Square.',
    sources: ['https://en.wikipedia.org/wiki/San_Francisco_cable_car_system', 'https://www.sfmta.com/stops/powell-st-market-st-16063', 'https://www.openstreetmap.org/relation/1959009', 'https://www.openstreetmap.org/relation/1959010', 'https://www.openstreetmap.org/relation/2852264'],
    lines: CABLE_LINES,
    alt: 3,
    radius: 320,
    ref: 22,
    gain: 0.9,
    when: 'awake',
  },
  {
    id: 'pier-39-sea-lions',
    name: 'Pier 39 sea lions',
    icon: '🦭',
    hear: 'Barking, grumbling California sea lions on the floating docks, day and night.',
    fact: 'Sea lions first hauled out on the Pier 39 docks in September 1989. As many as 1,700 were counted at once during Thanksgiving week of 2009.',
    sources: ['https://en.wikipedia.org/wiki/Pier_39', 'https://www.openstreetmap.org/node/1417635914'],
    at: [37.810636, -122.41158],
    alt: 2,
    radius: 700,
    ref: 35,
    gain: 1,
    when: 'always',
  },
  {
    id: 'waterfront-gulls',
    name: 'Waterfront gulls',
    icon: '🐦',
    hear: 'Gulls calling along the shore from China Basin to Crissy Field while the sun is up.',
    fact: 'The Western gull is the most common bird on Alcatraz, just across the water from the piers.',
    sources: ['https://www.nps.gov/alca/learn/nature/waterbirds.htm', 'https://www.openstreetmap.org/wiki/Coastline'],
    lines: [WATERFRONT],
    alt: 12,
    radius: 420,
    ref: 30,
    gain: 0.8,
    when: 'day',
  },
  {
    id: 'ocean-beach-surf',
    name: 'Ocean Beach surf',
    icon: '🌊',
    hear: 'Pacific breakers rolling in and washing up the sand.',
    fact: 'Ocean Beach runs 3.5 miles along the Pacific. Rip currents and sneaker waves make the water dangerous even for waders.',
    sources: ['https://en.wikipedia.org/wiki/Ocean_Beach,_San_Francisco', 'https://www.openstreetmap.org/wiki/Coastline'],
    lines: [OCEAN_BEACH],
    alt: 2,
    radius: 900,
    ref: 60,
    gain: 1,
    when: 'always',
  },
  {
    id: 'oracle-park-crowd',
    name: 'Oracle Park crowd',
    icon: '⚾',
    hear: 'The murmur of the ballpark and the odd cheer, from morning until late evening.',
    fact: 'Oracle Park seats 41,331 for baseball, right on the edge of the bay.',
    sources: ['https://en.wikipedia.org/wiki/Oracle_Park', 'https://www.openstreetmap.org/relation/7325085'],
    at: [37.778628, -122.389799],
    alt: 15,
    radius: 800,
    ref: 90,
    gain: 0.9,
    when: 'awake',
  },
  {
    id: 'ferry-building-clock',
    name: 'Ferry Building clock',
    icon: '🕰️',
    hear: 'The Westminster Quarters and the hour struck on the real San Francisco hour, in daylight.',
    fact: 'The 245-foot tower has four clock faces, each 22 feet across. On the hour during daylight it chimes part of the Westminster Quarters.',
    sources: ['https://en.wikipedia.org/wiki/San_Francisco_Ferry_Building', 'https://www.openstreetmap.org/way/558731934'],
    at: [37.795515, -122.393469],
    alt: 60,
    radius: 2500,
    ref: 140,
    gain: 1,
    when: 'clock',
  },
  {
    id: 'grace-cathedral-bells',
    name: 'Grace Cathedral carillon',
    icon: '⛪',
    hear: 'Grace Chimes, then the hour on the bourdon, from 9 AM to 6 PM, with the angelus on middle C at noon and 6 PM.',
    fact: '44 bronze bells cast in Croydon, England in 1937 and 1938, first heard at the 1939 World\'s Fair on Treasure Island. The 6-ton bourdon keeps humming for over a minute after the last stroke.',
    sources: ['https://gracecathedral.org/wp-content/uploads/2023/04/Cathedral-Bells-and-Specifications.pdf', 'https://www.openstreetmap.org/way/32946942'],
    at: [37.791852, -122.413502],
    alt: 50,
    radius: 2200,
    ref: 120,
    gain: 1,
    when: 'clock',
  },
];
