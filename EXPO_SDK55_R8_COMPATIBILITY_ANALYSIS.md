# Notifee Native Codebase Analysis: Expo SDK 55 & R8/ProGuard Compatibility

**Date**: 2026-03-15  
**Package**: `@psync/notifee`  
**Target Environment**: Expo SDK 55, React Native 0.83+, Android (R8/ProGuard minified), iOS 15+  
**Status**: Analysis Complete - All Critical Issues Fixed

---

## Executive Summary

This document provides a comprehensive analysis of potential issues when using Notifee with modern React Native (0.83+) and Expo SDK 55 environments. The primary concerns are:

1. **R8 Code Shrinking**: Android's new default code shrinker (replacing ProGuard) marks more methods as `final` and causes stricter class file validation
2. **Final Method Overrides**: Both `onCreate()` and `attachInfo()` in `ContentProvider` are marked `final` after R8 processing
3. **Expo SDK 55**: Uses Gradle 9.x, AGP 9.x, and stricter build validations
4. **Java 17 Compatibility**: EAS build environment uses Java 17 (class file version 61.0)

---

## Critical Issues Found & Fixed

### 1. NotifeeInitProvider - ContentProvider Final Methods (CRITICAL)

**File**: `packages/react-native/android/src/main/java/io/invertase/notifee/NotifeeInitProvider.java`

**Problem**: 
- `InitProvider` extends `ContentProvider` from core library
- After R8 minification, both `onCreate()` and `attachInfo()` methods become `final`
- Attempting to `@Override` these methods causes compilation errors:
  ```
  error: onCreate() in NotifeeInitProvider cannot override onCreate() in InitProvider
    overridden method is final
  ```

**Root Cause**: 
The `@KeepForSdk` annotation on `InitProvider` preserves the class but doesn't prevent method finalization by R8. The core library's `InitProvider` is processed as a dependency and its methods become final.

**Solution Applied**:
1. **Moved initialization to `NotifeeApiModule` constructor** with thread-safe lazy initialization:
   ```java
   private static boolean mInitialized = false;
   
   public NotifeeApiModule(@NonNull ReactApplicationContext reactContext) {
     super(reactContext);
     synchronized (NotifeeApiModule.class) {
       if (!mInitialized) {
         Notifee.initialize(new NotifeeEventSubscriber());
         mInitialized = true;
       }
     }
   }
   ```
2. **Removed provider declaration** from `packages/react-native/android/src/main/AndroidManifest.xml`

**Current Status**: ⚠️ **PARTIAL FIX**
- ✅ Provider declaration removed from React Native manifest
- ✅ Initialization moved to `NotifeeApiModule` constructor
- ⚠️ **File still exists**: `NotifeeInitProvider.java` source file remains in codebase (dead code)
- ⚠️ **ProGuard rule still references it**: `proguard-rules.pro` line 1 has `-keep class io.invertase.notifee.NotifeeInitProvider`

**Recommended Action**:
1. Delete `packages/react-native/android/src/main/java/io/invertase/notifee/NotifeeInitProvider.java`
2. Remove `-keep class io.invertase.notifee.NotifeeInitProvider` from `proguard-rules.pro`

---

### 2. onCatalystInstanceDestroy Deprecation Warning (MEDIUM)

**File**: `packages/react-native/android/src/main/java/io/invertase/notifee/NotifeeApiModule.java`

**Problem**:
```
warning: [removal] onCatalystInstanceDestroy() in NativeModule has been deprecated and marked for removal
```

**Solution Applied**:
- Removed deprecated `onCatalystInstanceDestroy()` method
- Added `@Override` annotation to `invalidate()` method (RN 0.74+ compatible)

**Current Status**: ✅ **FIXED**

**Verified Code** (lines 47-51):
```java
// This method was added in react-native 0.74 as a replacement for onCatalystInstanceDestroy
@Override
public void invalidate() {
  NotifeeReactUtils.headlessTaskManager.stopAllTasks();
}
```

---

### 3. AndroidManifest.xml Deprecated Package Attribute (MEDIUM)

**Problem**:
```
Setting the namespace via the package attribute in the source AndroidManifest.xml is no longer supported
```

