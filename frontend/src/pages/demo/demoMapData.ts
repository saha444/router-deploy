/**
 * Meridian City — a fictional city for demo/showcase purposes.
 * Contains all static geometry and pre-built route data for the self-contained demo map.
 *
 * ViewBox: 0 0 1400 900
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface DemoNode {
  id: number;
  x: number;
  y: number;
  name: string;
  district: string;
}

export interface DemoRoad {
  id: string;
  from: number;
  to: number;
  type: 'highway' | 'arterial' | 'collector' | 'local';
  name: string;
}

export interface DemoDistrict {
  name: string;
  labelX: number;
  labelY: number;
  bounds: { x: number; y: number; w: number; h: number };
  darkFill: string;
  lightFill: string;
}

export interface DemoPresetRoute {
  vehicleIdx: number;
  vehicleName: string;
  path: number[]; // node IDs in visit order (first & last = depot)
  stops: number[]; // node IDs that are delivery stops (subset of path)
}

export interface DemoPresetData {
  depotNodeId: number;
  fleet: { name: string; capacity: number; currentWeight: number }[];
  routes: DemoPresetRoute[];
}

// ─── Intersection Nodes ────────────────────────────────────────────────────────

export const DEMO_NODES: DemoNode[] = [
  // ── Ring Road (outer boundary) ──
  { id: 1,  x: 100,  y: 80,   name: 'NW Interchange',   district: 'Ring Road' },
  { id: 2,  x: 460,  y: 60,   name: 'North Gate',       district: 'Ring Road' },
  { id: 3,  x: 820,  y: 55,   name: 'NE Ramp',          district: 'Ring Road' },
  { id: 4,  x: 1150, y: 75,   name: 'East Entry',       district: 'Ring Road' },
  { id: 5,  x: 1320, y: 200,  name: 'East Gate',        district: 'Ring Road' },
  { id: 6,  x: 1320, y: 480,  name: 'SE Interchange',   district: 'Ring Road' },
  { id: 7,  x: 1320, y: 740,  name: 'South Gate E',     district: 'Ring Road' },
  { id: 8,  x: 960,  y: 820,  name: 'South Central',    district: 'Ring Road' },
  { id: 9,  x: 580,  y: 830,  name: 'South Gate W',     district: 'Ring Road' },
  { id: 10, x: 100,  y: 780,  name: 'SW Interchange',   district: 'Ring Road' },
  { id: 11, x: 80,   y: 520,  name: 'West Gate S',      district: 'Ring Road' },
  { id: 12, x: 80,   y: 280,  name: 'West Gate N',      district: 'Ring Road' },

  // ── Residential Heights (NW) ──
  { id: 13, x: 220,  y: 170,  name: 'Hilltop Drive',    district: 'Residential Heights' },
  { id: 14, x: 380,  y: 175,  name: 'Maple Avenue',     district: 'Residential Heights' },
  { id: 15, x: 220,  y: 300,  name: 'Cedar Lane',       district: 'Residential Heights' },
  { id: 16, x: 380,  y: 290,  name: 'Oak Street',       district: 'Residential Heights' },

  // ── Downtown Core ──
  { id: 17, x: 530,  y: 250,  name: 'Central Station',  district: 'Downtown' },
  { id: 18, x: 680,  y: 240,  name: 'Market Square',    district: 'Downtown' },
  { id: 19, x: 530,  y: 380,  name: 'Commerce Ave',     district: 'Downtown' },
  { id: 20, x: 680,  y: 370,  name: 'Grand Plaza',      district: 'Downtown' },
  { id: 21, x: 830,  y: 260,  name: 'City Hall',        district: 'Downtown' },
  { id: 22, x: 830,  y: 390,  name: 'Convention Ctr',   district: 'Downtown' },

  // ── University Quarter (NE) ──
  { id: 23, x: 980,  y: 180,  name: 'North Campus',     district: 'University Quarter' },
  { id: 24, x: 1130, y: 190,  name: 'Science Block',    district: 'University Quarter' },
  { id: 25, x: 980,  y: 320,  name: 'Library Junction', district: 'University Quarter' },
  { id: 26, x: 1130, y: 330,  name: 'Research Park',    district: 'University Quarter' },

  // ── Industrial Zone (W) ──
  { id: 27, x: 200,  y: 450,  name: 'Factory Gate',     district: 'Industrial Zone' },
  { id: 28, x: 370,  y: 440,  name: 'Warehouse Row',    district: 'Industrial Zone' },
  { id: 29, x: 200,  y: 580,  name: 'Loading Bay',      district: 'Industrial Zone' },

  // ── Tech Park (E) ──
  { id: 30, x: 1100, y: 470,  name: 'Innovation Hub',   district: 'Tech Park' },
  { id: 31, x: 1100, y: 600,  name: 'Data Center',      district: 'Tech Park' },

  // ── Old Quarter (S-center) ──
  { id: 32, x: 530,  y: 530,  name: 'Heritage Lane',    district: 'Old Quarter' },
  { id: 33, x: 680,  y: 520,  name: 'Museum Circle',    district: 'Old Quarter' },

  // ── Harbour Front (S) ──
  { id: 34, x: 530,  y: 660,  name: 'Harbour Gate',     district: 'Harbour Front' },
  { id: 35, x: 680,  y: 650,  name: 'Dock Street',      district: 'Harbour Front' },

  // ── Marina District (SE) ──
  { id: 36, x: 880,  y: 540,  name: 'Marina Bay',       district: 'Marina District' },
  { id: 37, x: 880,  y: 680,  name: 'Coastal Drive',    district: 'Marina District' },
  { id: 38, x: 1050, y: 700,  name: 'Sunset Point',     district: 'Marina District' },
];

// Helper lookup
export const nodeById = (id: number): DemoNode | undefined =>
  DEMO_NODES.find((n) => n.id === id);

// ─── Road Segments ─────────────────────────────────────────────────────────────

export const DEMO_ROADS: DemoRoad[] = [
  // ═══ RING ROAD (Highway) ═══
  { id: 'h01', from: 1,  to: 2,  type: 'highway',  name: 'Northern Bypass' },
  { id: 'h02', from: 2,  to: 3,  type: 'highway',  name: 'Northern Bypass' },
  { id: 'h03', from: 3,  to: 4,  type: 'highway',  name: 'Northern Bypass' },
  { id: 'h04', from: 4,  to: 5,  type: 'highway',  name: 'Eastern Expwy' },
  { id: 'h05', from: 5,  to: 6,  type: 'highway',  name: 'Eastern Expwy' },
  { id: 'h06', from: 6,  to: 7,  type: 'highway',  name: 'Eastern Expwy' },
  { id: 'h07', from: 7,  to: 8,  type: 'highway',  name: 'Southern Bypass' },
  { id: 'h08', from: 8,  to: 9,  type: 'highway',  name: 'Southern Bypass' },
  { id: 'h09', from: 9,  to: 10, type: 'highway',  name: 'Southern Bypass' },
  { id: 'h10', from: 10, to: 11, type: 'highway',  name: 'Western Freeway' },
  { id: 'h11', from: 11, to: 12, type: 'highway',  name: 'Western Freeway' },
  { id: 'h12', from: 12, to: 1,  type: 'highway',  name: 'Western Freeway' },

  // ═══ ARTERIALS — East-West ═══
  { id: 'a01', from: 12, to: 15, type: 'arterial', name: 'Elm Boulevard' },
  { id: 'a02', from: 15, to: 16, type: 'arterial', name: 'Elm Boulevard' },
  { id: 'a03', from: 16, to: 17, type: 'arterial', name: 'King Street' },
  { id: 'a04', from: 17, to: 18, type: 'arterial', name: 'King Street' },
  { id: 'a05', from: 18, to: 21, type: 'arterial', name: 'King Street' },
  { id: 'a06', from: 21, to: 25, type: 'arterial', name: 'University Ave' },
  { id: 'a07', from: 25, to: 26, type: 'arterial', name: 'University Ave' },
  { id: 'a08', from: 26, to: 5,  type: 'arterial', name: 'University Ave' },

  { id: 'a09', from: 11, to: 27, type: 'arterial', name: 'Industrial Blvd' },
  { id: 'a10', from: 27, to: 28, type: 'arterial', name: 'Industrial Blvd' },
  { id: 'a11', from: 28, to: 19, type: 'arterial', name: 'Central Blvd' },
  { id: 'a12', from: 19, to: 20, type: 'arterial', name: 'Central Blvd' },
  { id: 'a13', from: 20, to: 22, type: 'arterial', name: 'Central Blvd' },
  { id: 'a14', from: 22, to: 30, type: 'arterial', name: 'Tech Corridor' },
  { id: 'a15', from: 30, to: 6,  type: 'arterial', name: 'Tech Corridor' },

  { id: 'a16', from: 29, to: 32, type: 'arterial', name: 'Heritage Road' },
  { id: 'a17', from: 32, to: 33, type: 'arterial', name: 'Heritage Road' },
  { id: 'a18', from: 33, to: 36, type: 'arterial', name: 'Marina Drive' },
  { id: 'a19', from: 36, to: 31, type: 'arterial', name: 'Marina Drive' },

  { id: 'a20', from: 34, to: 35, type: 'arterial', name: 'Harbour Road' },
  { id: 'a21', from: 35, to: 37, type: 'arterial', name: 'Coastal Hwy' },
  { id: 'a22', from: 37, to: 38, type: 'arterial', name: 'Coastal Hwy' },
  { id: 'a23', from: 38, to: 7,  type: 'arterial', name: 'Coastal Hwy' },

  // ═══ ARTERIALS — North-South ═══
  { id: 'a24', from: 1,  to: 13, type: 'arterial', name: 'Hillside Road' },
  { id: 'a25', from: 13, to: 15, type: 'arterial', name: 'Hillside Road' },

  { id: 'a26', from: 2,  to: 14, type: 'arterial', name: 'Queens Road' },
  { id: 'a27', from: 14, to: 16, type: 'arterial', name: 'Queens Road' },
  { id: 'a28', from: 16, to: 28, type: 'arterial', name: 'Queens Road' },

  { id: 'a29', from: 2,  to: 17, type: 'arterial', name: 'Main Street' },
  { id: 'a30', from: 17, to: 19, type: 'arterial', name: 'Main Street' },
  { id: 'a31', from: 19, to: 32, type: 'arterial', name: 'Main Street' },
  { id: 'a32', from: 32, to: 34, type: 'arterial', name: 'Main Street' },
  { id: 'a33', from: 34, to: 9,  type: 'arterial', name: 'Main Street' },

  { id: 'a34', from: 3,  to: 21, type: 'arterial', name: 'Parliament Rd' },
  { id: 'a35', from: 18, to: 20, type: 'arterial', name: 'Grand Ave' },
  { id: 'a36', from: 20, to: 33, type: 'arterial', name: 'Grand Ave' },
  { id: 'a37', from: 33, to: 35, type: 'arterial', name: 'Grand Ave' },
  { id: 'a38', from: 35, to: 8,  type: 'arterial', name: 'Grand Ave' },

  { id: 'a39', from: 4,  to: 24, type: 'arterial', name: 'Academy Lane' },
  { id: 'a40', from: 23, to: 25, type: 'arterial', name: 'Campus Drive' },
  { id: 'a41', from: 24, to: 26, type: 'arterial', name: 'Research Way' },

  { id: 'a42', from: 30, to: 31, type: 'arterial', name: 'Innovation Way' },
  { id: 'a43', from: 31, to: 38, type: 'arterial', name: 'Sunset Blvd' },

  // ═══ COLLECTORS (cross-connections for alternative routes) ═══
  { id: 'c01', from: 13, to: 14, type: 'collector', name: 'Birch Lane' },
  { id: 'c02', from: 15, to: 27, type: 'collector', name: 'Mill Road' },
  { id: 'c03', from: 27, to: 29, type: 'collector', name: 'Foundry St' },
  { id: 'c04', from: 29, to: 10, type: 'collector', name: 'River Road' },
  { id: 'c05', from: 17, to: 20, type: 'collector', name: 'Cross Street' },  // diagonal downtown
  { id: 'c06', from: 18, to: 22, type: 'collector', name: 'Park Lane' },     // diagonal downtown
  { id: 'c07', from: 21, to: 22, type: 'collector', name: 'Church Street' },
  { id: 'c08', from: 3,  to: 23, type: 'collector', name: 'Scholar Way' },
  { id: 'c09', from: 23, to: 24, type: 'collector', name: 'Faculty Road' },
  { id: 'c10', from: 25, to: 22, type: 'collector', name: 'Bridge Street' },
  { id: 'c11', from: 22, to: 36, type: 'collector', name: 'Promenade' },
  { id: 'c12', from: 36, to: 37, type: 'collector', name: 'Bay Road' },
  { id: 'c13', from: 33, to: 37, type: 'collector', name: 'Quay Street' },   // diagonal
  { id: 'c14', from: 32, to: 29, type: 'collector', name: 'Canal Path' },
  { id: 'c15', from: 34, to: 37, type: 'collector', name: 'Shore Lane' },    // diagonal
  { id: 'c16', from: 28, to: 32, type: 'collector', name: 'Trade Route' },   // diagonal
  { id: 'c17', from: 14, to: 17, type: 'collector', name: 'Station Rd' },    // diagonal

  // ═══ LOCAL ROADS (for density) ═══
  { id: 'l01', from: 13, to: 16, type: 'local', name: 'Willow Way' },    // diagonal residential
  { id: 'l02', from: 14, to: 15, type: 'local', name: 'Ash Close' },     // diagonal residential
  { id: 'l03', from: 26, to: 30, type: 'local', name: 'Lab Connector' },
  { id: 'l04', from: 36, to: 38, type: 'local', name: 'Pier Road' },     // diagonal marina
  { id: 'l05', from: 28, to: 20, type: 'local', name: 'Market Path' },   // diagonal
  { id: 'l06', from: 11, to: 29, type: 'local', name: 'Dock Link' },
];

// ─── Districts ─────────────────────────────────────────────────────────────────

export const DEMO_DISTRICTS: DemoDistrict[] = [
  {
    name: 'Residential Heights',
    labelX: 260, labelY: 205,
    bounds: { x: 130, y: 120, w: 310, h: 230 },
    darkFill: 'rgba(34,197,94,0.04)',
    lightFill: 'rgba(34,197,94,0.06)',
  },
  {
    name: 'Downtown',
    labelX: 660, labelY: 290,
    bounds: { x: 480, y: 200, w: 400, h: 240 },
    darkFill: 'rgba(99,102,241,0.05)',
    lightFill: 'rgba(99,102,241,0.06)',
  },
  {
    name: 'University Quarter',
    labelX: 1040, labelY: 225,
    bounds: { x: 920, y: 130, w: 280, h: 250 },
    darkFill: 'rgba(245,158,11,0.04)',
    lightFill: 'rgba(245,158,11,0.06)',
  },
  {
    name: 'Industrial Zone',
    labelX: 240, labelY: 490,
    bounds: { x: 110, y: 390, w: 310, h: 240 },
    darkFill: 'rgba(161,161,170,0.04)',
    lightFill: 'rgba(161,161,170,0.06)',
  },
  {
    name: 'Tech Park',
    labelX: 1100, labelY: 510,
    bounds: { x: 1030, y: 420, w: 240, h: 230 },
    darkFill: 'rgba(6,182,212,0.05)',
    lightFill: 'rgba(6,182,212,0.06)',
  },
  {
    name: 'Old Quarter',
    labelX: 600, labelY: 508,
    bounds: { x: 470, y: 470, w: 280, h: 130 },
    darkFill: 'rgba(217,119,6,0.04)',
    lightFill: 'rgba(217,119,6,0.05)',
  },
  {
    name: 'Harbour Front',
    labelX: 590, labelY: 640,
    bounds: { x: 470, y: 600, w: 280, h: 130 },
    darkFill: 'rgba(59,130,246,0.04)',
    lightFill: 'rgba(59,130,246,0.05)',
  },
  {
    name: 'Marina District',
    labelX: 940, labelY: 600,
    bounds: { x: 810, y: 490, w: 310, h: 260 },
    darkFill: 'rgba(139,92,246,0.04)',
    lightFill: 'rgba(139,92,246,0.05)',
  },
];

// ─── River Path (SVG d attribute) ──────────────────────────────────────────────

export const RIVER_PATH =
  'M 0,220 Q 150,180 300,280 Q 450,380 550,400 Q 680,430 800,460 Q 950,500 1100,550 Q 1250,600 1400,660';

// ─── Parks ─────────────────────────────────────────────────────────────────────

export const DEMO_PARKS = [
  { x: 600, y: 435, w: 170, h: 60, name: 'Meridian Park' },
  { x: 880, y: 160, w: 60, h: 80, name: 'Campus Green' },
  { x: 300, y: 600, w: 100, h: 60, name: 'Riverside Park' },
];

// ─── Road style helpers ────────────────────────────────────────────────────────

export const ROAD_STYLES: Record<DemoRoad['type'], { width: number; darkColor: string; lightColor: string }> = {
  highway:   { width: 5,   darkColor: '#3a3a58', lightColor: '#b0b0c0' },
  arterial:  { width: 3,   darkColor: '#2a2a42', lightColor: '#c0c0d0' },
  collector: { width: 2,   darkColor: '#222238', lightColor: '#d0d0dd' },
  local:     { width: 1.5, darkColor: '#1c1c30', lightColor: '#d8d8e2' },
};

// ─── Pre-built Demo Preset Scenarios ───────────────────────────────────────────

export const DEMO_PRESET_SCENARIOS: Record<string, DemoPresetData> = {
  urban_delivery: {
    depotNodeId: 20,
    fleet: [
      { name: 'Van Alpha',   capacity: 500, currentWeight: 400 },
      { name: 'Van Beta',    capacity: 500, currentWeight: 350 },
      { name: 'Van Gamma',   capacity: 400, currentWeight: 300 },
      { name: 'Van Delta',   capacity: 400, currentWeight: 280 },
      { name: 'Van Echo',    capacity: 300, currentWeight: 200 },
    ],
    routes: [
      { vehicleIdx: 0, vehicleName: 'Van Alpha',
        path: [20, 19, 28, 16, 14, 13, 15, 27, 28, 19, 20],
        stops: [28, 16, 14, 13, 15] },
      { vehicleIdx: 1, vehicleName: 'Van Beta',
        path: [20, 18, 21, 25, 23, 24, 26, 25, 21, 18, 20],
        stops: [21, 25, 23, 24, 26] },
      { vehicleIdx: 2, vehicleName: 'Van Gamma',
        path: [20, 22, 36, 37, 38, 31, 30, 22, 20],
        stops: [36, 37, 38, 31, 30] },
      { vehicleIdx: 3, vehicleName: 'Van Delta',
        path: [20, 33, 35, 34, 32, 29, 32, 19, 20],
        stops: [33, 35, 34, 32, 29] },
      { vehicleIdx: 4, vehicleName: 'Van Echo',
        path: [20, 17, 16, 14, 2, 14, 16, 17, 20],
        stops: [17, 16, 14, 2] },
    ],
  },

  peakhour_logistics: {
    depotNodeId: 20,
    fleet: [
      { name: 'Truck 01', capacity: 800, currentWeight: 700 },
      { name: 'Truck 02', capacity: 800, currentWeight: 650 },
      { name: 'Truck 03', capacity: 600, currentWeight: 500 },
      { name: 'Truck 04', capacity: 600, currentWeight: 480 },
      { name: 'Truck 05', capacity: 500, currentWeight: 400 },
      { name: 'Truck 06', capacity: 500, currentWeight: 380 },
      { name: 'Truck 07', capacity: 400, currentWeight: 300 },
      { name: 'Truck 08', capacity: 400, currentWeight: 250 },
    ],
    routes: [
      { vehicleIdx: 0, vehicleName: 'Truck 01',
        path: [20, 19, 28, 27, 15, 13, 1, 13, 15, 27, 28, 19, 20],
        stops: [19, 28, 27, 15, 13] },
      { vehicleIdx: 1, vehicleName: 'Truck 02',
        path: [20, 18, 17, 16, 14, 2, 3, 21, 18, 20],
        stops: [18, 17, 16, 14, 2, 3] },
      { vehicleIdx: 2, vehicleName: 'Truck 03',
        path: [20, 22, 25, 23, 24, 26, 5, 26, 25, 22, 20],
        stops: [22, 25, 23, 24, 26] },
      { vehicleIdx: 3, vehicleName: 'Truck 04',
        path: [20, 33, 36, 37, 38, 31, 30, 6, 30, 22, 20],
        stops: [33, 36, 37, 38, 31, 30] },
      { vehicleIdx: 4, vehicleName: 'Truck 05',
        path: [20, 19, 32, 34, 9, 10, 11, 29, 32, 19, 20],
        stops: [32, 34, 9, 10, 11, 29] },
      { vehicleIdx: 5, vehicleName: 'Truck 06',
        path: [20, 33, 35, 37, 8, 37, 35, 33, 20],
        stops: [33, 35, 37, 8] },
      { vehicleIdx: 6, vehicleName: 'Truck 07',
        path: [20, 22, 30, 31, 38, 7, 38, 31, 30, 22, 20],
        stops: [30, 31, 38, 7] },
      { vehicleIdx: 7, vehicleName: 'Truck 08',
        path: [20, 18, 21, 3, 4, 24, 23, 25, 21, 18, 20],
        stops: [21, 3, 4, 24, 23] },
    ],
  },

  network_disruption: {
    depotNodeId: 20,
    fleet: [
      { name: 'Relief-A', capacity: 500, currentWeight: 400 },
      { name: 'Relief-B', capacity: 500, currentWeight: 380 },
      { name: 'Relief-C', capacity: 400, currentWeight: 300 },
      { name: 'Relief-D', capacity: 400, currentWeight: 280 },
      { name: 'Relief-E', capacity: 300, currentWeight: 200 },
    ],
    routes: [
      { vehicleIdx: 0, vehicleName: 'Relief-A',
        path: [20, 22, 36, 33, 32, 19, 20],
        stops: [22, 36, 33, 32] },
      { vehicleIdx: 1, vehicleName: 'Relief-B',
        path: [20, 18, 21, 25, 26, 30, 22, 20],
        stops: [18, 21, 25, 26, 30] },
      { vehicleIdx: 2, vehicleName: 'Relief-C',
        path: [20, 19, 28, 27, 29, 11, 29, 27, 28, 19, 20],
        stops: [19, 28, 27, 29] },
      { vehicleIdx: 3, vehicleName: 'Relief-D',
        path: [20, 33, 35, 37, 38, 31, 30, 22, 20],
        stops: [35, 37, 38, 31] },
      { vehicleIdx: 4, vehicleName: 'Relief-E',
        path: [20, 17, 16, 14, 13, 15, 12, 15, 16, 17, 20],
        stops: [17, 16, 14, 13] },
    ],
  },

  city_incident: {
    depotNodeId: 20,
    fleet: [
      { name: 'Rapid-1', capacity: 400, currentWeight: 300 },
      { name: 'Rapid-2', capacity: 400, currentWeight: 280 },
      { name: 'Rapid-3', capacity: 350, currentWeight: 250 },
      { name: 'Rapid-4', capacity: 350, currentWeight: 220 },
    ],
    routes: [
      { vehicleIdx: 0, vehicleName: 'Rapid-1',
        path: [20, 19, 17, 18, 21, 22, 20],
        stops: [19, 17, 18, 21, 22] },
      { vehicleIdx: 1, vehicleName: 'Rapid-2',
        path: [20, 33, 32, 34, 35, 33, 20],
        stops: [33, 32, 34, 35] },
      { vehicleIdx: 2, vehicleName: 'Rapid-3',
        path: [20, 22, 25, 23, 24, 26, 30, 22, 20],
        stops: [25, 23, 24, 26, 30] },
      { vehicleIdx: 3, vehicleName: 'Rapid-4',
        path: [20, 19, 28, 16, 15, 27, 29, 32, 19, 20],
        stops: [28, 16, 15, 27, 29] },
    ],
  },
};

// ─── Alternative route segments for rerouting after incidents ──────────────────

export interface DemoAlternativeRoute {
  /** The road IDs that are blocked */
  blockedRoads: string[];
  /** Original vehicle route node path */
  originalPath: number[];
  /** New rerouted path avoiding blocked roads */
  reroutedPath: number[];
  /** Time saved estimate (minutes) */
  timeSaved: number;
  /** Extra distance (km) */
  extraDistance: number;
}

