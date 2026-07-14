import React from 'react';
import { StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { AppScreen, AppHeader, RiderLiveMap } from '../../../components';

/** Full-screen live rider tracking map — header floats over the map so the map gets full screen height. */
export default function RiderTrackingScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const orderId = route.params?.orderId;

  return (
    <AppScreen edges={['left', 'right']} noPadding style={styles.screen}>
      <RiderLiveMap orderId={orderId} style={StyleSheet.absoluteFill} />
      <AppHeader
        title="Track rider"
        onBack={() => navigation.goBack()}
        bg="transparent"
        bordered={false}
        style={styles.floatingHeader}
        titleStyle={styles.floatingTitle}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  floatingTitle: {
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});
