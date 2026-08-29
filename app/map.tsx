import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GOOGLE_MAPS_API_KEY } from '@/constants/api';
import { LeafletMap } from '@/components/LeafletMap';
import { hasRealLocation, locationQuery, type InspectionOrder } from '@/lib/orders';

const BLUE = '#5B9BD5';

interface MapOrderParam {
  orderNumber: string;
  sampleNumber: string;
  product: string;
  image: string;
  location: InspectionOrder['location'];
}

/**
 * Leaflet + OpenStreetMap page. If we already have coordinates it uses them;
 * otherwise it geocodes the factory address via OpenStreetMap's free Nominatim
 * service right inside the map — so it works on the phone AND on the web.
 */
/** Build an ordered list of geocoding candidates, broadest-useful first-to-last,
 * so a hard-to-find building name still resolves to at least its city/state.
 * Handles messy input (whole address typed into one field) by also trying the
 * last word(s) of the address string and appending the country. */
function geoCandidates(loc: MapOrderParam['location']): string[] {
  const bad = (v?: string) =>
    !v || ['n/a', 'to be confirmed', '-', ''].includes(String(v).trim().toLowerCase());
  const clean = (v?: string) => (bad(v) ? '' : String(v).trim());
  const address = clean(loc.address);
  const city = clean(loc.city);
  const state = clean(loc.state);
  const country = clean(loc.country) || 'India';

  const out: string[] = [];
  const push = (parts: (string | undefined)[]) => {
    const s = parts.filter(Boolean).join(', ').replace(/(^,|,$)/g, '').trim();
    if (s && !out.includes(s)) out.push(s);
  };

  push([address, city, state, country]); // 1. full
  push([city, state, country]); // 2. city/state/country
  // 3. When the address is a single blob (no city/state fields), pull the last
  //    word(s) — usually the city/state — and search those with the country.
  if (address) {
    const toks = address.split(/[\s,]+/).filter(Boolean);
    if (toks.length >= 2) push([toks.slice(-2).join(' '), country]);
    if (toks.length >= 1) push([toks[toks.length - 1], country]);
    push([address, country]);
  }
  push([state, country]); // 4. state
  push([country]); // 5. last resort — at least the country
  return out;
}

/** ISO country code for restricting the geocode search (prevents matches in the
 * wrong country). Defaults to India — this is an India-first platform. */
function countryCode(country?: string): string {
  const c = (country || '').trim().toLowerCase();
  const map: Record<string, string> = {
    india: 'in',
    bharat: 'in',
    'united states': 'us',
    usa: 'us',
    us: 'us',
    uk: 'gb',
    'united kingdom': 'gb',
    china: 'cn',
    bangladesh: 'bd',
    pakistan: 'pk',
    'sri lanka': 'lk',
    nepal: 'np',
    uae: 'ae',
    'united arab emirates': 'ae',
    vietnam: 'vn',
  };
  return map[c] || 'in';
}

/** Significant words the geocoded result must contain (city/state, plus the last
 * words of a single-field address) — used to reject a match in the wrong city. */
function expectedTerms(loc: MapOrderParam['location']): string[] {
  const bad = (v?: string) =>
    !v || ['n/a', 'to be confirmed', '-', ''].includes(String(v).trim().toLowerCase());
  const clean = (v?: string) => (bad(v) ? '' : String(v).trim().toLowerCase());
  const terms = new Set<string>();
  const add = (s: string) => {
    s.split(/[\s,]+/)
      .filter(Boolean)
      .forEach((t) => {
        if (t.length >= 3) terms.add(t);
      });
  };
  if (clean(loc.city)) add(clean(loc.city));
  if (clean(loc.state)) add(clean(loc.state));
  const addr = clean(loc.address);
  if (addr)
    addr
      .split(/[\s,]+/)
      .filter(Boolean)
      .slice(-2)
      .forEach((t) => {
        if (t.length >= 3) terms.add(t.toLowerCase());
      });
  return Array.from(terms);
}

