import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { View, ActivityIndicator } from 'react-native';

export default function Root() {
  const [isReady, setIsReady] = useState(false);
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    async function checkToken() {
      try {
        const token = await SecureStore.getItemAsync('access_token');
        if (token) {
          setHasToken(true);
        }
      } catch (e) {
        console.error('Error reading token', e);
      } finally {
        setIsReady(true);
      }
    }
    checkToken();
  }, []);

  if (!isReady) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FAFAFA', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#0B0B0D" />
      </View>
    );
  }

  if (hasToken) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/welcome" />;
}
