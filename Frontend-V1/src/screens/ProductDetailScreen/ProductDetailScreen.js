import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { AppScreen } from '../../components';
import { typography, colors } from '../../theme';

function ProductDetailScreen() {
  return (
    <AppScreen style={styles.container}>
      <Text style={styles.title}>ProductDetailScreen</Text>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
  }
});

export default ProductDetailScreen;
