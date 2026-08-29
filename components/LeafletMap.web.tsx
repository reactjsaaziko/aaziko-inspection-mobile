import * as React from 'react';

/**
 * Web map surface: renders the Leaflet/OpenStreetMap HTML in an <iframe>.
 * Used automatically on web (Metro resolves the .web.tsx file), so
 * react-native-webview — which doesn't support react-native-web — is never
 * imported on web.
 */
export function LeafletMap({ html }: { html: string }) {
  return React.createElement('iframe', {
    srcDoc: html,
    style: { border: 0, width: '100%', height: '100%', backgroundColor: '#e8eef3' },
  });
}
