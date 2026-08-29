import { WebView } from 'react-native-webview';

/**
 * Native map surface: renders the Leaflet/OpenStreetMap HTML inside a WebView.
 * (Web uses the sibling LeafletMap.web.tsx with an <iframe> instead — Metro picks
 * the right file per platform, so react-native-webview is never bundled for web.)
 */
export function LeafletMap({ html }: { html: string }) {
  return (
    <WebView
      originWhitelist={['*']}
      source={{ html }}
      style={{ flex: 1, backgroundColor: '#e8eef3' }}
      startInLoadingState
    />
  );
}
