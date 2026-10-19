---
title: "Change Documentation — aaziko-inspection-mobile"
---

# Change Documentation — aaziko-inspection-mobile

> Auto-generated on every push, to any branch. Newest entry first. Old entries are never removed.

<!-- AAZIKO-CHANGELOG:INSERT-AFTER -->

## 2026-10-19 16:13 — branch `main`

### Overview

This push to branch `main` changed **2 file(s)**: 2 new, 0 modified, 0 removed (+457 / −0 lines).

Main areas touched: `.aaziko-flow` (1), `.github/workflows` (1).

### New files

#### `.aaziko-flow/changelog.mjs`

*New file — 347 lines*

- Defines: `sh`, `shSafe`, `git`, `esc`, `code`, `list`, `repo`, `declName`, `collect`, `minusSet` and 9 more.
- Uses: `node:child_process`, `node:fs`, `node:path`.
- Reads environment variables: `BEFORE_SHA`, `AFTER_SHA`, `BASE_BRANCH`, `BRANCH`.

**Other new files**

- `.github/workflows/aaziko-changelog.yml` — 110 lines

### Impact

- Code now reads `BEFORE_SHA` — make sure it is set in the `.env` / deployment.
- Code now reads `AFTER_SHA` — make sure it is set in the `.env` / deployment.
- Code now reads `BASE_BRANCH` — make sure it is set in the `.env` / deployment.
- Code now reads `BRANCH` — make sure it is set in the `.env` / deployment.
- Build/deploy configuration changed: `.github/workflows/aaziko-changelog.yml` — re-check the build and deployment.

---

<!-- AAZIKO-CHANGELOG:HISTORY-START -->

> **History before automatic documentation was switched on** — one entry per day of the `main` branch, newest first.

## 2026-09-26 — branch `main` (history)

### Overview

On this day, branch `main` received changes to **1 file(s)**: 1 new, 0 modified, 0 removed (+94 / −0 lines).

Main areas touched: `.github/workflows` (1).

### New files

**Other new files**

- `.github/workflows/backup-to-gitlab.yml` — 94 lines

### Impact

- Build/deploy configuration changed: `.github/workflows/backup-to-gitlab.yml` — re-check the build and deployment.

---

## 2026-08-29 — branch `main` (history)

### Overview

On this day, branch `main` received changes to **59 file(s)**: 30 new, 9 modified, 20 removed (+6770 / −904 lines).

Main areas touched: `app` (12), `components` (12), `lib` (10), `(project root)` (7), `assets/images` (6), `app/(tabs)` (3).

### New files

#### `app/packing.tsx`

*New file — 883 lines*

- Defines: `QueueItem`, `OrderParam`, `fmtDate`, `BoxRow`, `newBox`, `PackingScreen`, `sync`, `mediaCount`, `lastStamp`, `capture`, `updateBox`, `addBox`, `removeBox`, `doRemove`, `makeCtx`, `buildBoxPayload`, `handleScanBox`, `onBoxScanned`, `onSubmit`.
- Uses: `@expo/vector-icons`, `expo-image`, `expo-image-picker`, `expo-router`, `react`, `react-native-safe-area-context`, `@/components/QrScannerModal`, `@/components/QuantitySlider`, `@/lib/inspectionMedia`, `@/lib/captureMeta`, `@/lib/orders`, `@/lib/packing`.

#### `app/orders.tsx`

*New file — 712 lines*

- Defines: `InspectionOrder`, `fmtDate`, `callVendor`, `Notif`, `OrderCard`, `OrdersScreen`, `onLogout`, `confirmLogout`.
- Uses: `@expo/vector-icons`, `expo-image`, `expo-router`, `react`, `react-native-safe-area-context`, `@/components/BoxDetailModal`, `@/components/QrScannerModal`, `@/lib/auth`, `@/lib/inspection`, `@/lib/packing`.

#### `app/detail.tsx`

*New file — 705 lines*

