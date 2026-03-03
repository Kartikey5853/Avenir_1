export interface Area {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius: number; // in meters
  finalScore: number;
  scores: CategoryScores;
  facilities: Facility[];
}

export interface CategoryScores {
  transport: number;
  healthcare: number;
  education: number;
  lifestyle: number;
  grocery: number;
}

export interface Facility {
  name: string;
  type: 'transport' | 'hospital' | 'grocery' | 'restaurant' | 'school';
  lat: number;
  lng: number;
}

export interface RecentArea {
  area: string;
  finalScore: number;
  dateViewed: string;
}

export const areas: Area[] = [
  {
    id: 'hitec-city',
    name: 'HITEC City',
    lat: 17.4435,
    lng: 78.3772,
    radius: 2000,
    finalScore: 87,
    scores: { transport: 90, healthcare: 80, education: 75, lifestyle: 92, grocery: 85 },
    facilities: [
      { name: 'HITEC City Metro', type: 'transport', lat: 17.4475, lng: 78.3787 },
      { name: 'Raidurg Metro', type: 'transport', lat: 17.4385, lng: 78.3852 },
      { name: 'Apollo Hospital', type: 'hospital', lat: 17.4425, lng: 78.3802 },
      { name: 'Ratnadeep Supermarket', type: 'grocery', lat: 17.4445, lng: 78.3762 },
      { name: 'Ohris Restaurant', type: 'restaurant', lat: 17.4455, lng: 78.3742 },
      { name: 'DPS Hyderabad', type: 'school', lat: 17.4405, lng: 78.3722 },
    ],
  },
  {
    id: 'gachibowli',
    name: 'Gachibowli',
    lat: 17.4401,
    lng: 78.3489,
    radius: 2500,
    finalScore: 82,
    scores: { transport: 78, healthcare: 85, education: 88, lifestyle: 80, grocery: 79 },
    facilities: [
      { name: 'Gachibowli Bus Stop', type: 'transport', lat: 17.4411, lng: 78.3499 },
      { name: 'Continental Hospital', type: 'hospital', lat: 17.4391, lng: 78.3509 },
      { name: 'More Supermarket', type: 'grocery', lat: 17.4421, lng: 78.3479 },
      { name: 'Cafe Bahar', type: 'restaurant', lat: 17.4381, lng: 78.3469 },
      { name: 'Oakridge School', type: 'school', lat: 17.4371, lng: 78.3459 },
    ],
  },
  {
    id: 'banjara-hills',
    name: 'Banjara Hills',
    lat: 17.4156,
    lng: 78.4347,
    radius: 2000,
    finalScore: 91,
    scores: { transport: 85, healthcare: 95, education: 82, lifestyle: 96, grocery: 90 },
    facilities: [
      { name: 'Panjagutta Metro', type: 'transport', lat: 17.4176, lng: 78.4367 },
      { name: 'Care Hospital', type: 'hospital', lat: 17.4146, lng: 78.4357 },
      { name: 'Heritage Supermarket', type: 'grocery', lat: 17.4166, lng: 78.4337 },
      { name: 'Jewel of Nizam', type: 'restaurant', lat: 17.4136, lng: 78.4327 },
      { name: 'Chirec School', type: 'school', lat: 17.4186, lng: 78.4377 },
    ],
  },
  {
    id: 'madhapur',
    name: 'Madhapur',
    lat: 17.4483,
    lng: 78.3915,
    radius: 1800,
    finalScore: 85,
    scores: { transport: 88, healthcare: 78, education: 70, lifestyle: 90, grocery: 82 },
    facilities: [
      { name: 'Madhapur Bus Stop', type: 'transport', lat: 17.4493, lng: 78.3925 },
      { name: 'Medicover Hospital', type: 'hospital', lat: 17.4473, lng: 78.3935 },
      { name: 'D-Mart Madhapur', type: 'grocery', lat: 17.4503, lng: 78.3905 },
      { name: 'Barbeque Nation', type: 'restaurant', lat: 17.4463, lng: 78.3895 },
      { name: 'Jubilee Hills Public School', type: 'school', lat: 17.4453, lng: 78.3885 },
    ],
  },
  {
    id: 'kondapur',
    name: 'Kondapur',
    lat: 17.4600,
    lng: 78.3548,
    radius: 2200,
    finalScore: 79,
    scores: { transport: 75, healthcare: 82, education: 80, lifestyle: 76, grocery: 78 },
    facilities: [
      { name: 'Kondapur Bus Stop', type: 'transport', lat: 17.4610, lng: 78.3558 },
      { name: 'Sunshine Hospital', type: 'hospital', lat: 17.4590, lng: 78.3568 },
      { name: 'BigBasket Hub', type: 'grocery', lat: 17.4620, lng: 78.3538 },
      { name: 'Spice 6', type: 'restaurant', lat: 17.4580, lng: 78.3528 },
      { name: 'Silver Oaks School', type: 'school', lat: 17.4570, lng: 78.3518 },
    ],
  },
  {
    id: 'jubilee-hills',
    name: 'Jubilee Hills',
    lat: 17.4312,
    lng: 78.4071,
    radius: 2000,
    finalScore: 93,
    scores: { transport: 82, healthcare: 92, education: 90, lifestyle: 98, grocery: 88 },
    facilities: [
      { name: 'Jubilee Hills Check Post', type: 'transport', lat: 17.4322, lng: 78.4081 },
      { name: 'KIMS Hospital', type: 'hospital', lat: 17.4302, lng: 78.4091 },
      { name: 'Spar Hypermarket', type: 'grocery', lat: 17.4332, lng: 78.4061 },
      { name: 'Taj Deccan', type: 'restaurant', lat: 17.4292, lng: 78.4051 },
      { name: 'NASR School', type: 'school', lat: 17.4342, lng: 78.4101 },
    ],
  },
];

export const recentAreas: RecentArea[] = [
  { area: 'Jubilee Hills', finalScore: 93, dateViewed: '2026-02-15' },
  { area: 'HITEC City', finalScore: 87, dateViewed: '2026-02-14' },
  { area: 'Banjara Hills', finalScore: 91, dateViewed: '2026-02-13' },
  { area: 'Madhapur', finalScore: 85, dateViewed: '2026-02-12' },
  { area: 'Gachibowli', finalScore: 82, dateViewed: '2026-02-10' },
];

export const facilityCounts = areas.map((a) => ({
  area: a.name,
  hospitals: a.facilities.filter((f) => f.type === 'hospital').length,
  schools: a.facilities.filter((f) => f.type === 'school').length,
  transport: a.facilities.filter((f) => f.type === 'transport').length,
  grocery: a.facilities.filter((f) => f.type === 'grocery').length,
  restaurants: a.facilities.filter((f) => f.type === 'restaurant').length,
}));

export const defaultWeights = {
  transport: 50,
  healthcare: 50,
  education: 50,
  lifestyle: 50,
  grocery: 50,
};
