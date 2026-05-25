import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OmniColors, OmniFonts, OmniGradient } from '@/constants/theme';
import { Pressable } from 'react-native';
import { listTransactions, listTodos, listNotes } from '@/api/client';

// ── Types ───────────────────────────────────────────────────────────

type Metric = {
  label: string;
  value: string;
  subtitle: string;
};

type SpaceBreakdown = {
  id: 'transactions' | 'todos' | 'thoughts';
  label: string;
  value: string;
  /** 0-1 fraction for the progress bar */
  progress: number;
  useGradient?: boolean;
};

// ── Static data (swap with API later) ───────────────────────────────

const METRICS: Metric[] = [
  {
    label: 'Records captured',
    value: '54',
    subtitle: 'This week',
  },
  {
    label: 'Confirmation rate',
    value: '92%',
    subtitle: 'Saved records vs drafted records',
  },
  {
    label: 'Average confirmation time',
    value: '1m 18s',
    subtitle: 'From draft creation to confirm',
  },
];

// ── Sub-components ──────────────────────────────────────────────────

function HeroBanner() {
  return (
    <LinearGradient
      colors={OmniGradient}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={styles.hero}
    >
      <Text style={styles.heroLabel}>Performance Snapshot</Text>
      <Text style={styles.heroTitle}>
        Stats for your structured memory workflow
      </Text>
      <Text style={styles.heroBody}>
        Track capture quality, confirmation speed, and record volume across spaces.
      </Text>
    </LinearGradient>
  );
}

function MetricCard({ metric }: { metric: Metric }) {
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricHeader}>
        <Text style={styles.metricLabel}>{metric.label}</Text>
        <Text style={styles.metricValue}>{metric.value}</Text>
      </View>
      <Text style={styles.metricSubtitle}>{metric.subtitle}</Text>
    </View>
  );
}

function BreakdownBar({ item }: { item: SpaceBreakdown }) {
  const fill = `${Math.max(0, Math.min(100, item.progress * 100))}%` as const;
  return (
    <View style={styles.breakdownRow}>
      <View style={styles.breakdownLabelRow}>
        <Text style={styles.breakdownLabel}>{item.label}</Text>
        <Text style={styles.breakdownValue}>{item.value}</Text>
      </View>
      <View style={styles.progressTrack}>
        {item.useGradient ? (
          <LinearGradient
            colors={OmniGradient}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[styles.progressFill, { width: fill as any }]}
          />
        ) : (
          <View style={[styles.progressFillSolid, { width: fill as any }]} />
        )}
      </View>
    </View>
  );
}

// ── Screen ──────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
  const router = useRouter();

  const [counts, setCounts] = useState<{
    transactions: number | null;
    todos: number | null;
    thoughts: number | null;
  }>({
    transactions: null,
    todos: null,
    thoughts: null,
  });

  useFocusEffect(
    useCallback(() => {
      async function fetchCounts() {
        try {
          const [txRes, todoRes, noteRes] = await Promise.all([
            listTransactions(1, 0),
            listTodos(1, 0),
            listNotes(1, 0)
          ]);
          
          setCounts({
            transactions: txRes.total,
            todos: todoRes.total,
            thoughts: noteRes.total,
          });
        } catch (err) {
          console.error('Failed to fetch analytics space counts', err);
        }
      }
      
      fetchCounts();
    }, [])
  );

  // Calculate total to determine progress bar percentages
  const tCount = counts.transactions || 0;
  const doCount = counts.todos || 0;
  const thCount = counts.thoughts || 0;
  const total = tCount + doCount + thCount;

  const spaceBreakdown: SpaceBreakdown[] = [
    { 
      id: 'transactions',
      label: 'Transactions', 
      value: counts.transactions === null ? '...' : String(tCount), 
      progress: total > 0 ? tCount / total : 0, 
      useGradient: true 
    },
    { 
      id: 'todos',
      label: 'To-Dos',       
      value: counts.todos === null ? '...' : String(doCount),  
      progress: total > 0 ? doCount / total : 0 
    },
    { 
      id: 'thoughts',
      label: 'Thoughts',     
      value: counts.thoughts === null ? '...' : String(thCount), 
      progress: total > 0 ? thCount / total : 0 
    },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={14} color="#71717A" />
          <Text style={styles.backText}>back</Text>
        </Pressable>

        <HeroBanner />

        {/* Key Metrics */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Key Metrics</Text>
          {METRICS.map((m) => (
            <MetricCard key={m.label} metric={m} />
          ))}
        </View>

        {/* Space Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Space Breakdown</Text>
          <View style={styles.breakdownCard}>
            {spaceBreakdown.map((item) => (
              <BreakdownBar key={item.id} item={item} />
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: OmniColors.paper },
  scroll: { padding: 20, gap: 20, paddingBottom: 32 },

  // Back button
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  backText: {
    fontFamily: OmniFonts.body,
    fontSize: 13,
    color: '#71717A',
  },

  // Hero banner
  hero: {
    borderRadius: 16,
    padding: 16,
  },
  heroLabel: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 12,
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
    fontSize: 14,
    color: OmniColors.fog,
    marginTop: 8,
    lineHeight: 20,
  },

  // Sections
  section: { gap: 12 },
  sectionTitle: {
    fontFamily: OmniFonts.heading,
    fontSize: 16,
    color: OmniColors.ink,
  },

  // Metric card
  metricCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: OmniColors.mist,
    backgroundColor: '#fff',
    padding: 16,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metricLabel: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 14,
    color: OmniColors.charcoal,
  },
  metricValue: {
    fontFamily: OmniFonts.data,
    fontSize: 14,
    color: OmniColors.ink,
  },
  metricSubtitle: {
    fontFamily: OmniFonts.body,
    fontSize: 12,
    color: '#71717A',
    marginTop: 4,
  },

  // Breakdown card
  breakdownCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: OmniColors.mist,
    backgroundColor: '#fff',
    padding: 16,
    gap: 16,
  },
  breakdownRow: { gap: 6 },
  breakdownLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  breakdownLabel: {
    fontFamily: OmniFonts.body,
    fontSize: 13,
    color: '#52525B',
  },
  breakdownValue: {
    fontFamily: OmniFonts.data,
    fontSize: 13,
    color: OmniColors.ink,
  },

  // Progress bars
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: OmniColors.mist,
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
  },
  progressFillSolid: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3F3F46',
  },
});
