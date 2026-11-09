import { Stack } from 'expo-router';

/** Signed-out screens: sign-in now; MFA and Sign in with Apple join with the auth layer. */
export default function PublicLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="sign-in" />
    </Stack>
  );
}
