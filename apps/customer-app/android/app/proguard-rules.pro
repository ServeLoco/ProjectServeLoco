# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# expo-modules-core: background (headless) tasks such as the rider location
# task start the app through a loader class named in expo's manifest
# (org.unimodules.core.AppLoader#react-native-headless) and created by name
# with Class.forName. R8 renamed it, the lookup came back empty, and
# expo-task-manager's TaskService crashed on every background location update.
# Mirrored in app.json (expo-build-properties extraProguardRules).
-keep class expo.modules.adapters.react.apploader.** { *; }

# Add any project specific keep options here:
