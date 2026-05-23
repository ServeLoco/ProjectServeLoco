import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, typography, spacing, radius, borderWidth, layout } from '../../theme';
import AppIcon from '../AppIcon';

/**
 * TextInputField
 * Full form input with label, error, disabled, and password eye toggle.
 *
 * Props:
 *   label           - field label above input
 *   value           - controlled value
 *   onChangeText    - change handler
 *   placeholder     - placeholder text
 *   error           - error message string (shows below input in red)
 *   disabled        - disables input
 *   secureTextEntry - password field (adds eye toggle)
 *   keyboardType    - RN keyboard type
 *   returnKeyType   - return key type
 *   onSubmitEditing - submit handler
 *   autoCapitalize  - auto capitalize mode
 *   multiline       - multiline text area
 *   numberOfLines   - number of visible lines for multiline
 *   inputRef        - ref for the TextInput
 *   style           - container style
 *   inputStyle      - input style override
 *   rightElement    - custom right element (overrides eye toggle)
 */
function TextInputField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  disabled = false,
  secureTextEntry = false,
  keyboardType = 'default',
  returnKeyType = 'done',
  onSubmitEditing,
  autoCapitalize = 'sentences',
  multiline = false,
  numberOfLines = 1,
  inputRef,
  style,
  inputStyle,
  rightElement,
}) {
  const [isSecure, setIsSecure] = useState(secureTextEntry);
  const [isFocused, setIsFocused] = useState(false);

  const borderColor = error
    ? colors.errorBorder
    : isFocused
    ? colors.borderFocus
    : colors.border;

  return (
    <View style={[styles.container, style]}>
      {label ? (
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      ) : null}

      <View
        style={[
          styles.inputWrap,
          { borderColor },
          isFocused && styles.focused,
          disabled && styles.disabledWrap,
          multiline && { height: 52 + (numberOfLines - 1) * 22 },
        ]}
      >
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textHint}
          secureTextEntry={isSecure}
          keyboardType={keyboardType}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          autoCapitalize={autoCapitalize}
          multiline={multiline}
          numberOfLines={multiline ? numberOfLines : 1}
          editable={!disabled}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          style={[
            styles.input,
            disabled && styles.disabledInput,
            multiline && styles.multilineInput,
            inputStyle,
          ]}
          autoCorrect={false}
        />

        {/* Password eye toggle */}
        {secureTextEntry && !rightElement ? (
          <TouchableOpacity
            onPress={() => setIsSecure(prev => !prev)}
            style={styles.eyeBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={isSecure ? 'Show password' : 'Hide password'}
          >
            <AppIcon
              name={isSecure ? 'eye' : 'eyeOff'}
              color={colors.textSecondary}
              size={18}
            />
          </TouchableOpacity>
        ) : rightElement ? (
          <View style={styles.rightEl}>{rightElement}</View>
        ) : null}
      </View>

      {error ? (
        <Text style={styles.error} numberOfLines={2}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.inputGap,
  },
  label: {
    ...typography.labelSmall,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: layout.inputHeight,
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    borderWidth: borderWidth.thin,
    borderColor: colors.border,
    paddingHorizontal: layout.inputPaddingH,
    overflow: 'hidden',
  },
  focused: {
    backgroundColor: colors.bgSurface,
  },
  disabledWrap: {
    backgroundColor: colors.bgDisabled,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    paddingVertical: 0,
    includeFontPadding: false,
  },
  disabledInput: {
    color: colors.textDisabled,
  },
  multilineInput: {
    textAlignVertical: 'top',
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  eyeBtn: {
    paddingLeft: spacing.sm,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightEl: {
    marginLeft: spacing.sm,
  },
  error: {
    ...typography.caption,
    color: colors.textError,
    marginTop: spacing.xs,
    marginLeft: 2,
  },
});

export default TextInputField;