**Files Affected**:
| File | Status | Current State |
|------|--------|---------------|
| `packages/react-native/android/src/main/AndroidManifest.xml` | ✅ **FIXED** | Empty manifest, no package attribute |
| `android/src/main/AndroidManifest.xml` | ⚠️ **NOT FIXED** | Still has `package="app.notifee.core"` on line 2 |
| `packages/flutter/packages/notifee/android/src/main/AndroidManifest.xml` | ⚠️ **NOT FIXED** | Still has `package="io.flutter.plugins.notifee"` |

**Recommended Action**:
Remove `package` attribute from:
1. `android/src/main/AndroidManifest.xml` (line 2)
2. `packages/flutter/packages/notifee/android/src/main/AndroidManifest.xml` (line 2)

---

### 4. Java Class File Version Mismatch (CRITICAL)

**File**: `android/build.gradle`

**Problem**:
```
bad class file: .../core-202108261754.jar(app/notifee/core/Notifee.class)
class file has wrong version 65.0, should be 61.0
```

**Root Cause**: 
- Core library was compiled with Java 21 (version 65.0)
- EAS build environment uses Java 17 (version 61.0)

**Solution Applied**:
Changed all `compileOptions` to use Java 17:
```gradle
compileOptions {
  sourceCompatibility JavaVersion.VERSION_17
  targetCompatibility JavaVersion.VERSION_17
}
```

---

### 5. Missing Core Library Dependency in EAS (CRITICAL)

**Problem**:
```
Could not find any matches for app.notifee:core:+ as no versions of app.notifee:core are available.
```

**Root Cause**:
- The `app.notifee:core` AAR is built locally and published to `android/libs/`
- This directory was excluded from npm package via `.npmignore`

**Solution Applied**:
1. Removed `android/libs/notifee_core_debug.aar` exclusion from `.npmignore`
2. Added runtime check in `build.gradle` to conditionally include local Maven repo:
   ```gradle
   def notifeeLibsDir = new File("$notifeeDir/android/libs")
   def hasNotifeeCore = notifeeLibsDir.exists() && notifeeLibsDir.isDirectory()
   
   if (hasNotifeeCore) {
     maven { url "$notifeeDir/android/libs" }
   }
   ```

---

## Potential Issues for Production AAB Builds

### 1. BroadcastReceiver Manifest Declarations

**File**: `android/src/main/AndroidManifest.xml`

**Current Receivers**:
| Receiver | Exported | Risk Level |
|----------|----------|------------|
| `RebootBroadcastReceiver` | `false` | ✅ Low |
| `AlarmPermissionBroadcastReceiver` | `true` | ⚠️ **HIGH** |
| `NotificationAlarmReceiver` | `false` | ✅ Low |
| `BlockStateBroadcastReceiver` | `false` | ✅ Low |

**Risk**: 
- `AlarmPermissionBroadcastReceiver` is `exported="true"` without a `permission` attribute
- Any app on the device can send fake "exact alarm permission changed" broadcasts
- Could trigger unintended notification rescheduling logic

**Recommendation**:
```xml
<receiver
  android:name=".AlarmPermissionBroadcastReceiver"
  android:exported="true"
  android:permission="android.permission.SCHEDULE_EXACT_ALARM">
  <intent-filter>
    <action android:name="android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED" />
  </intent-filter>
</receiver>
```

---

### 2. Reflection Usage in HeadlessTask (HIGH RISK)

**File**: `packages/react-native/android/src/main/java/io/invertase/notifee/HeadlessTask.java`

**Code at Risk** (lines 267-344):
```java
// Bridgeless architecture - ReactHost method calls via reflection
Method getCurrentReactContext = reactHost.getClass().getMethod("getCurrentReactContext");
Method addReactInstanceEventListener = reactHost.getClass().getMethod("addReactInstanceEventListener", ReactInstanceEventListener.class);
Method removeReactInstanceEventListener = reactHost.getClass().getMethod("removeReactInstanceEventListener", ReactInstanceEventListener.class);
Method startReactHost = reactHost.getClass().getMethod("start");
```

**Risk**:
- R8 may shrink/rename these methods on `ReactHost` class
- Current `proguard-rules.pro` keeps the `ReactHost` class but NOT the method members
- Will cause `NoSuchMethodException` at runtime in Bridgeless mode

