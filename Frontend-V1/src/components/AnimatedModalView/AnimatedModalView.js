import React, { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet } from 'react-native';
import { colors, modalScaleStart, motionConfig, spacing } from '../../theme';
import { useReducedMotion } from '../../utils';

function AnimatedModalView({ children, onClose, visible = false }) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      ...motionConfig.modal,
      duration: reducedMotion ? 0 : motionConfig.modal.duration,
      toValue: visible ? 1 : 0,
    }).start();
  }, [progress, reducedMotion, visible]);

  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [modalScaleStart, 1],
  });

  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdropPressable} onPress={onClose}>
        <Animated.View style={[styles.backdrop, { opacity: progress }]} />
        <Pressable style={styles.dialogPressable}>
          <Animated.View style={{ transform: [{ scale }], opacity: progress }}>
            {children}
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdropPressable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  dialogPressable: {
    width: '100%',
    maxWidth: 360,
  },
});

export default AnimatedModalView;
