import type { TextInputProps } from 'react-native';

/** Hardening + platform autofill hints for sensitive and common field types. */

export const phoneInputProps: Partial<TextInputProps> = {
  keyboardType: 'phone-pad',
  textContentType: 'telephoneNumber',
  autoComplete: 'tel',
  autoCorrect: false,
};

export const emailInputProps: Partial<TextInputProps> = {
  keyboardType: 'email-address',
  autoCapitalize: 'none',
  textContentType: 'emailAddress',
  autoComplete: 'email',
  autoCorrect: false,
};

export const passwordInputProps: Partial<TextInputProps> = {
  autoCapitalize: 'none',
  autoCorrect: false,
  textContentType: 'password',
  autoComplete: 'password',
};

export const newPasswordInputProps: Partial<TextInputProps> = {
  autoCapitalize: 'none',
  autoCorrect: false,
  textContentType: 'newPassword',
  autoComplete: 'password-new',
};

export const oneTimeCodeInputProps: Partial<TextInputProps> = {
  keyboardType: 'number-pad',
  textContentType: 'oneTimeCode',
  autoComplete: 'sms-otp',
  autoCapitalize: 'none',
  autoCorrect: false,
};

export const familyNameInputProps: Partial<TextInputProps> = {
  autoCapitalize: 'words',
  textContentType: 'familyName',
  autoComplete: 'name-family',
};

export const givenNameInputProps: Partial<TextInputProps> = {
  autoCapitalize: 'words',
  textContentType: 'givenName',
  autoComplete: 'name-given',
};

export const addressCityInputProps: Partial<TextInputProps> = {
  autoCapitalize: 'words',
  textContentType: 'addressCity',
  autoComplete: 'postal-address-locality',
};

export const streetAddressInputProps: Partial<TextInputProps> = {
  autoCapitalize: 'words',
  textContentType: 'streetAddressLine1',
  autoComplete: 'street-address',
};

export const numericNoSuggestProps: Partial<TextInputProps> = {
  keyboardType: 'numeric',
  autoCorrect: false,
};

export const searchInputProps: Partial<TextInputProps> = {
  autoCapitalize: 'none',
  autoCorrect: false,
  textContentType: 'none',
  autoComplete: 'off',
};

export const plainFieldProps: Partial<TextInputProps> = {
  autoCorrect: false,
};

/** Chat / free-text where autocorrect is desirable */
export const chatComposerProps: Partial<TextInputProps> = {
  autoCapitalize: 'sentences',
  autoCorrect: true,
  textContentType: 'none',
  autoComplete: 'off',
};
