import { Stack } from 'expo-router';

export default function SpacesLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="transactions" />
      <Stack.Screen name="todos" />
      <Stack.Screen name="thoughts" />
      <Stack.Screen name="analytics" />
    </Stack>
  );
}