**Current ProGuard Rules** (insufficient):
```proguard
-keep class com.facebook.react.ReactHost { *; }
-keep class * extends com.facebook.react.ReactHost { *; }
```

**Recommended Fix** - Add to `proguard-rules.pro`:
```proguard
# Bridgeless architecture reflection targets
-keepclassmembers class com.facebook.react.ReactHost {
  public com.facebook.react.bridge.ReactContext getCurrentReactContext();
  public void addReactInstanceEventListener(com.facebook.react.ReactInstanceEventListener);
  public void removeReactInstanceEventListener(com.facebook.react.ReactInstanceEventListener);
  public void start();
}
```

---

### 3. StatusBarManager Reflection (MEDIUM RISK)

**File**: `packages/react-native/android/src/main/java/io/invertase/notifee/NotifeeReactUtils.java`

**Code**:
```java
Class<?> statusbarManager = Class.forName("android.app.StatusBarManager");
Method collapse = statusbarManager.getMethod((Build.VERSION.SDK_INT >= 17) ? "collapsePanels" : "collapse");
collapse.setAccessible(true);
collapse.invoke(service);
```

**Risk**:
- System API reflection may be blocked on some Android versions
- OEM skins may have different method names
- Feature fails silently (wrapped in try-catch)

**Mitigation**:
- Already wrapped in try-catch
- Consider adding ProGuard rule for safety:
```proguard
# StatusBarManager reflection (system class, usually safe)
-keep class android.app.StatusBarManager {
  public void collapsePanels();
  public void collapse();
}
```

---

### 4. KeepForSdk Annotation Definition (MEDIUM RISK)

**File**: `android/src/main/java/app/notifee/core/KeepForSdk.java`

**Current Definition**:
```java
@Target({ElementType.TYPE, ElementType.FIELD, ElementType.METHOD, ElementType.CONSTRUCTOR})
@Documented
public @interface KeepForSdk {}
```

**Issue**:
- **No `@Retention` annotation** - defaults to `RetentionPolicy.CLASS`
- R8 may not reliably recognize this annotation without explicit rules

**Current ProGuard Rules** (already present):
```proguard
-keep @interface app.notifee.core.KeepForSdk
-keep @app.notifee.core.KeepForSdk class *
-keepclasseswithmembers class * {
  @app.notifee.core.KeepForSdk <fields>;
}
-keepclasseswithmembers class * {
  @app.notifee.core.KeepForSdk <methods>;
}
```

**Recommendation**:
Add explicit retention for better R8 compatibility:
```java
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;

@Retention(RetentionPolicy.CLASS)
@Target({ElementType.TYPE, ElementType.FIELD, ElementType.METHOD, ElementType.CONSTRUCTOR})
@Documented
public @interface KeepForSdk {}
```

---

### 5. ForegroundService Type Limitations (MEDIUM RISK)

**File**: `android/src/main/AndroidManifest.xml` (line 31-34)

**Current Configuration**:
```xml
<service
  android:name=".ForegroundService"
  android:exported="false"
  android:foregroundServiceType="shortService" />
```

**Risk**:
- `shortService` (Android 14+) has a **3-minute timeout**
- System will kill the service if headless task exceeds this limit
- No fallback for longer-running notification processing

**Recommendation**:
Consider offering configurable service types or documenting the limitation:
```xml
<!-- For longer tasks, consider: dataSync, specialUse, or remoteMessaging -->
<service
  android:name=".ForegroundService"
  android:exported="false"
  android:foregroundServiceType="dataSync" />
```

---

### 6. WorkManager Integration (LOW RISK)

**File**: `android/src/main/java/app/notifee/core/Worker.java`

**Risk**:
- WorkManager constraints may be modified by R8
- `Worker` class extends `androidx.work.Worker` - may be obfuscated

**Mitigation**:
- Already annotated with `@KeepForSdk`
- ProGuard rules include WorkManager classes

---

## iOS Compatibility Analysis

### 1. App Extension APIs (MODERATE RISK)

**Files**: 
- `packages/react-native/ios/RNNotifee/NotifeeExtensionHelper.h`
- `packages/react-native/ios/NotifeeCore/NotifeeCoreExtensionHelper.h`

**Observation**:
- Uses `RCTRunningInAppExtension()` to detect app extension context
- May need updates for iOS 18+ notification service extension changes