- Defines: `QueueItem`, `OrderParam`, `fmtDate`, `SectionKey`, `OrderDetailScreen`, `firstNonEmpty`, `sync`, `itemsFor`, `addMedia`, `onSubmit`.
- Uses: `@expo/vector-icons`, `expo-image`, `expo-image-picker`, `expo-router`, `react`, `react-native-safe-area-context`, `@/lib/inspectionMedia`, `@/lib/captureMeta`, `@/lib/orders`.

#### `app/documents.tsx`

*New file — 455 lines*

- Defines: `CompletionImage`, `QueueItem`, `OrderParam`, `fmtDate`, `DocumentsScreen`, `sync`, `docCount`, `docStamp`, `takePhoto`, `uploadFile`, `onSubmit`.
- Uses: `@expo/vector-icons`, `expo-document-picker`, `expo-image`, `expo-image-picker`, `expo-router`, `react`, `react-native-safe-area-context`, `@/lib/orders`, `@/lib/captureMeta`.

#### `app/map.tsx`

*New file — 390 lines*

- Defines: `MapOrderParam`, `geoCandidates`, `bad`, `clean`, `countryCode`, `expectedTerms`, `add`, `buildHtml`, `safe`, `show`, `fail`, `matches`, `tryNext`, `buildGoogleHtml`, `initMap`, `place`, `MapScreen`, `openInGoogleMaps`.
- Uses: `@expo/vector-icons`, `expo-image`, `expo-router`, `react-native`, `react-native-safe-area-context`, `@/constants/api`, `@/components/LeafletMap`, `@/lib/orders`.

#### `lib/uploadQueue.ts`

*New file — 340 lines*

- Defines: `QueueStatus`, `QueueItem`, `notify`, `subscribe`, `ensureDir`, `persist`, `loadQueue`, `getItems`, `AssignmentQueueStatus`, `statusForAssignment`, `enqueueCapture`, `isOnline`, `processItem`, `attach`, `processQueue`, `clearDoneForAssignment`, `startConnectivityWatcher`.
- Uses: `@react-native-community/netinfo`, `@react-native-async-storage/async-storage`, `expo-file-system/legacy`, `@/lib/inspection`, `@/lib/inspectionMedia`, `@/lib/captureMeta`.

#### `app/index.tsx`

*New file — 262 lines*

- Defines: `LoginScreen`, `onLogin`.
- Uses: `@expo/vector-icons`, `expo-router`, `react`, `react-native-safe-area-context`, `@/lib/profile`.

#### `app/workdetails.tsx`

*New file — 257 lines*

- Defines: `PickedDoc`, `WorkDetailsScreen`, `pickDocuments`, `onNext`.
- Uses: `@expo/vector-icons`, `expo-document-picker`, `expo-router`, `react`, `react-native-safe-area-context`, `@/lib/profile`.

#### `app/address.tsx`

*New file — 250 lines*

- Defines: `AddressScreen`, `detect`, `onSkip`, `onNext`.
- Uses: `@expo/vector-icons`, `expo-location`, `expo-router`, `react`, `react-native-safe-area-context`, `@/lib/profile`.

#### `lib/auth.ts`

*New file — 230 lines*

- Defines: `saveCredentials`, `getStoredCredentials`, `clearCredentials`, `ServiceProviderUser`, `LoginData`, `LoginResult`, `hasInspectionAccess`, `login`, `reloginWithStoredCredentials`, `getStoredUser`, `getAccessToken`, `refreshAccessToken`, `logout`.
- Uses: `@react-native-async-storage/async-storage`, `expo-secure-store`, `@/constants/api`.

#### `lib/profile.ts`

*New file — 222 lines*

- Defines: `onboardingKey`, `isOnboardingDone`, `markOnboardingDone`, `ContactInfo`, `providerId`, `hasAddress`, `any`, `getContactInfo`, `hasWorkDetails`, `needsAddress`, `nextOnboardingRoute`, `routeAfterAddress`, `saveWorkDetails`, `saveAddress`.
- Uses: `@react-native-async-storage/async-storage`, `@/lib/auth`, `@/lib/http`.

