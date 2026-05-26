import { StyleSheet, ScrollView, View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OmniColors, OmniFonts, OmniGradient } from '@/constants/theme';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

export default function GuideScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={14} color="#71717A" />
          <Text style={styles.backText}>back</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.title}>Getting Started</Text>
          <Text style={styles.subtitle}>Welcome to Omni! Let's get you up to speed in a few simple steps.</Text>
        </View>

        <View style={styles.steps}>
          <View style={styles.stepItem}>
            <LinearGradient
              colors={OmniGradient}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.stepIconWrapper}
            >
              <MaterialIcons name="chat" size={20} color="#fff" />
            </LinearGradient>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>1. Chat with Omni</Text>
              <Text style={styles.stepDescription}>Use the input bar on the Home screen to quickly jot down text, use speech-to-text, or type out tasks in plain English.</Text>
            </View>
          </View>

          <View style={styles.stepItem}>
            <LinearGradient
              colors={OmniGradient}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.stepIconWrapper}
            >
              <MaterialIcons name="auto-awesome" size={20} color="#fff" />
            </LinearGradient>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>2. Let Omni organize it</Text>
              <Text style={styles.stepDescription}>Omni automatically categorizes and extracts the most important information from your captures.</Text>
            </View>
          </View>

          <View style={styles.stepItem}>
            <LinearGradient
              colors={OmniGradient}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.stepIconWrapper}
            >
              <MaterialIcons name="folder-open" size={20} color="#fff" />
            </LinearGradient>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>3. Explore your Spaces</Text>
              <Text style={styles.stepDescription}>Omni will automatically route your confirmed captures into three default spaces: Transactions, To-Dos, and Thoughts.</Text>
            </View>
          </View>

          <View style={styles.stepItem}>
            <LinearGradient
              colors={OmniGradient}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.stepIconWrapper}
            >
              <MaterialIcons name="collections-bookmark" size={20} color="#fff" />
            </LinearGradient>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>4. Review your memories</Text>
              <Text style={styles.stepDescription}>Easily look back at your tracked finances, upcoming tasks, and personal notes directly in your Spaces.</Text>
            </View>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: OmniColors.paper,
  },
  scroll: {
    padding: 24,
    gap: 32,
  },
  header: {
    gap: 8,
  },
  title: {
    fontFamily: OmniFonts.heading,
    fontSize: 24,
    color: OmniColors.ink,
  },
  subtitle: {
    fontFamily: OmniFonts.body,
    fontSize: 16,
    color: '#52525B',
    lineHeight: 22,
  },
  steps: {
    gap: 24,
  },
  stepItem: {
    flexDirection: 'row',
    gap: 16,
  },
  stepIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepContent: {
    flex: 1,
    gap: 4,
    paddingTop: 2,
  },
  stepTitle: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 16,
    color: OmniColors.ink,
  },
  stepDescription: {
    fontFamily: OmniFonts.body,
    fontSize: 14,
    color: '#52525B',
    lineHeight: 20,
  },
  backBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 6, 
    alignSelf: 'flex-start' 
  },
  backText: {
    fontFamily: OmniFonts.body,
    fontSize: 13,
    color: '#71717A',
  },
});
