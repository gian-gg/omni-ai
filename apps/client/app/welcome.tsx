import {
  IBMPlexMono_600SemiBold,
  useFonts as useIBMPlexMonoFonts,
} from '@expo-google-fonts/ibm-plex-mono';
import {
  Manrope_400Regular,
  Manrope_600SemiBold,
  useFonts as useManropeFonts,
} from '@expo-google-fonts/manrope';
import { Syne_600SemiBold, useFonts as useSyneFonts } from '@expo-google-fonts/syne';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Svg, Path } from 'react-native-svg';
import { OmniGradient } from '@/constants/theme';
import { SafeAreaView } from 'react-native-safe-area-context';

function GoogleIcon() {
  return (
    <View style={styles.googleIconWrapper}>
      <Svg viewBox="0 0 24 24" width={16} height={16} fill="none">
        <Path d="M21.6 12.23c0-.77-.07-1.5-.2-2.2H12v4.16h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.74 2.98-4.31 2.98-7.48Z" fill="#4285F4" />
        <Path d="M12 22c2.7 0 4.96-.9 6.62-2.45l-3.24-2.5c-.9.6-2.05.95-3.38.95-2.6 0-4.8-1.76-5.58-4.12H3.07v2.58A10 10 0 0 0 12 22Z" fill="#34A853" />
        <Path d="M6.42 13.88A6 6 0 0 1 6.1 12c0-.65.12-1.27.32-1.88V7.54H3.07A10 10 0 0 0 2 12c0 1.62.39 3.15 1.07 4.46l3.35-2.58Z" fill="#FBBC05" />
        <Path d="M12 5.95c1.47 0 2.78.5 3.81 1.49l2.86-2.86C16.95 3 14.69 2 12 2A10 10 0 0 0 3.07 7.54l3.35 2.58C7.2 7.7 9.4 5.95 12 5.95Z" fill="#EA4335" />
      </Svg>
    </View>
  );
}

export default function WelcomeScreen() {
  const router = useRouter();

  const [syneLoaded] = useSyneFonts({ Syne_600SemiBold });
  const [manropeLoaded] = useManropeFonts({ Manrope_400Regular, Manrope_600SemiBold });
  const [ibmPlexMonoLoaded] = useIBMPlexMonoFonts({ IBMPlexMono_600SemiBold });

  const fontsReady = syneLoaded && manropeLoaded && ibmPlexMonoLoaded;

  if (!fontsReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#0B0B0D" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />

      {/* Hero */}
      <View style={styles.hero}>
        <LinearGradient
          colors={OmniGradient}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.logoCard}
        >
          <Image
            source={require('@/assets/images/logo.png')}
            style={styles.logoImage}
            contentFit="contain"
          />
        </LinearGradient>

        <View style={styles.headingGroup}>
          <Text style={styles.heading}>Omni</Text>
          <Text style={styles.tagline}>Structured memory, without structured friction.</Text>
        </View>
      </View>

      {/* CTA */}
      <View style={styles.cta}>
        <Pressable
          style={({ pressed }) => [pressed && styles.ctaButtonPressed]}
          onPress={() => router.replace('/(tabs)')}
        >
          <LinearGradient
            colors={OmniGradient}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.ctaButton}
          >
            <GoogleIcon />
            <Text style={styles.ctaText}>Continue with Google</Text>
          </LinearGradient>
        </Pressable>
        <Text style={styles.ctaCaption}>One-tap sign-in for Omni.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 24,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFAFA',
  },

  // Hero
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingBottom: 300,
  },
  logoCard: {
    width: 128,
    height: 128,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.4,
    shadowRadius: 34,
    elevation: 24,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  logoImage: {
    width: 64,
    height: 64,
  },
  headingGroup: {
    alignItems: 'center',
    gap: 8,
  },
  heading: {
    fontFamily: 'Syne_600SemiBold',
    fontSize: 36,
    letterSpacing: 1,
    color: '#0B0B0D',
    lineHeight: 44,
  },
  tagline: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    color: '#52525B',
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 20,
  },

  // CTA
  cta: {
    gap: 10,
    paddingBottom: 16,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 52,
    borderRadius: 14,
    paddingHorizontal: 16,
  },
  ctaButtonPressed: {
    opacity: 0.85,
  },
  googleIconWrapper: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 16,
    color: '#fff',
  },
  ctaCaption: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    color: '#A1A1AA',
    textAlign: 'center',
  },
});