#### `app/completed.tsx`

*New file — 218 lines*

- Defines: `OrderParam`, `fmtDate`, `banner`, `CompletedScreen`.
- Uses: `@expo/vector-icons`, `expo-image`, `expo-router`, `react`, `react-native`, `react-native-safe-area-context`, `@/lib/inspectionMedia`, `@/lib/orders`.

#### `lib/orders.ts`

*New file — 218 lines*

- Defines: `InspectionOrder`, `hasRealLocation`, `bad`, `locationQuery`, `broadLocationQuery`, `isInspectionDone`, `isPendingAssignment`, `OrdersResult`, `pick`, `normalizePhone`, `collectImages`, `mapOrder`, `getInspectionOrders`.
- Uses: `@/lib/auth`, `@/lib/http`.

#### `lib/inspectionMedia.ts`

*New file — 194 lines*

- Defines: `CapturedAsset`, `UploadedMedia`, `guessName`, `guessMime`, `uploadInspectionMedia`, `ProgressImage`, `attachInspectionProgress`, `getInspectionRecord`.
- Uses: `@/constants/api`, `@/lib/auth`, `@/lib/http`.

#### `components/BoxDetailModal.tsx`

*New file — 175 lines*

- Defines: `ScannedBox`, `ScannedOrder`, `Row`, `BoxDetailModal`.
- Code moved here from other files: `Props`.
- Uses: `@expo/vector-icons`.

#### `components/QrScannerModal.tsx`

*New file — 163 lines*

- Defines: `Props`, `QrScannerModal`, `fire`.
- Uses: `@expo/vector-icons`, `expo-camera`, `react`, `react-native`, `react-native-safe-area-context`.

#### `lib/packing.ts`

*New file — 152 lines*

- Defines: `BoxPayload`, `OrderContext`, `SaveBoxResult`, `saveBox`, `deleteBox`, `LookupResult`, `lookupBoxByQr`.
- Uses: `@/lib/http`.

#### `lib/captureMeta.ts`

*New file — 149 lines*

- Defines: `CaptureMeta`, `ensurePermission`, `withTimeout`, `getCaptureMeta`, `formatCapturedAt`, `metaCaptionSuffix`.
- Uses: `expo-location`.

#### `components/AazikoSplash.tsx`

*New file — 124 lines*

- Defines: `AazikoSplash`, `pulse`, `dotStyle`.
- Uses: `react`, `react-native`, `expo-splash-screen`, `../assets/images/aaziko-icon.png`.

#### `components/QuantitySlider.tsx`

*New file — 83 lines*

- Defines: `QuantitySlider`, `clamp`, `setFromX`, `onTouch`.
- Uses: `react`, `react-native`.

#### `lib/inspection.ts`

*New file — 67 lines*

- Defines: `post`, `acknowledgeAssignment`, `declineAssignment`, `startAssignment`, `CompletionImage`, `submitInspection`, `trySubmit`.
- Uses: `@/lib/http`.

#### `app/home.tsx`

*New file — 57 lines*

- Defines: `onLogout`.
- Code moved here from other files: `HomeScreen`.
- Uses: `expo-image`, `expo-router`, `react`, `react-native`, `react-native-safe-area-context`, `@/lib/auth`, `../assets/images/aaziko-icon.png`.

#### `lib/http.ts`

*New file — 48 lines*

- Defines: `authedFetch`, `run`.
- Uses: `@/constants/api`, `@/lib/auth`.

#### `lib/backgroundSync.ts`

*New file — 38 lines*

- Defines: `registerBackgroundSync`.
- Uses: `expo-background-task`, `expo-task-manager`, `@/lib/uploadQueue`.

#### `constants/api.ts`

*New file — 34 lines*

- Data / content file (no functions or components).

#### `components/LeafletMap.tsx`

*New file — 17 lines*

- Defines: `LeafletMap`.
- Uses: `react-native-webview`.

