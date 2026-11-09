import * as Linking from 'expo-linking';

/** Opens the phone app with the number (customer cards, visit rows). */
export function callPhone(phone: string) {
  void Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`);
}
