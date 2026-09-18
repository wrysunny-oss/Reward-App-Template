import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
} from 'react-native';
import {colors, radii, spacing, typography} from '../theme';

export function Field(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.muted}
      {...props}
      style={[s.input, props.multiline && s.multi, props.style]}
    />
  );
}
/** 旧页面兼容入口，内部统一到新的交互按钮，后续页面无需重复维护样式。 */
export function PrimaryButton({
  title,
  onPress,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [s.button, disabled && s.disabled, pressed && s.pressed]}
    >
      <Text style={s.buttonText}>{title}</Text>
    </Pressable>
  );
}
export const formStyles = StyleSheet.create({
  label: {color: colors.text, ...typography.label, marginTop: spacing.xl, marginBottom: spacing.sm},
  section: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
});
const s = StyleSheet.create({
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceAlt,
    marginBottom: spacing.md,
    ...typography.body,
  },
  multi: { height: 120, textAlignVertical: 'top', paddingTop: 14 },
  button: {
    height: 50,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  buttonText: {...typography.label, fontSize: 15, color: '#171000'},
  disabled: { opacity: 0.55 },
  pressed: {opacity: 0.82, transform: [{scale: 0.985}]},
});