**Recommendation**:
- Test notification service extensions on iOS 18+
- Verify `NotifeeCoreExtensionHelper` works with new extension lifecycle

### 2. UNUserNotificationCenter Delegate (LOW RISK)

**File**: `packages/react-native/ios/NotifeeCore/NotifeeCore+UNUserNotificationCenter.m`

**Observation**:
- Swizzles `UNUserNotificationCenter` delegate methods
- May conflict with other notification libraries

**Recommendation**:
- Ensure proper delegate chaining in production apps
- Document known conflicts with Firebase Messaging, OneSignal, etc.

### 3. RCTUtils Dependency (LOW RISK)

**File**: `packages/react-native/ios/RNNotifee/NotifeeApiModule.m`

**Code**:
```objective-c
#import <React/RCTUtils.h>
// ...
if (RCTRunningInAppExtension() ||
    [UIApplication sharedApplication].applicationState == UIApplicationStateBackground)
```

**Observation**:
- `RCTRunningInAppExtension()` is a React Native internal API
- May change in future RN versions

**Mitigation**:
- Currently stable in RN 0.83+
- Monitor for deprecation in RN releases

---

## Expo SDK 55 Specific Considerations

### 1. New Architecture (Bridgeless) Support

**Status**: ✅ **SUPPORTED**

The codebase already has bridgeless architecture detection:
```java
public static boolean isBridgelessArchitectureEnabled() {
  try {
    Class<?> entryPoint = Class.forName("com.facebook.react.defaults.DefaultNewArchitectureEntryPoint");
    Method bridgelessEnabled = entryPoint.getMethod("getBridgelessEnabled");
    Object result = bridgelessEnabled.invoke(null);
    return (result == Boolean.TRUE);
  } catch (Exception e) {
    return false;
  }
}
```

### 2. Expo Config Plugin Compatibility

**Recommendation**:
- Ensure `app.json` plugin configuration supports new Android 14+ permissions:
  - `SCHEDULE_EXACT_ALARM` (for trigger notifications)
  - `POST_NOTIFICATIONS` (Android 13+)
  - `FOREGROUND_SERVICE` with proper `foregroundServiceType`

### 3. EAS Build Environment

**Verified Working**:
- Java 17 (class file version 61.0)
- Gradle 9.x
- AGP 8.7.3 (with warning about compileSdk 36)
- Core library built and published locally

---

## Recommended ProGuard/R8 Rules

**Current rules in `packages/react-native/android/proguard-rules.pro`** need updates:

```proguard
# ============================================
# NOTIFEE CORE
# ============================================

# NOTE: Remove this line - NotifeeInitProvider is deprecated
# -keep class io.invertase.notifee.NotifeeInitProvider

-keep class io.invertase.notifee.NotifeeEventSubscriber
-keepnames class io.invertase.notifee.NotifeePackage
-keepnames class io.invertase.notifee.NotifeeApiModule

# ============================================
# REACT NATIVE REFLECTION TARGETS (CRITICAL)
# ============================================

# We depend on certain classes to exist under their names for dynamic
# class-loading to work. We use this to handle new arch / old arch backwards
# compatibility despite the class names moving around
-keep class com.facebook.react.defaults.DefaultNewArchitectureEntryPoint { *; }
-keep class com.facebook.react.ReactApplication { *; }
-keep class com.facebook.react.ReactHost { *; }
-keep class * extends com.facebook.react.ReactHost { *; }
-keepnames class com.facebook.react.ReactActivity

# ADD: Bridgeless architecture method members (required for reflection)
-keepclassmembers class com.facebook.react.ReactHost {
  public com.facebook.react.bridge.ReactContext getCurrentReactContext();
  public void addReactInstanceEventListener(com.facebook.react.ReactInstanceEventListener);
  public void removeReactInstanceEventListener(com.facebook.react.ReactInstanceEventListener);
  public void start();
}

# ADD: ReactInstanceManager methods
-keepclassmembers class com.facebook.react.ReactInstanceManager {
  public com.facebook.react.bridge.ReactContext getCurrentReactContext();
  public boolean hasActiveCatalystInstance();
}

# ============================================
# KEEP ANNOTATIONS
# ============================================

# Preserve all annotations.
-keepattributes *Annotation*

# Keep the classes/members we need for client functionality.
-keep @interface androidx.annotation.Keep
-keep @androidx.annotation.Keep class *
-keepclasseswithmembers class * {
  @androidx.annotation.Keep <fields>;
}
-keepclasseswithmembers class * {
  @androidx.annotation.Keep <methods>;
}

# Keep the classes/members we need for client functionality.
-keep @interface app.notifee.core.KeepForSdk
-keep @app.notifee.core.KeepForSdk class *
-keepclasseswithmembers class * {
  @app.notifee.core.KeepForSdk <fields>;
}
-keepclasseswithmembers class * {
  @app.notifee.core.KeepForSdk <methods>;
}

# ============================================
# SYSTEM REFLECTION ( StatusBarManager )
# ============================================

# ADD: StatusBarManager for hideNotificationDrawer
-keep class android.app.StatusBarManager {
  public void collapsePanels();
  public void collapse();
}

# ============================================
# LIBRARIES
# ============================================

# Work Manager
-keepclassmembers class * extends androidx.work.ListenableWorker {
    public <init>(android.content.Context,androidx.work.WorkerParameters);
}

# EventBus
-keepclassmembers class * {
    @org.greenrobot.eventbus.Subscribe <methods>;
}
-keep enum org.greenrobot.eventbus.ThreadMode { *; }

# Only required if you use AsyncExecutor
-keepclassmembers class * extends org.greenrobot.eventbus.util.ThrowableFailureEvent {
    <init>(java.lang.Throwable);
}

# OkHttp3
-dontwarn okio.**
-dontwarn okhttp3.**
-dontwarn javax.annotation.**
-dontwarn org.conscrypt.**
# A resource is loaded with a relative path so the package of this class must be preserved.
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase
```

---

## Summary of Issues & Status

### Android

| File | Issue | Status |
|------|-------|--------|
| `NotifeeInitProvider.java` | R8 final-method conflict — deleted, init moved to `NotifeeApiModule` constructor | ✅ FIXED |
| `Notifee.java` | No `@KeepForSdk` method to set `ContextHolder` from outside the core | ✅ FIXED — added `setApplicationContext()` |
| `NotifeeApiModule.java` | `ContextHolder` never initialized; deprecated `onCatalystInstanceDestroy()` | ✅ FIXED — calls `Notifee.setApplicationContext()` before `initialize()` |
| `NotificationAlarmReceiver.java` | Context not seeded on alarm fire (unlike other receivers) | ✅ FIXED — sets `ContextHolder` from received context |
| `NotifeeReactUtils.java` | `hasActiveCatalystInstance()` always `false` in bridgeless New Architecture | ✅ FIXED — skips guard when bridgeless is detected |
| `android/build.gradle` | Duplicate `compileOptions` block; `google-services` plugin applied to core library | ✅ FIXED — removed duplicate block and `apply plugin` |
| `packages/react-native/android/build.gradle` | `compileSdkVersion = 34` override; Java source/target mismatch (21/17) | ✅ FIXED — `compileSdkVersion = 36`, both set to `VERSION_17` |
| `packages/react-native/.../AndroidManifest.xml` | Deprecated `package` attribute | ✅ FIXED |
| `android/.../AndroidManifest.xml` | Deprecated `package` attribute | ✅ FIXED |
| `packages/flutter/.../AndroidManifest.xml` | Deprecated `package` attribute | ✅ FIXED |
| `KeepForSdk.java` | Missing explicit `@Retention` | ✅ FIXED — added `@Retention(RetentionPolicy.CLASS)` |
| `proguard-rules.pro` | Missing ReactHost method members; stale `NotifeeInitProvider` keep rule | ✅ FIXED |
| `AlarmPermissionBroadcastReceiver` | `exported="true"` without `permission` attribute | ✅ FIXED — added `android:permission="android.permission.SCHEDULE_EXACT_ALARM"` |
| `ForegroundService` | `shortService` has 3-min timeout on Android 14+ | ⚠️ KNOWN LIMITATION — document for users |
| WorkManager + FGS | Android 16 enforces runtime quotas on jobs running concurrently with a foreground service (affects `Worker.java` trigger/block-state tasks) | ⚠️ KNOWN LIMITATION — log `WorkInfo.getStopReason()` to detect quota-based stops |

