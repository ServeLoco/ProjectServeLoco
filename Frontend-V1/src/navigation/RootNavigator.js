import React from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import CustomerNavigator from './CustomerNavigator';

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
  return (
    <NavigationContainer ref={navigationRef}>
      <CustomerNavigator />
    </NavigationContainer>
  );
}