#### `components/LeafletMap.web.tsx`

*New file — 14 lines*

- Defines: `LeafletMap`.
- Uses: `react`.

**Other new files**

- `eas.json` — 30 lines
- `assets/images/aaziko-icon.png` — binary file
- `assets/images/aaziko-logo.png` — binary file

### Changes to existing files

#### `app/_layout.tsx`

*Existing file, modified — +46 / −11 lines*

- Changed the code inside: `RootLayout`.
- Now also uses: `expo-splash-screen`, `react`, `react-native`, `react-native-safe-area-context`, `@/components/AazikoSplash`, `@/lib/backgroundSync`, `@/lib/uploadQueue`.
- No longer uses: `@/hooks/use-color-scheme`.

#### `package.json`

*Existing file, modified — +17 / −6 lines*

- Added package `@react-native-async-storage/async-storage` 2.2.0
- Added package `@react-native-community/netinfo` 11.4.1
- Added package `expo-background-task` ~1.0.10
- Added package `expo-camera` ~17.0.10
- Added package `expo-document-picker` ~14.0.8
- Added package `expo-file-system` ~19.0.24
- Added package `expo-image-picker` ~17.0.11
- Added package `expo-location` ~19.0.8
- Added package `expo-secure-store` ~15.0.8
- Added package `expo-task-manager` ~14.0.9
- Added package `react-native-webview` 13.15.0
- Changed npm script `android`
- Changed npm script `ios`

**Other modified files**

- `package-lock.json` — +176 / −10 lines
- `README.md` — +1 / −50 lines
- `app.json` — +43 / −8 lines
- `assets/images/android-icon-background.png` — binary file
- `assets/images/android-icon-foreground.png` — binary file
- `assets/images/android-icon-monochrome.png` — binary file
- `assets/images/icon.png` — binary file

### Removed files

#### `app/(tabs)/explore.tsx`

*Removed file — 112 lines removed*

- It defined: `TabTwoScreen`.

#### `scripts/reset-project.js`

*Removed file — 112 lines removed*

- It defined: `Index`, `RootLayout`, `moveDirectories`.

#### `app/(tabs)/index.tsx`

*Removed file — 98 lines removed*


#### `components/parallax-scroll-view.tsx`

*Removed file — 79 lines removed*

- It defined: `ParallaxScrollView`.

#### `components/themed-text.tsx`

*Removed file — 60 lines removed*

- It defined: `ThemedTextProps`, `ThemedText`.

#### `constants/theme.ts`

*Removed file — 53 lines removed*


#### `components/ui/collapsible.tsx`

*Removed file — 45 lines removed*

- It defined: `Collapsible`.

#### `components/ui/icon-symbol.tsx`

*Removed file — 41 lines removed*

- It defined: `IconMapping`, `IconSymbolName`, `IconSymbol`.

#### `app/(tabs)/_layout.tsx`

*Removed file — 35 lines removed*

- It defined: `TabLayout`.

#### `components/ui/icon-symbol.ios.tsx`

*Removed file — 32 lines removed*

- It defined: `IconSymbol`.

#### `app/modal.tsx`

*Removed file — 29 lines removed*

- It defined: `ModalScreen`.

#### `components/external-link.tsx`

*Removed file — 25 lines removed*

- It defined: `ExternalLink`.

#### `hooks/use-color-scheme.web.ts`

*Removed file — 21 lines removed*

- It defined: `useColorScheme`.

#### `hooks/use-theme-color.ts`

*Removed file — 21 lines removed*

- It defined: `useThemeColor`.

#### `components/hello-wave.tsx`

*Removed file — 19 lines removed*

- It defined: `HelloWave`.

#### `components/haptic-tab.tsx`

*Removed file — 18 lines removed*

- It defined: `HapticTab`.

#### `components/themed-view.tsx`

*Removed file — 14 lines removed*

- It defined: `ThemedViewProps`, `ThemedView`.

#### `hooks/use-color-scheme.ts`

*Removed file — 1 lines removed*


