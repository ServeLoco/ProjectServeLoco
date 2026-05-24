import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import CustomerNavigator from './CustomerNavigator';

/**
 * RootNavigator
 * Customer app shell. Management tools live in the separate web project.
 */
export default function RootNavigator() {
  return (
    <NavigationContainer>
      <CustomerNavigator />
    </NavigationContainer>
  );
}
