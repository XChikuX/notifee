# react-native-notify-kit comparison

## Scope reviewed

- `marcocrupi/react-native-notify-kit`
- This repo: `XChikuX/notifee`

## High-level comparison

### Things the maintained fork has

- A JS-side FCM convenience flow:
  - `handleFcmMessage(...)`
  - `setFcmConfig(...)`
  - payload parsing/reconstruction helpers
  - exported FCM types
- A smoke app with targeted manual/debug screens.
- Extra server/CLI packaging around its notification workflow.
- A working Jest suite around the FCM helper path.

### Things this repo already does as well or better

- The large validator/API Jest suite is already present here under `tests_react_native/__tests__`.
- The current repo keeps broader integration wiring:
  - Android core build/test scripts
  - React Native Jest coverage
  - Android/iOS E2E commands
- The repo structure is simpler and avoids pulling in extra server/CLI surface area unless it is clearly needed.
- Existing exports such as `PowerManagerInfo` are already in place.

## What was missing here

### Safe to implement

1. **FCM convenience handling in JS**
   - The fork exposes a small pure-JS layer for turning an FCM remote message into a Notifee notification.
   - This does not require new native code and has a low bug surface when covered by tests.

2. **Public FCM helper types**
   - Useful for consumers without forcing a direct dependency on Firebase messaging types.

3. **Build-time type safety around the TurboModule spec**
   - The React Native package TypeScript build was failing because the spec types were too loose for the current JS API usage.

### Not safe to port blindly

1. **Smoke app / manual debug screens**
   - Potentially useful, but they should be evaluated against the current example app and existing E2E approach first.

2. **Server/CLI additions**
   - Bigger product/API decisions, not a low-risk parity change.

3. **Any native-only behavior differences**
   - Should only be ported after reviewing platform semantics and release impact.

## Changes implemented in this branch

- Added JS-only FCM helpers:
  - `handleFcmMessage(...)`
  - `setFcmConfig(...)`
  - FCM payload parsing/reconstruction helpers
  - exported `FcmConfig` and `FcmRemoteMessage` types
- Added focused Jest coverage for the new FCM behavior.
- Updated the TurboModule TypeScript spec so the React Native package build now passes.
- Kept the existing repo behavior where it is already preferable; no server/CLI or smoke-app code was copied over.

## Recommended follow-up

1. Add user-facing docs/examples for the new FCM helper path.
2. Review whether parts of the fork's smoke app should become example app screens instead of a separate app.
3. Reassess server/CLI parity only if there is a concrete maintainer or consumer need.