export const DEMO_ALTERNATIVES: DemoAlternativeRoute[] = [
  {
    blockedRoads: ['a04', 'a05'],
    originalPath: [20, 18, 21],
    reroutedPath: [20, 22, 21],
    timeSaved: 8,
    extraDistance: 0.6,
  },
  {
    blockedRoads: ['a12', 'a13'],
    originalPath: [20, 22, 30],
    reroutedPath: [20, 33, 36, 31, 30],
    timeSaved: 12,
    extraDistance: 1.2,
  },
  {
    blockedRoads: ['a30'],
    originalPath: [20, 19, 17],
    reroutedPath: [20, 18, 17],
    timeSaved: 5,
    extraDistance: 0.3,
  },
  {
    blockedRoads: ['a17'],
    originalPath: [20, 33, 36],
    reroutedPath: [20, 22, 36],
    timeSaved: 6,
    extraDistance: 0.5,
  },
  {
    blockedRoads: ['a11'],
    originalPath: [20, 19, 28],
    reroutedPath: [20, 17, 16, 28],
    timeSaved: 10,
    extraDistance: 0.9,
  },
];

// ─── Active Incident Definition ────────────────────────────────────────────────

export interface ActiveIncident {
  id: string;
  roadId: string;
  type: string;
  severity: 'Low' | 'Medium' | 'High';
  timestamp: Date;
}

