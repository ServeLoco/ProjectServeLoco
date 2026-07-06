import React from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import CustomerNavigator from './CustomerNavigator';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { OfflineBanner } from '../components';

/**
 * Shared navigation ref — used by useLocalNotifications to navigate
 * when the user taps a phone notification.
 */
export const navigationRef = createNavigationContainerRef();

/**
 * RootNavigator
 * Customer app shell. Management tools live in the separate web project.
 */
export default function RootNavigator() {
  const { isReachable, isDeviceOffline } = useNetworkStatus();
  const showOffline = !isReachable;
  const message = isDeviceOffline
    ? 'You appear to be offline.'
    : "Can't reach the server. Retrying…";

  return (
    <>
      <OfflineBanner visible={showOffline} message={message} />
      <NavigationContainer ref={navigationRef}>
        <CustomerNavigator />
      </NavigationContainer>
    </>
  );
}
