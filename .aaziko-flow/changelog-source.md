---
title: "Change Documentation — aaziko-inspection-mobile"
---

# Change Documentation — aaziko-inspection-mobile

> Auto-generated on every push, to any branch. Newest entry first. Old entries are never removed.

<!-- AAZIKO-CHANGELOG:INSERT-AFTER -->

<!-- AAZIKO-CHANGELOG:HISTORY-START -->

> History of the main branch, one entry per day, newest first.

## 19 October 2026 — main branch (history)

### Summary

On 19 October 2026, the main branch received changes to 2 files: 2 added, 0 changed and 0 removed, with 463 lines added and 0 lines removed in total. Most of the work was in the main project folder and the workflows area.

### What was added

- 2 automatic change documentation files were added in the workflows area.

### Impact

- These changes are self-contained; no other part of the project depends on them.

---

## 26 September 2026 — main branch (history)

### Summary

On 26 September 2026, the main branch received changes to 1 file: 1 added, 0 changed and 0 removed, with 94 lines added and 0 lines removed in total. Most of the work was in the workflows area.

### What was added

- 1 build and deployment setting file was added in the workflows area.

### Impact

- Build or deployment settings changed, so the build and the deployment should be checked.

---

## 29 August 2026 — main branch (history)

### Summary

On 29 August 2026, the main branch received changes to 59 files: 30 added, 9 changed and 20 removed, with 6770 lines added and 904 lines removed in total. Most of the work was in the main project folder, the images area, the tabs area, the screen area and the constants area.

### What was added

- A new packing screen was added; it provides queue item, order param, formatting date, box row, new box, packing screen, sync, media count, last stamp, capture, updating box, adding box, removing box, do remove, make ctx, building box payload, handling of scan box, reaction to box scanned and reaction to submit.
- A new orders screen was added; it provides inspection order, formatting date, call vendor, notif, order card, orders screen, reaction to logout and confirm logout.
- A new detail screen was added; it provides queue item, order param, formatting date, section key, order detail screen, first non empty, sync, items for, adding media and reaction to submit.
- A new documents screen was added; it provides completion image, queue item, order param, formatting date, documents screen, sync, doc count, doc stamp, take photo, uploading file and reaction to submit.
- A new map screen was added; it provides mapping order param, geo candidates, bad, clean, country code, expected terms, add, building HTML, safe, show, fail, matches, try next, building google HTML, setup of map, place, mapping screen and opening in google maps.
- A new uploading queue logic was added; it provides queue status, queue item, notify, subscribe, making sure of dir, persist, loading queue, getting items, assignment queue status, status for assignment, enqueue capture, the check for online, processing item, attach, processing queue, clear done for assignment and start connectivity watcher.
- A new app screen was added; it provides login screen and reaction to login.
- A new workdetails screen was added; it provides picked doc, work details screen, pick documents and reaction to next.
- A new address screen was added; it provides address screen, detect, reaction to skip and reaction to next.
- A new auth logic was added; it provides saving credentials, getting stored credentials, clear credentials, service provider user, login data, login result, the check for inspection access, login, relogin with stored credentials, getting stored user, getting access token, refresh access token and logout.
- A new profile logic was added; it provides onboarding key, the check for onboarding done, mark onboarding done, contact info, provider ID, the check for address, any, getting contact info, the check for work details, needs address, next onboarding route, route after address, saving work details and saving address.
- A new completed screen was added; it provides order param, formatting date, banner and completed screen.
- A new orders logic was added; it provides inspection order, the check for real location, bad, location query, broad location query, the check for inspection done, the check for pending assignment, orders result, pick, cleaning up phone, collect images, mapping order and getting inspection orders.
- A new inspection media logic was added; it provides captured asset, uploaded media, guess name, guess mime, uploading inspection media, progress image, attach inspection progress and getting inspection record.
- A new box detail modal component was added; it provides scanned box, scanned order, row and box detail modal; it takes over props from other parts of the code.
- A new qr scanner modal component was added; it provides props, qr scanner modal and fire.
- A new packing logic was added; it provides box payload, order context, saving box result, saving box, deleting box, lookup result and lookup box by qr.
- A new capture meta logic was added; it provides capture meta, making sure of permission, with timeout, getting capture meta, formatting captured at and meta caption suffix.
- A new aaziko splash component was added; it provides aaziko splash, pulse and dot style.
- A new quantity slider component was added; it provides quantity slider, clamp, setting from x and reaction to touch.
- A new inspection logic was added; it provides post, acknowledge assignment, decline assignment, start assignment, completion image, submitting inspection and try submit.
- A new home screen was added; it provides reaction to logout; it takes over home screen from other parts of the code.
- A new http logic was added; it provides authed fetch and run.
- A new background sync logic was added; it provides registering background sync.
- A new API logic in the constants area was added.
- A new leaflet map component was added; it provides leaflet map.
- A new leaflet map web component was added; it provides leaflet map.
- 1 settings and data file was added.
- 2 image files were added in the images area.

### What was changed

