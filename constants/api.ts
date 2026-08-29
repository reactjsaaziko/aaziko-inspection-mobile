// Aaziko common backend (API Gateway).
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │  TESTING TOGGLE — flip USE_LOCAL to test without deploying.               │
// │                                                                           │
// │  USE_LOCAL = true   → the app talks to the DEV backend on this computer   │
// │                       (all the latest fixes are already there — NO deploy │
// │                       needed). The phone must be on the SAME Wi-Fi, and   │
// │                       LOCAL_BASE below must be THIS computer's LAN IP.     │
// │                                                                           │
// │  USE_LOCAL = false  → the app talks to the LIVE production server.        │
// │                       Use this for real users / real data.               │
// └─────────────────────────────────────────────────────────────────────────┘
const USE_LOCAL = false;

// This computer's LAN IP + the API gateway port (3030). If the computer's IP
// changes, update it here. (Find it with `hostname -I` / `ipconfig`.)
const LOCAL_BASE = 'http://192.168.1.21:3030';

// Production: the gateway is proxied under /common-api behind api.aaziko.com.
const LIVE_BASE = 'https://api.aaziko.com/common-api';

export const API_BASE_URL = USE_LOCAL ? LOCAL_BASE : LIVE_BASE;

export const ENDPOINTS = {
  // Service Provider login (inspection users are service providers).
  login: '/service-provider/users/login',
  refresh: '/service-provider/users/refresh',
};

// Google Maps — paste your API key here (needs "Maps JavaScript API" + "Geocoding
// API" enabled in Google Cloud). While this is empty, the map falls back to the
// free OpenStreetMap view. Once set, the map screen shows an interactive Google map.
export const GOOGLE_MAPS_API_KEY = 'AIzaSyBAP4bmSWFylDWZu-CncN6LLAAeGQsv-hw';