**Other removed files**

- `AGENTS.md` — 3 lines removed
- `CLAUDE.md` — 1 lines removed

### Impact

- Dependencies changed in `package.json` — run `npm install` and rebuild the Docker image before deploying.

---

## 2026-08-21 — branch `main` (history)

### Overview

On this day, branch `main` received changes to **41 file(s)**: 41 new, 0 modified, 0 removed (+14162 / −0 lines).

Main areas touched: `assets/images` (10), `(project root)` (9), `components` (6), `app/(tabs)` (3), `components/ui` (3), `hooks` (3).

### New files

#### `app/(tabs)/explore.tsx`

*New file — 112 lines*

- Defines: `TabTwoScreen`.
- Uses: `expo-image`, `react-native`, `@/components/ui/collapsible`, `@/components/external-link`, `@/components/parallax-scroll-view`, `@/components/themed-text`, `@/components/themed-view`, `@/components/ui/icon-symbol`, `@/constants/theme`, `@/assets/images/react-logo.png`.

#### `scripts/reset-project.js`

*New file — 112 lines*

- Defines: `Index`, `RootLayout`, `moveDirectories`.
- Uses: `fs`, `path`, `readline`.

#### `app/(tabs)/index.tsx`

*New file — 98 lines*

- Defines: `HomeScreen`.
- Uses: `expo-image`, `react-native`, `@/components/hello-wave`, `@/components/parallax-scroll-view`, `@/components/themed-text`, `@/components/themed-view`, `expo-router`, `@/assets/images/partial-react-logo.png`.

#### `components/parallax-scroll-view.tsx`

*New file — 79 lines*

- Defines: `Props`, `ParallaxScrollView`.
- Uses: `react`, `react-native`, `@/components/themed-view`, `@/hooks/use-color-scheme`, `@/hooks/use-theme-color`.

#### `components/themed-text.tsx`

*New file — 60 lines*

- Defines: `ThemedTextProps`, `ThemedText`.
- Uses: `react-native`, `@/hooks/use-theme-color`.

#### `constants/theme.ts`

*New file — 53 lines*

- Uses: `react-native`.

#### `package.json`

*New file — 47 lines*

- Added package `@expo/vector-icons` ^15.0.3
- Added package `@react-navigation/bottom-tabs` ^7.4.0
- Added package `@react-navigation/elements` ^2.6.3
- Added package `@react-navigation/native` ^7.1.8
- Added package `expo` ~54.0.36
- Added package `expo-constants` ~18.0.13
- Added package `expo-font` ~14.0.12
- Added package `expo-haptics` ~15.0.8
- Added package `expo-image` ~3.0.11
- Added package `expo-linking` ~8.0.12
- Added package `expo-router` ~6.0.24
- Added package `expo-splash-screen` ~31.0.13
- Added package `expo-status-bar` ~3.0.9
- Added package `expo-symbols` ~1.0.8
- Added package `expo-system-ui` ~6.0.9
- Added package `expo-web-browser` ~15.0.11
- Added package `react` 19.1.0
- Added package `react-dom` 19.1.0
- Added package `react-native` 0.81.5
- Added package `react-native-gesture-handler` ~2.28.0
- Added package `react-native-worklets` 0.5.1
- Added package `react-native-reanimated` ~4.1.1
- Added package `react-native-safe-area-context` ~5.6.0
- Added package `react-native-screens` ~4.16.0
- Added package `react-native-web` ~0.21.0
- Added package `@types/react` ~19.1.0
- Added package `typescript` ~5.9.2
- Added package `eslint` ^9.25.0
- Added package `eslint-config-expo` ~10.0.0
- Added npm script `start`
- Added npm script `reset-project`
- Added npm script `android`
- Added npm script `ios`
- Added npm script `web`
- Added npm script `lint`

#### `components/ui/collapsible.tsx`

*New file — 45 lines*

- Defines: `Collapsible`.
- Uses: `react`, `react-native`, `@/components/themed-text`, `@/components/themed-view`, `@/components/ui/icon-symbol`, `@/constants/theme`, `@/hooks/use-color-scheme`.