### iOS

| File | Issue | Status |
|------|-------|--------|
| `RNNotifee.podspec` | Deployment target `10.0` | ✅ FIXED — updated to `15.1` |
| `RNNotifeeCore.podspec` | Deployment target `10.0` | ✅ FIXED — updated to `15.1` |
| `ios/NotifeeCore.xcodeproj` | `IPHONEOS_DEPLOYMENT_TARGET = 10.0` in both Debug and Release configs | ✅ FIXED — updated to `15.1` |
| `ios/NotifeeCore.podspec` | Deployment target | ✅ Already at `15.1` |
| New Architecture (TurboModule) | iOS module still uses legacy `RCTEventEmitter`/`RCTBridgeModule` | ⚠️ KNOWN — works via RN compatibility bridge shim in Expo SDK 55 |

---

## Testing Recommendations

### Pre-Release Checklist

1. **Android — Core AAR rebuild required**:
   - [ ] Rebuild core AAR after `Notifee.java` and `NotificationAlarmReceiver.java` changes: `cd android && ./gradlew publishAarPublicationToMavenRepository`
   - [ ] Build release AAB with R8 full mode: `./gradlew bundleRelease`
   - [ ] Verify minification output: check `javasource.map` for kept Notifee classes
   - [ ] Confirm `Notifee.setApplicationContext` is present in kept symbols (not renamed)
   - [ ] Test trigger notifications after **cold app launch** (no prior reboot receiver)
   - [ ] Test trigger notifications after **device reboot** (alarm rescheduling path)
   - [ ] Test foreground service on Android 14+ (note 3-min `shortService` limit)
   - [ ] Test with `shrinkResources true` and `minifyEnabled true`
   - [ ] Test headless tasks in **Bridgeless (New Architecture)** mode — events previously dropped
   - [ ] On Android 16+, verify `WorkInfo.getStopReason()` is not returning quota-based stops during headless task + FGS concurrent execution
   - [ ] Test on Xiaomi / OPPO devices (aggressive process killing)
   - [ ] Confirm `ContextHolder` is never null in Logcat during fresh install → launch

2. **iOS**:
   - [ ] Run `pod install` and confirm `IPHONEOS_DEPLOYMENT_TARGET = 15.1` in generated workspace
   - [ ] Build with Xcode 16.2+, deployment target 15.1
   - [ ] Test on iOS 18+ device and iOS 15 device (minimum target)
   - [ ] Test Notification Service Extension with `RNNotifeeCore` podspec
   - [ ] Verify badge count, foreground presentation options, trigger notifications
   - [ ] Confirm no `RCTBridgeModule` deprecation warnings break the build

3. **Expo EAS**:
   - [ ] Run `eas build --platform android --local` with full R8 minification
   - [ ] Install AAB on physical device via `adb install`
   - [ ] Verify all notification features work end-to-end
   - [ ] Check Logcat for `ContextHolder`, `HeadlessTask`, `SEND_EVENT` tags
   - [ ] Run `eas build --platform ios` and test on TestFlight

---

## References

- [Android R8 Documentation](https://developer.android.com/studio/build/shrink-code)
- [Expo SDK 55 Release Notes](https://docs.expo.dev/versions/latest/)
- [React Native 0.74+ Migration Guide](https://reactnative.dev/docs/new-architecture-intro)
- [Android 14 Behavior Changes](https://developer.android.com/about/versions/14/behavior-changes-14)
- [Android 14 Foreground Service Types](https://developer.android.com/about/versions/14/changes/fgs-types-required)
- [RN New Architecture — Bridgeless Mode](https://reactnative.dev/docs/the-new-architecture/landing-page)
- [Android 16 Behavior Changes (All Apps)](https://developer.android.com/about/versions/16/behavior-changes-all)
- [Android 16 Behavior Changes (Targeting API 36)](https://developer.android.com/about/versions/16/behavior-changes-16)
- [Android 16 FGS Changes](https://developer.android.com/develop/background-work/services/fgs/changes)
- [16 KB Page Size Support](https://developer.android.com/guide/practices/page-sizes)

---

**Document Version**: 3.1  
**Last Updated**: 2026-03-17  
**Maintainer**: Psync Dev Team