function buildHtml(
  lat: number | undefined,
  lng: number | undefined,
  queries: string[],
  expected: string[],
  cc: string,
  label: string,
): string {
  const safe = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/</g, '\\u003c');
  const queriesJson = JSON.stringify(queries).replace(/</g, '\\u003c');
  const expectedJson = JSON.stringify(expected).replace(/</g, '\\u003c');
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{height:100%;margin:0;padding:0;background:#e8eef3;font-family:sans-serif}
.msg{padding:24px;color:#5b6b78;font-size:15px}</style>
</head><body><div id="map"></div>
<script>
  var LAT=${lat ?? 'NaN'}, LNG=${lng ?? 'NaN'};
  var QUERIES=${queriesJson}, EXPECTED=${expectedJson}, CC='${safe(cc)}', LABEL='${safe(label)}';
  var firstAny=null; // best-effort result if nothing matches the expected city/state
  function show(la,ln){
    var map=L.map('map',{attributionControl:false}).setView([la,ln],14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
    L.marker([la,ln]).addTo(map).bindPopup(LABEL).openPopup();
  }
  function fail(t){ document.getElementById('map').innerHTML='<div class="msg">'+t+'</div>'; }
  // A result is acceptable if its display name contains one of the expected
  // city/state words (so we don't pin the wrong "railway station" in another city).
  function matches(r){
    if(!r) return false;
    if(!EXPECTED.length) return true;
    var dn=(r.display_name||'').toLowerCase();
    for(var k=0;k<EXPECTED.length;k++){ if(dn.indexOf(EXPECTED[k])>=0) return true; }
    return false;
  }
  function tryNext(i){
    if(i>=QUERIES.length){
      if(firstAny){ show(parseFloat(firstAny.lat),parseFloat(firstAny.lon)); }
      else { fail('Could not find this address on the map.'); }
      return;
    }
    var q=QUERIES[i];
    if(!q){ tryNext(i+1); return; }
    var url='https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5'+(CC?'&countrycodes='+CC:'')+'&q='+encodeURIComponent(q);
    fetch(url).then(function(r){return r.json();})
      .then(function(a){
        if(a&&a.length){
          if(!firstAny) firstAny=a[0];
          for(var j=0;j<a.length;j++){ if(matches(a[j])){ show(parseFloat(a[j].lat),parseFloat(a[j].lon)); return; } }
        }
        tryNext(i+1);
      })
      .catch(function(){ tryNext(i+1); });
  }
  if(!isNaN(LAT)&&!isNaN(LNG)){ show(LAT,LNG); } else { tryNext(0); }
</script></body></html>`;
}

/** Interactive Google map (Maps JavaScript API). Uses coordinates if present,
 * else geocodes the address candidates with Google's geocoder, restricted to the
 * country so it can't land abroad. Only used when GOOGLE_MAPS_API_KEY is set. */
function buildGoogleHtml(
  key: string,
  lat: number | undefined,
  lng: number | undefined,
  queries: string[],
  cc: string,
  label: string,
): string {
  const safe = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/</g, '\\u003c');
  const queriesJson = JSON.stringify(queries).replace(/</g, '\\u003c');
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<style>html,body,#map{height:100%;margin:0;padding:0;background:#e8eef3}
.msg{padding:24px;color:#5b6b78;font-family:sans-serif;font-size:15px}</style>
</head><body><div id="map"></div>
<script>
  var LAT=${lat ?? 'NaN'}, LNG=${lng ?? 'NaN'};
  var QUERIES=${queriesJson}, CC='${safe(cc)}', LABEL='${safe(label)}';
  function fail(t){ document.getElementById('map').innerHTML='<div class="msg">'+(t||'Could not find this address on the map.')+'</div>'; }
  function initMap(){
    var map=new google.maps.Map(document.getElementById('map'),{zoom:5,center:{lat:22.35,lng:78.66},mapTypeControl:false,streetViewControl:false,fullscreenControl:false});
    function place(la,ln,approx){ map.setCenter({lat:la,lng:ln}); map.setZoom(approx?11:15); new google.maps.Marker({position:{lat:la,lng:ln},map:map,title:approx?LABEL+' (approximate area)':LABEL}); }
    if(!isNaN(LAT)&&!isNaN(LNG)){ place(LAT,LNG); return; }
    var g=new google.maps.Geocoder();
    // Geocode the address candidates broadest-useful order. Google fuzzy-matches, so a
    // typo in the street returns a partial_match — a confidently-wrong pin. Reject those
    // and fall through to the next (broader) candidate (city/state/country), so a spelling
    // mistake lands on the right city instead of a random street. Only if EVERY candidate is
    // a partial match do we show the first fuzzy guess, clearly marked as approximate.
    function tryNext(i, fb){
      if(i>=QUERIES.length){ if(fb){ place(fb.la,fb.ln,true); } else { fail(); } return; }
      var q=QUERIES[i]; if(!q){ tryNext(i+1, fb); return; }
      var req={address:q}; if(CC){ req.componentRestrictions={country:CC}; }
      g.geocode(req, function(res,status){
        if(status==='OK'&&res&&res[0]){
          var r=res[0], l=r.geometry.location;
          if(!r.partial_match){ place(l.lat(),l.lng()); return; }   // exact match — trust it
          if(!fb){ fb={la:l.lat(),ln:l.lng()}; }                    // remember first fuzzy guess
          tryNext(i+1, fb);                                          // prefer a broader, cleaner candidate
        } else { tryNext(i+1, fb); }
      });
    }
    tryNext(0, null);
  }
  window.gm_authFailure=function(){ fail('Google Maps key error — check the API key and that Maps JavaScript API is enabled.'); };
</script>
<script async src="https://maps.googleapis.com/maps/api/js?key=${safe(key)}&callback=initMap"></script>
</body></html>`;
}

export default function MapScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ order?: string }>();

  let order: MapOrderParam | null = null;
  try {
    order = params.order ? (JSON.parse(params.order) as MapOrderParam) : null;
  } catch {
    order = null;
  }

  const canMap = !!order && hasRealLocation(order.location);
  const addressLine = order ? locationQuery(order.location) : '';

  /** Open the phone's native Google Maps app with this factory searched. Google Maps'
   * own search resolves local/society names far better than the in-app geocoder, and
   * lets the inspector visually verify the pin, switch to satellite, and get directions.
   * Uses exact coordinates when we have them; otherwise searches the address text. */
  const openInGoogleMaps = async () => {
    if (!order) return;
    const loc = order.location;
    const query =
      loc.latitude != null && loc.longitude != null
        ? `${loc.latitude},${loc.longitude}`
        : locationQuery(loc);
    if (!query) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    try {
      await Linking.openURL(url);
    } catch {
      // No maps app or browser available — nothing else we can do.
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {canMap && order ? (
        <View style={styles.web}>
          <LeafletMap
            html={
              GOOGLE_MAPS_API_KEY
                ? buildGoogleHtml(
                    GOOGLE_MAPS_API_KEY,
                    order.location.latitude,
                    order.location.longitude,
                    geoCandidates(order.location),
                    countryCode(order.location.country).toUpperCase(),
                    order.product || 'Vendor factory',
                  )
                : buildHtml(
                    order.location.latitude,
                    order.location.longitude,
                    geoCandidates(order.location),
                    expectedTerms(order.location),
                    countryCode(order.location.country),
                    order.product || 'Vendor factory',
                  )
            }
          />
        </View>
      ) : (
        <View style={styles.center}>
          <Ionicons name="location-outline" size={54} color="#c4ced8" />
          <Text style={styles.msg}>Vendor factory location isn&apos;t set for this order yet.</Text>
          <Text style={styles.sub}>
            It will pin here automatically once the vendor adds their factory address.
          </Text>
        </View>
      )}

      <TouchableOpacity style={styles.close} onPress={() => router.back()} activeOpacity={0.85}>
        <Ionicons name="close" size={22} color={BLUE} />
      </TouchableOpacity>

      {order && (
        <View style={styles.card}>
          <View style={styles.cardTop}>
            {order.image ? (
              <Image source={{ uri: order.image }} style={styles.thumb} contentFit="cover" />
            ) : (
              <View style={[styles.thumb, styles.ph]}>
                <Ionicons name="image-outline" size={20} color="#c4ced8" />
              </View>
            )}
            <View style={styles.info}>
              <Text style={styles.line}>Order No. {order.orderNumber}</Text>
              <Text style={styles.line}>Sample No.: {order.sampleNumber}</Text>
              <Text style={styles.product} numberOfLines={2}>
                {order.product}
              </Text>
            </View>
          </View>
          {addressLine ? (
            <View style={styles.addrRow}>
              <Ionicons name="location" size={13} color={BLUE} />
              <Text style={styles.addr} numberOfLines={2}>
                {addressLine}
              </Text>
            </View>
          ) : null}
          {addressLine ? (
            <TouchableOpacity
              style={styles.gmapBtn}
              onPress={openInGoogleMaps}
              activeOpacity={0.85}
            >
              <Ionicons name="navigate" size={15} color="#ffffff" />
              <Text style={styles.gmapBtnText}>Open in Google Maps</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#e8eef3' },
  web: { flex: 1, backgroundColor: '#e8eef3' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  msg: { color: '#5b6b78', fontSize: 14, textAlign: 'center' },
  sub: { color: '#9aa4ad', fontSize: 12.5, textAlign: 'center' },

  close: {
    position: 'absolute',
    top: 52,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 2px 6px rgba(0,0,0,0.15)',
  },

  card: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    boxShadow: '0px 4px 10px rgba(0,0,0,0.18)',
  },
  cardTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  thumb: { width: 52, height: 52, borderRadius: 8, backgroundColor: '#f1f2f4' },
  ph: { alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 2 },
  line: { fontSize: 12.5, color: '#6b7680' },
  product: { fontSize: 13.5, color: '#37536b', fontWeight: '600', marginTop: 2 },
  addrRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  addr: { flex: 1, fontSize: 12.5, color: '#5b6b78' },
  gmapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 12,
    backgroundColor: BLUE,
    borderRadius: 9,
    paddingVertical: 10,
  },
  gmapBtnText: { color: '#ffffff', fontSize: 13.5, fontWeight: '600' },
});