#### `components/ui/icon-symbol.tsx`

*New file — 41 lines*

- Defines: `IconMapping`, `IconSymbolName`, `IconSymbol`.
- Uses: `@expo/vector-icons/MaterialIcons`, `expo-symbols`, `react`, `react-native`.

#### `app/(tabs)/_layout.tsx`

*New file — 35 lines*

- Defines: `TabLayout`.
- Uses: `expo-router`, `react`, `@/components/haptic-tab`, `@/components/ui/icon-symbol`, `@/constants/theme`, `@/hooks/use-color-scheme`.

#### `components/ui/icon-symbol.ios.tsx`

*New file — 32 lines*

- Defines: `IconSymbol`.
- Uses: `expo-symbols`, `react-native`.

#### `app/modal.tsx`

*New file — 29 lines*

- Defines: `ModalScreen`.
- Uses: `expo-router`, `react-native`, `@/components/themed-text`, `@/components/themed-view`.

#### `components/external-link.tsx`

*New file — 25 lines*

- Defines: `Props`, `ExternalLink`.
- Uses: `expo-router`, `expo-web-browser`, `react`.
- Reads environment variables: `EXPO_OS`.

#### `app/_layout.tsx`

*New file — 24 lines*

- Defines: `RootLayout`.
- Uses: `@react-navigation/native`, `expo-router`, `expo-status-bar`, `react-native-reanimated`, `@/hooks/use-color-scheme`.

#### `hooks/use-color-scheme.web.ts`

*New file — 21 lines*

- Defines: `useColorScheme`.
- Uses: `react`, `react-native`.

#### `hooks/use-theme-color.ts`

*New file — 21 lines*

- Defines: `useThemeColor`.
- Uses: `@/constants/theme`, `@/hooks/use-color-scheme`.

#### `components/hello-wave.tsx`

*New file — 19 lines*

- Defines: `HelloWave`.
- Uses: `react-native-reanimated`.

#### `components/haptic-tab.tsx`

*New file — 18 lines*

- Defines: `HapticTab`.
- Uses: `@react-navigation/bottom-tabs`, `@react-navigation/elements`, `expo-haptics`.
- Reads environment variables: `EXPO_OS`.

#### `components/themed-view.tsx`

*New file — 14 lines*

- Defines: `ThemedViewProps`, `ThemedView`.
- Uses: `react-native`, `@/hooks/use-theme-color`.

#### `eslint.config.js`

*New file — 10 lines*

- Uses: `eslint/config`, `eslint-config-expo/flat`.

#### `hooks/use-color-scheme.ts`

*New file — 1 lines*

- Data / content file (no functions or components).

**Other new files**

- `package-lock.json` — 13091 lines
- `README.md` — 50 lines
- `app.json` — 48 lines
- `.gitignore` — 43 lines
- `tsconfig.json` — 17 lines
- `.vscode/settings.json` — 7 lines
- `.claude/settings.json` — 5 lines
- `AGENTS.md` — 3 lines
- `.vscode/extensions.json` — 1 lines
- `CLAUDE.md` — 1 lines
- `assets/images/android-icon-background.png` — binary file
- `assets/images/android-icon-foreground.png` — binary file
- `assets/images/android-icon-monochrome.png` — binary file
- `assets/images/favicon.png` — binary file
- `assets/images/icon.png` — binary file
- `assets/images/partial-react-logo.png` — binary file
- `assets/images/react-logo.png` — binary file
- `assets/images/react-logo@2x.png` — binary file
- `assets/images/react-logo@3x.png` — binary file
- `assets/images/splash-icon.png` — binary file

### Impact

- Dependencies changed in `package.json` — run `npm install` and rebuild the Docker image before deploying.
- Code now reads `EXPO_OS` — make sure it is set in the `.env` / deployment.
- Build/deploy configuration changed: `tsconfig.json` — re-check the build and deployment.

---