- The layout screen was changed: the logic for root layout was updated; it now also relies on the expo splash screen library, the react library, the react native library, the react native safe area context library, the aaziko splash part of the code, the background sync part of the code and the uploading queue part of the code; it no longer relies on the shared logic for color scheme part of the code.
- The external library @react-native-async-storage/async-storage was added (version 2.2.0).
- The external library @react-native-community/netinfo was added (version 11.4.1).
- The external library expo-background-task was added (version ~1.0.10).
- The external library expo-camera was added (version ~17.0.10).
- The external library expo-document-picker was added (version ~14.0.8).
- The external library expo-file-system was added (version ~19.0.24).
- The external library expo-image-picker was added (version ~17.0.11).
- The external library expo-location was added (version ~19.0.8).
- The external library expo-secure-store was added (version ~15.0.8).
- The external library expo-task-manager was added (version ~14.0.9).
- The external library react-native-webview was added (version 13.15.0).
- The android command of the project was changed.
- The ios command of the project was changed.
- 1 dependency lock file was updated.
- 1 written documentation file was updated.
- 1 settings and data file was updated.
- 4 image files were updated in the images area.

### What was removed

- The explore screen in the tabs area was removed; it provided tab two screen.
- The resetting project logic in the scripts area was removed; it provided index, root layout and move directories.
- The tabs screen was removed.
- The parallax scroll view component was removed; it provided parallax scroll view.
- The themed text component was removed; it provided themed text props and themed text.
- The theme logic in the constants area was removed.
- The collapsible component in the screen area was removed; it provided collapsible.
- The icon symbol component in the screen area was removed; it provided icon mapping, icon symbol name and icon symbol.
- The layout screen in the tabs area was removed; it provided tab layout.
- The icon symbol ios component in the screen area was removed; it provided icon symbol.
- The modal screen was removed; it provided modal screen.
- The external link component was removed; it provided external link.
- The shared logic for color scheme web was removed; it provided shared logic for color scheme.
- The shared logic for theme color was removed; it provided shared logic for theme color.
- The hello wave component was removed; it provided hello wave.
- The haptic tab component was removed; it provided haptic tab.
- The themed view component was removed; it provided themed view props and themed view.
- The shared logic for color scheme was removed.
- 2 written documentation files were removed.

### Impact

- External libraries changed, so they must be installed again and the application rebuilt before deploying.

---

## 21 August 2026 — main branch (history)

### Summary

On 21 August 2026, the main branch received changes to 41 files: 41 added, 0 changed and 0 removed, with 14162 lines added and 0 lines removed in total. Most of the work was in the main project folder, the images area, the tabs area, the screen area and the constants area.

### What was added

- A new explore screen in the tabs area was added; it provides tab two screen.
- A new resetting project logic in the scripts area was added; it provides index, root layout and move directories.
- A new tabs screen was added; it provides home screen.
- A new parallax scroll view component was added; it provides props and parallax scroll view.
- A new themed text component was added; it provides themed text props and themed text.
- A new theme logic in the constants area was added.
- The external library @expo/vector-icons was added (version ^15.0.3).
- The external library @react-navigation/bottom-tabs was added (version ^7.4.0).
- The external library @react-navigation/elements was added (version ^2.6.3).
- The external library @react-navigation/native was added (version ^7.1.8).
- The external library expo was added (version ~54.0.36).
- The external library expo-constants was added (version ~18.0.13).
- The external library expo-font was added (version ~14.0.12).
- The external library expo-haptics was added (version ~15.0.8).
- The external library expo-image was added (version ~3.0.11).
- The external library expo-linking was added (version ~8.0.12).
- The external library expo-router was added (version ~6.0.24).
- The external library expo-splash-screen was added (version ~31.0.13).
- The external library expo-status-bar was added (version ~3.0.9).
- The external library expo-symbols was added (version ~1.0.8).
- The external library expo-system-ui was added (version ~6.0.9).
- The external library expo-web-browser was added (version ~15.0.11).
- The external library react was added (version 19.1.0).
- The external library react-dom was added (version 19.1.0).
- The external library react-native was added (version 0.81.5).
- The external library react-native-gesture-handler was added (version ~2.28.0).
- The external library react-native-worklets was added (version 0.5.1).
- The external library react-native-reanimated was added (version ~4.1.1).
- The external library react-native-safe-area-context was added (version ~5.6.0).
- The external library react-native-screens was added (version ~4.16.0).
- The external library react-native-web was added (version ~0.21.0).
- The development tool @types/react was added (version ~19.1.0).
- The development tool typescript was added (version ~5.9.2).
- The development tool eslint was added (version ^9.25.0).
- The development tool eslint-config-expo was added (version ~10.0.0).
- The start command of the project was added.
- The reset project command of the project was added.
- The android command of the project was added.
- The ios command of the project was added.
- The web command of the project was added.
- The lint command of the project was added.
- A new collapsible component in the screen area was added; it provides collapsible.
- A new icon symbol component in the screen area was added; it provides icon mapping, icon symbol name and icon symbol.
- A new layout screen in the tabs area was added; it provides tab layout.
- A new icon symbol ios component in the screen area was added; it provides icon symbol.
- A new modal screen was added; it provides modal screen.
- A new external link component was added; it provides props and external link; it uses the expo os setting.
- A new layout screen was added; it provides root layout.
- A new shared logic for color scheme web was added; it provides shared logic for color scheme.
- A new shared logic for theme color was added; it provides shared logic for theme color.
- A new hello wave component was added; it provides hello wave.
- A new haptic tab component was added; it provides haptic tab; it uses the expo os setting.
- A new themed view component was added; it provides themed view props and themed view.
- A new eslint configuration was added.
- A new shared logic for color scheme was added.
- 1 dependency lock file was added.
- 3 written documentation files were added.
- 5 settings and data files were added.
- 1 other file was added.
- 10 image files were added in the images area.

### Impact

- Before deploying, the expo os setting must be configured on the server.
- External libraries changed, so they must be installed again and the application rebuilt before deploying.
- Build or deployment settings changed, so the build and the deployment should be checked.

---