// ─── Strategy Metrics Definition ──────────────────────────────────────────────

export interface StrategyMetrics {
  preference: 'fastest' | 'shortest' | 'low_congestion' | 'stable' | 'balanced';
  title: string;
  tag: string;
  totalTimeMinutes: number;
  totalDistanceKm: number;
  congestionScore: number;    // %
  stabilityScore: number;     // %
  fuelLiters: number;
  paretoEfficiency: number;   // %
  isRecommended?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const getRoadById = (id: string): DemoRoad | undefined =>
  DEMO_ROADS.find((r) => r.id === id);

export const getRoadMidpoint = (road: DemoRoad): { x: number; y: number } => {
  const n1 = nodeById(road.from);
  const n2 = nodeById(road.to);
  if (!n1 || !n2) return { x: 700, y: 450 };
  return { x: Math.round((n1.x + n2.x) / 2), y: Math.round((n1.y + n2.y) / 2) };
};

export const getRoadBetween = (fromId: number, toId: number): DemoRoad | undefined => {
  return DEMO_ROADS.find(
    (r) => (r.from === fromId && r.to === toId) || (r.from === toId && r.to === fromId)
  );
};

// ─── Graph Dijkstra Routing Engine ─────────────────────────────────────────────

export const findShortestPathDijkstra = (
  start: number,
  target: number,
  blockedRoadIds: string[] = [],
  preference: 'fastest' | 'shortest' | 'low_congestion' | 'stable' | 'balanced' = 'balanced'
): number[] => {
  if (start === target) return [start];
  const dist: Record<number, number> = {};
  const prev: Record<number, number> = {};
  const unvisited = new Set<number>();

  for (const node of DEMO_NODES) {
    dist[node.id] = Infinity;
    unvisited.add(node.id);
  }
  dist[start] = 0;

  while (unvisited.size > 0) {
    let curr: number | null = null;
    let minDist = Infinity;
    for (const node of unvisited) {
      if (dist[node] < minDist) {
        minDist = dist[node];
        curr = node;
      }
    }
    if (curr === null || dist[curr] === Infinity) break;
    if (curr === target) break;

    unvisited.delete(curr);

    const edges = DEMO_ROADS.filter(
      (r) => (r.from === curr || r.to === curr) && !blockedRoadIds.includes(r.id)
    );

    for (const r of edges) {
      const neighbor = r.from === curr ? r.to : r.from;
      if (!unvisited.has(neighbor)) continue;

      const n1 = nodeById(curr);
      const n2 = nodeById(neighbor);
      if (!n1 || !n2) continue;
      const rawLen = Math.hypot(n1.x - n2.x, n1.y - n2.y);
      let weight = rawLen;

      if (preference === 'fastest') {
        const speed = r.type === 'highway' ? 2.4 : r.type === 'arterial' ? 1.5 : r.type === 'collector' ? 1.0 : 0.7;
        weight = rawLen / speed;
      } else if (preference === 'shortest') {
        weight = rawLen;
      } else if (preference === 'low_congestion') {
        const isDowntown = [17, 18, 19, 20, 21, 22].includes(curr) || [17, 18, 19, 20, 21, 22].includes(neighbor);
        const speed = r.type === 'highway' ? 1.9 : r.type === 'arterial' ? 1.1 : 0.9;
        weight = (rawLen / speed) + (isDowntown ? rawLen * 2.2 : 0);
      } else if (preference === 'stable') {
        const factor = r.type === 'highway' ? 0.65 : r.type === 'arterial' ? 0.95 : 1.7;
        weight = rawLen * factor;
      } else {
        // balanced
        const speed = r.type === 'highway' ? 1.8 : r.type === 'arterial' ? 1.2 : 0.9;
        weight = rawLen * 0.45 + (rawLen / speed) * 0.55;
      }

      const alt = dist[curr] + weight;
      if (alt < dist[neighbor]) {
        dist[neighbor] = alt;
        prev[neighbor] = curr;
      }
    }
  }

  const path: number[] = [];
  let u: number | undefined = target;
  while (u !== undefined) {
    path.unshift(u);
    u = prev[u];
  }
  return path.length > 0 && path[0] === start ? path : [start, target];
};

// ─── Generate Multi-Vehicle Dispatch Plan ─────────────────────────────────────

export const generateMultiVehicleDispatchPlan = (
  depotNodeId: number,
  stops: Array<{ nodeId: number; vehicleIdx?: number }>,
  vehicles: Array<{ name: string; status?: string }>,
  preference: 'fastest' | 'shortest' | 'low_congestion' | 'stable' | 'balanced' = 'balanced',
  blockedRoadIds: string[] = []
): DemoPresetRoute[] => {
  const numVehicles = Math.max(1, vehicles.length);
  const vehicleRoutes: DemoPresetRoute[] = [];

  // Check if stops have explicit vehicle assignments
  const hasExplicitAssignments = stops.some((s) => s.vehicleIdx !== undefined);

  for (let vIdx = 0; vIdx < numVehicles; vIdx++) {
    const v = vehicles[vIdx];
    const vName = v?.name || `Vehicle ${vIdx + 1}`;

    // If vehicle is dormant, do not generate active route
    if (v?.status === 'dormant') {
      continue;
    }

    let assignedStops: number[] = [];
    if (hasExplicitAssignments) {
      // Only assign stops explicitly set for this vehicle index
      assignedStops = stops.filter((s) => s.vehicleIdx === vIdx).map((s) => s.nodeId);
    } else {
      // Round-robin distribution
      assignedStops = stops.filter((_, i) => i % numVehicles === vIdx).map((s) => s.nodeId);
    }

    if (assignedStops.length === 0) {
      // If there is only 1 vehicle and stops exist without matching index, assign all
      if (numVehicles === 1 && stops.length > 0) {
        assignedStops = stops.map((s) => s.nodeId);
      } else {
        // Vehicle stays at depot
        vehicleRoutes.push({
          vehicleIdx: vIdx,
          vehicleName: vName,
          path: [depotNodeId, depotNodeId],
          stops: [],
        });
        continue;
      }
    }

    // Sequence: Depot -> Stop1 -> Stop2 -> ... -> Depot
    const waypoints = [depotNodeId, ...assignedStops, depotNodeId];
    const fullPath: number[] = [];

    for (let i = 0; i < waypoints.length - 1; i++) {
      const seg = findShortestPathDijkstra(waypoints[i], waypoints[i + 1], blockedRoadIds, preference);
      if (fullPath.length > 0 && seg.length > 0 && fullPath[fullPath.length - 1] === seg[0]) {
        fullPath.push(...seg.slice(1));
      } else {
        fullPath.push(...seg);
      }
    }

    vehicleRoutes.push({
      vehicleIdx: vIdx,
      vehicleName: vName,
      path: fullPath.length > 0 ? fullPath : [depotNodeId, ...assignedStops, depotNodeId],
      stops: assignedStops,
    });
  }

  return vehicleRoutes;
};

// ─── Multi-Incident Alternative Finder ─────────────────────────────────────────

export const findMultiIncidentAlternatives = (
  blockedRoadIds: string[],
  currentRoutes: Array<{ vehicleIdx: number; vehicleName: string; path: number[]; stops?: number[] }>,
  preference: 'fastest' | 'shortest' | 'low_congestion' | 'stable' | 'balanced' = 'balanced'
): Array<{
  vehicleIdx: number;
  vehicleName: string;
  blockedRoadIds: string[];
  originalPath: number[];
  reroutedPath: number[];
  timeSaved: number;
  extraDistance: number;
}> => {
  const results: Array<{
    vehicleIdx: number;
    vehicleName: string;
    blockedRoadIds: string[];
    originalPath: number[];
    reroutedPath: number[];
    timeSaved: number;
    extraDistance: number;
  }> = [];

  for (const route of currentRoutes) {
    // Check if route traverses any of the blocked roads
    const roadHits: string[] = [];
    for (let i = 0; i < route.path.length - 1; i++) {
      const road = getRoadBetween(route.path[i], route.path[i + 1]);
      if (road && blockedRoadIds.includes(road.id)) {
        if (!roadHits.includes(road.id)) roadHits.push(road.id);
      }
    }

    if (roadHits.length > 0) {
      // Re-generate this vehicle's path bypassing all blocked roads
      const depotId = route.path[0] || 20;
      const waypoints = [depotId, ...(route.stops || []), depotId];
      const newPath: number[] = [];

      for (let i = 0; i < waypoints.length - 1; i++) {
        const seg = findShortestPathDijkstra(waypoints[i], waypoints[i + 1], blockedRoadIds, preference);
        if (newPath.length > 0 && seg.length > 0 && newPath[newPath.length - 1] === seg[0]) {
          newPath.push(...seg.slice(1));
        } else {
          newPath.push(...seg);
        }
      }

      // Calculate path metrics differences
      const origDist = route.path.reduce((sum, n, idx) => {
        if (idx === 0) return 0;
        const n1 = nodeById(route.path[idx - 1]);
        const n2 = nodeById(n);
        return sum + (n1 && n2 ? Math.hypot(n1.x - n2.x, n1.y - n2.y) : 0);
      }, 0) * 0.04;

      const newDist = newPath.reduce((sum, n, idx) => {
        if (idx === 0) return 0;
        const n1 = nodeById(newPath[idx - 1]);
        const n2 = nodeById(n);
        return sum + (n1 && n2 ? Math.hypot(n1.x - n2.x, n1.y - n2.y) : 0);
      }, 0) * 0.04;

      const extraDist = Math.max(0.3, +(newDist - origDist).toFixed(1));
      const timeSaved = Math.max(6, Math.round(roadHits.length * 9 + extraDist * 2.5));

      results.push({
        vehicleIdx: route.vehicleIdx,
        vehicleName: route.vehicleName,
        blockedRoadIds: roadHits,
        originalPath: route.path,
        reroutedPath: newPath,
        timeSaved,
        extraDistance: extraDist,
      });
    }
  }

  return results;
};

// Legacy single-road helper compatibility
export const findAlternativeForRoad = (
  roadId: string,
  routes: Array<{ vehicleIdx: number; path: number[] }>
): {
  alternative: DemoAlternativeRoute;
  affectedVehicleIdx: number;
} | null => {
  const multi = findMultiIncidentAlternatives(
    [roadId],
    routes.map((r) => ({
      vehicleIdx: r.vehicleIdx,
      vehicleName: `Vehicle ${r.vehicleIdx + 1}`,
      path: r.path,
      stops: r.path.slice(1, -1),
    }))
  );

  if (multi.length > 0) {
    const first = multi[0];
    return {
      alternative: {
        blockedRoads: first.blockedRoadIds,
        originalPath: first.originalPath,
        reroutedPath: first.reroutedPath,
        timeSaved: first.timeSaved,
        extraDistance: first.extraDistance,
      },
      affectedVehicleIdx: first.vehicleIdx,
    };
  }
  return null;
};

// ─── Calculate Comparison Metrics Across All 5 Strategies ─────────────────────

export const calculateStrategyMetrics = (
  preference: 'fastest' | 'shortest' | 'low_congestion' | 'stable' | 'balanced',
  routes: Array<{ vehicleIdx: number; path: number[] }>
): StrategyMetrics => {
  let totalDistPx = 0;
  let highwayPx = 0;
  let arterialPx = 0;
  let collectorPx = 0;
  let downtownPx = 0;

  for (const r of routes) {
    for (let i = 0; i < r.path.length - 1; i++) {
      const u = r.path[i];
      const v = r.path[i + 1];
      const n1 = nodeById(u);
      const n2 = nodeById(v);
      if (!n1 || !n2) continue;
      const len = Math.hypot(n1.x - n2.x, n1.y - n2.y);
      totalDistPx += len;

      const road = getRoadBetween(u, v);
      if (road?.type === 'highway') highwayPx += len;
      else if (road?.type === 'arterial') arterialPx += len;
      else collectorPx += len;

      if ([17, 18, 19, 20, 21, 22].includes(u) || [17, 18, 19, 20, 21, 22].includes(v)) {
        downtownPx += len;
      }
    }
  }

  const distKm = +(Math.max(12, totalDistPx * 0.038)).toFixed(1);
  const highwayRatio = totalDistPx > 0 ? highwayPx / totalDistPx : 0.3;
  const downtownRatio = totalDistPx > 0 ? downtownPx / totalDistPx : 0.25;

  let timeMin = 0;
  let congestion = 0;
  let stability = 0;
  let fuel = 0;
  let pareto = 0;
  let title = '';
  let tag = '';

  switch (preference) {
    case 'fastest':
      title = 'FASTEST';
      tag = 'Min Time';
      timeMin = Math.round(distKm * 1.35 * (1 - highwayRatio * 0.25));
      congestion = Math.round(22 + downtownRatio * 25);
      stability = 82;
      fuel = +(distKm * 0.14).toFixed(1);
      pareto = 91;
      break;
    case 'shortest':
      title = 'SHORTEST';
      tag = 'Min Distance';
      timeMin = Math.round(distKm * 1.75);
      congestion = Math.round(38 + downtownRatio * 35);
      stability = 74;
      fuel = +(distKm * 0.115).toFixed(1);
      pareto = 87;
      break;
    case 'low_congestion':
      title = 'LOW CONGESTION';
      tag = 'Free Flow';
      timeMin = Math.round(distKm * 1.48);
      congestion = Math.max(10, Math.round(15 + downtownRatio * 10));
      stability = 88;
      fuel = +(distKm * 0.128).toFixed(1);
      pareto = 90;
      break;
    case 'stable':
      title = 'STABLE';
      tag = 'Robust Path';
      timeMin = Math.round(distKm * 1.52);
      congestion = Math.round(26 + downtownRatio * 20);
      stability = 96;
      fuel = +(distKm * 0.132).toFixed(1);
      pareto = 89;
      break;
    case 'balanced':
    default:
      title = 'BALANCED';
      tag = 'Recommended';
      timeMin = Math.round(distKm * 1.42);
      congestion = Math.round(20 + downtownRatio * 18);
      stability = 91;
      fuel = +(distKm * 0.122).toFixed(1);
      pareto = 96;
      break;
  }

  return {
    preference,
    title,
    tag,
    totalTimeMinutes: timeMin,
    totalDistanceKm: distKm,
    congestionScore: congestion,
    stabilityScore: stability,
    fuelLiters: fuel,
    paretoEfficiency: pareto,
    isRecommended: preference === 'balanced',
  };
};

export const getAllStrategiesComparison = (
  routes: Array<{ vehicleIdx: number; path: number[] }>
): StrategyMetrics[] => {
  const prefs: Array<'fastest' | 'shortest' | 'low_congestion' | 'stable' | 'balanced'> = [
    'fastest',
    'shortest',
    'low_congestion',
    'stable',
    'balanced',
  ];
  return prefs.map((p) => calculateStrategyMetrics(p, routes));
};
