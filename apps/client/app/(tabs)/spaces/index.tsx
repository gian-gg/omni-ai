import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OmniColors, OmniFonts, OmniGradient } from '@/constants/theme';
import { getAnalyticsOverview, getMe, AnalyticsOverviewResponse } from '@/api/client';

function getCurrencySymbol(currency: string): string {
  if (currency === 'EUR') return '€';
  if (currency === 'GBP') return '£';
  if (currency === 'PHP') return '₱';
  if (currency === 'JPY') return '¥';
  return '$';
}

type SpaceCard = {
  id: 'transactions' | 'todos' | 'thoughts';
  title: string;
  badgeSuffix: string;
  description: string;
  cta: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  route: string;
};

type StatRow = {
  label: string;
  value: string;
  /** 0-1 fraction for the progress bar */
  progress: number;
};

const SPACES: SpaceCard[] = [
  {
    id: 'transactions',
    title: 'Transactions',
    badgeSuffix: 'saved',
    description: 'Financial records extracted from chat and receipts.',
    cta: 'Open transaction space',
    icon: 'receipt-long',
    route: '/spaces/transactions',
  },
  {
    id: 'todos',
    title: 'To-Dos',
    badgeSuffix: 'due',
    description: 'Actionable tasks with due times and source context.',
    cta: 'Open to-do space',
    icon: 'check-circle-outline',
    route: '/spaces/todos',
  },
  {
    id: 'thoughts',
    title: 'Thoughts',
    badgeSuffix: 'drafts',
    description: 'Structured notes that can be promoted into tasks or plans.',
    cta: 'Open thought space',
    icon: 'lightbulb-outline',
    route: '/spaces/thoughts',
  },
];



function HeroBanner() {
  return (
    <LinearGradient
      colors={OmniGradient}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={styles.hero}
    >
      <Text style={styles.heroLabel}>Structured Memory</Text>
      <Text style={styles.heroTitle}>
        Pick a space to review and confirm records
      </Text>
      <Text style={styles.heroBody}>
        Transactions, to-dos, and thoughts stay linked to your original intent.
      </Text>
    </LinearGradient>
  );
}

function SpaceCardItem({ space }: { space: SpaceCard }) {
  const router = useRouter();

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => router.push(space.route as any)}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <MaterialIcons name={space.icon} size={16} color={OmniColors.charcoal} />
          <Text style={styles.cardTitle}>{space.title}</Text>
        </View>
      </View>
      <Text style={styles.cardDesc}>{space.description}</Text>
      <Text style={styles.cardCta}>{space.cta}</Text>
    </Pressable>
  );
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
    </View>
  );
}



function AnalyticsCard({ overview }: { overview: AnalyticsOverviewResponse | null }) {
  const router = useRouter();
  const total = overview ? overview.transaction_count + overview.open_todos + overview.total_notes : 0;
  
  const stats: StatRow[] = overview ? [
    { label: 'Transactions', value: String(overview.transaction_count), progress: total > 0 ? overview.transaction_count / total : 0 },
    { label: 'Open To-Dos', value: String(overview.open_todos), progress: total > 0 ? overview.open_todos / total : 0 },
    { label: 'Total Notes', value: String(overview.total_notes), progress: total > 0 ? overview.total_notes / total : 0 },
  ] : [
    { label: 'Transactions', value: '...', progress: 0 },
    { label: 'Open To-Dos', value: '...', progress: 0 },
    { label: 'Total Notes', value: '...', progress: 0 },
  ];

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Overview</Text>
      </View>

      <View style={styles.statsBlock}>
        {stats.map((stat) => (
          <View key={stat.label} style={styles.statRow}>
            <View style={styles.statLabelRow}>
              <Text style={styles.statLabel}>{stat.label}</Text>
              <Text style={styles.statValue}>{stat.value}</Text>
            </View>
            <ProgressBar progress={stat.progress} />
          </View>
        ))}
      </View>

      <Pressable onPress={() => router.push('/spaces/analytics' as any)}>
        <LinearGradient
          colors={OmniGradient}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.analyticsCta}
        >
          <Text style={styles.analyticsCtaText}>View analytics and stats</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

export default function SpacesScreen() {
  const router = useRouter();
  
  const [overview, setOverview] = useState<AnalyticsOverviewResponse | null>(null);
  const [userCurrency, setUserCurrency] = useState<string>('USD');

  useFocusEffect(
    useCallback(() => {
      async function fetchOverview() {
        try {
          const res = await getAnalyticsOverview();
          setOverview(res);
          const me = await getMe();
          if (me.user.currency) setUserCurrency(me.user.currency);
        } catch (err) {
          console.error('Failed to fetch space counts', err);
        }
      }
      
      fetchOverview();
    }, [])
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <HeroBanner />

        {/* Specific Spaces */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Specific Spaces</Text>
          {SPACES.map((s) => (
            <SpaceCardItem key={s.id} space={s} />
          ))}
        </View>

        {/* Analytics */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Analytics</Text>
            <Pressable onPress={() => router.push('/spaces/analytics' as any)}>
              <Text style={styles.sectionLink}>Open full stats</Text>
            </Pressable>
          </View>
          <AnalyticsCard overview={overview} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: OmniColors.paper },
  scroll: { padding: 20, gap: 20, paddingBottom: 32 },

  // Hero banner
  hero: {
    borderRadius: 16,
    padding: 16,
  },
  heroLabel: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: OmniColors.fog,
  },
  heroTitle: {
    fontFamily: OmniFonts.heading,
    fontSize: 20,
    color: '#fff',
    marginTop: 4,
    lineHeight: 26,
  },
  heroBody: {
    fontFamily: OmniFonts.body,
    fontSize: 13,
    color: OmniColors.fog,
    marginTop: 8,
    lineHeight: 18,
  },

  // Sections
  section: { gap: 12 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontFamily: OmniFonts.heading,
    fontSize: 16,
    color: OmniColors.ink,
  },
  sectionLink: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 12,
    color: OmniColors.ink,
  },

  // Space cards
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: OmniColors.mist,
    backgroundColor: '#fff',
    padding: 16,
  },
  cardPressed: { opacity: 0.85 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardTitle: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 14,
    color: OmniColors.charcoal,
  },
  cardDesc: {
    fontFamily: OmniFonts.body,
    fontSize: 13,
    color: '#52525B',
    marginTop: 4,
    lineHeight: 18,
  },
  cardCta: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 12,
    color: OmniColors.ink,
    marginTop: 8,
  },

  // Badge
  badge: {
    backgroundColor: OmniColors.cloud,
    borderRadius: 100,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 11,
    color: '#52525B',
  },
  badgeTextAccent: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 11,
    color: OmniColors.ink,
  },

  // Analytics stats
  statsBlock: { marginTop: 12, gap: 12 },
  statRow: { gap: 4 },
  statLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statLabel: {
    fontFamily: OmniFonts.body,
    fontSize: 12,
    color: '#52525B',
  },
  statValue: {
    fontFamily: OmniFonts.data,
    fontSize: 12,
    color: OmniColors.charcoal,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: OmniColors.mist,
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: OmniColors.charcoal,
  },

  // Analytics CTA button
  analyticsCta: {
    marginTop: 16,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  analyticsCtaText: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 14,
    color: '#fff',
  },
});
