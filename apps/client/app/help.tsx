import { StyleSheet, ScrollView, View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OmniColors, OmniFonts } from '@/constants/theme';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';

export default function HelpScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={14} color="#71717A" />
          <Text style={styles.backText}>back</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.title}>Help Center & FAQ</Text>
          <Text style={styles.subtitle}>Find answers to common questions about Omni.</Text>
        </View>

        <View style={styles.faqSection}>
          <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
          
          <View style={styles.faqItem}>
            <Text style={styles.question}>How do I create a new record?</Text>
            <Text style={styles.answer}>Just talk to Omni! Tell it about a transaction you made, a thought you have, or a task you need to remember. Omni will automatically categorize it for you.</Text>
          </View>
          
          <View style={styles.faqItem}>
            <Text style={styles.question}>How does Omni process what I say?</Text>
            <Text style={styles.answer}>When you send a message, Omni's AI analyzes your intent and extracts structured data like transactions, to-dos, or notes. You'll always get a chance to review and confirm before anything is saved.</Text>
          </View>
          
          <View style={styles.faqItem}>
            <Text style={styles.question}>How do I view my records?</Text>
            <Text style={styles.answer}>Navigate to the Spaces tab. There you can find all your saved Transactions, To-Dos, and Thoughts neatly organized.</Text>
          </View>
        </View>

        <View style={styles.contactSection}>
          <Text style={styles.sectionTitle}>Still need help?</Text>
          <Pressable style={({ pressed }) => [styles.contactButton, pressed && styles.contactButtonPressed]}>
            <MaterialIcons name="mail-outline" size={20} color="#fff" />
            <Text style={styles.contactButtonText}>Contact Support</Text>
          </Pressable>
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
  },
  faqSection: {
    gap: 16,
  },
  sectionTitle: {
    fontFamily: OmniFonts.heading,
    fontSize: 18,
    color: OmniColors.ink,
    marginBottom: 8,
  },
  faqItem: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: OmniColors.mist,
    gap: 8,
  },
  question: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 15,
    color: OmniColors.ink,
  },
  answer: {
    fontFamily: OmniFonts.body,
    fontSize: 14,
    color: '#52525B',
    lineHeight: 20,
  },
  contactSection: {
    gap: 16,
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: OmniColors.mist,
    alignItems: 'center',
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: OmniColors.ink,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
  },
  contactButtonPressed: {
    opacity: 0.8,
  },
  contactButtonText: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 15,
    color: '#fff',
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
