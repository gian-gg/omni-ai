import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OmniColors, OmniFonts, OmniGradient } from '@/constants/theme';

// ── Types ───────────────────────────────────────────────────────────

type Thought = {
  id: string;
  category: string;
  time: string;
  title: string;
  body: string;
  action: string;
};

type TabKey = 'all' | 'product' | 'ops' | 'personal';

// ── Static data (swap with API later) ───────────────────────────────

const THOUGHTS: Thought[] = [
  {
    id: '1',
    category: 'Ops',
    time: '2h ago',
    title: 'Offsite venue direction',
    body: 'Prefer spaces with strong train access, two breakout rooms, and quiet corners for one-on-ones.',
    action: 'Task',
  },
  {
    id: '2',
    category: 'Product',
    time: 'Yesterday',
    title: 'Q2 launch comms angle',
    body: 'Position launch around fewer taps to capture intent and faster confirmation loops for teams.',
    action: 'Pin',
  },
  {
    id: '3',
    category: 'Product',
    time: 'Feb 19',
    title: 'Client onboarding insight',
    body: 'First-week setup should include templates for transactions and tasks to reduce blank-state friction.',
    action: 'List',
  },
];

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all',      label: 'All' },
  { key: 'product',  label: 'Product' },
  { key: 'ops',      label: 'Ops' },
  { key: 'personal', label: 'Personal' },
];

// ── Sub-components ──────────────────────────────────────────────────

function SummaryBanner() {
  return (
    <LinearGradient
      colors={OmniGradient}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={styles.banner}
    >
      <View style={styles.bannerRow}>
        <View style={styles.bannerStat}>
          <Text style={styles.bannerStatLabel}>Captured</Text>
          <Text style={styles.bannerStatValue}>18</Text>
        </View>
        <View style={styles.bannerStat}>
          <Text style={styles.bannerStatLabel}>Pinned</Text>
          <Text style={styles.bannerStatValue}>4</Text>
        </View>
        <View style={styles.bannerStat}>
          <Text style={styles.bannerStatLabel}>Converted</Text>
          <Text style={styles.bannerStatValue}>7</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

function FilterTabs({
  active,
  onSelect,
}: {
  active: TabKey;
  onSelect: (key: TabKey) => void;
}) {
  return (
    <View style={styles.tabRow}>
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            style={[styles.tab, isActive ? styles.tabActive : styles.tabInactive]}
            onPress={() => onSelect(tab.key)}
          >
            <Text style={isActive ? styles.tabTextActive : styles.tabTextInactive}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SearchBar({
  value,
  onChangeText,
}: {
  value: string;
  onChangeText: (t: string) => void;
}) {
  return (
    <View style={styles.toolbarCard}>
      <View style={styles.toolbarInner}>
        <View style={styles.searchBox}>
          <MaterialIcons name="search" size={14} color="#71717A" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search thoughts..."
            placeholderTextColor="#A1A1AA"
            value={value}
            onChangeText={onChangeText}
          />
        </View>
        <Pressable style={styles.toolBtn}>
          <MaterialIcons name="filter-list" size={14} color={OmniColors.charcoal} />
        </Pressable>
        <Pressable style={[styles.toolBtn, styles.toolBtnSubtle]}>
          <MaterialIcons name="swap-vert" size={14} color="#52525B" />
        </Pressable>
      </View>
    </View>
  );
}

function ThoughtCard({ item }: { item: Thought }) {
  return (
    <View style={styles.thoughtCard}>
      <View style={styles.thoughtTop}>
        <View style={styles.thoughtLeft}>
          <View style={styles.metaRow}>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{item.category}</Text>
            </View>
            <Text style={styles.timeText}>{item.time}</Text>
          </View>
          <Text style={styles.thoughtTitle}>{item.title}</Text>
          <Text style={styles.thoughtBody}>{item.body}</Text>
        </View>
        <Pressable style={styles.actionBtn}>
          <Text style={styles.actionBtnText}>{item.action}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Screen ──────────────────────────────────────────────────────────

export default function ThoughtsScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [search, setSearch] = useState('');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={THOUGHTS}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ThoughtCard item={item} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <MaterialIcons name="arrow-back" size={14} color="#71717A" />
              <Text style={styles.backText}>back</Text>
            </Pressable>

            <Text style={styles.screenTitle}>Thoughts</Text>

            <SummaryBanner />
            <FilterTabs active={activeTab} onSelect={setActiveTab} />
            <SearchBar value={search} onChangeText={setSearch} />
          </View>
        }
      />
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: OmniColors.paper },
  listContent: { paddingHorizontal: 16, paddingBottom: 32, gap: 8 },

  // Header
  header: { gap: 12, paddingTop: 16, paddingBottom: 4 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  backText: {
    fontFamily: OmniFonts.body,
    fontSize: 13,
    color: '#71717A',
  },
  screenTitle: {
    fontFamily: OmniFonts.heading,
    fontSize: 22,
    color: OmniColors.ink,
  },

  // Summary banner
  banner: {
    borderRadius: 16,
    padding: 12,
  },
  bannerRow: { flexDirection: 'row', gap: 6 },
  bannerStat: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 10,
  },
  bannerStatLabel: {
    fontFamily: OmniFonts.body,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: OmniColors.fog,
  },
  bannerStatValue: {
    fontFamily: OmniFonts.data,
    fontSize: 18,
    color: '#fff',
    marginTop: 2,
  },

  // Tabs
  tabRow: { flexDirection: 'row', gap: 6 },
  tab: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: { backgroundColor: OmniColors.ink },
  tabInactive: {
    borderWidth: 1,
    borderColor: OmniColors.mist,
    backgroundColor: '#fff',
  },
  tabTextActive: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 13,
    color: '#fff',
  },
  tabTextInactive: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 13,
    color: '#52525B',
  },

  // Search toolbar
  toolbarCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: OmniColors.mist,
    backgroundColor: '#fff',
    padding: 8,
  },
  toolbarInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: OmniColors.mist,
    backgroundColor: OmniColors.paper,
    paddingHorizontal: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: OmniFonts.body,
    fontSize: 14,
    color: OmniColors.charcoal,
    paddingVertical: 0,
  },
  toolBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: OmniColors.mist,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolBtnSubtle: {
    backgroundColor: OmniColors.paper,
  },

  // Thought card
  thoughtCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: OmniColors.mist,
    backgroundColor: '#fff',
    padding: 12,
  },
  thoughtTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  thoughtLeft: { flex: 1, minWidth: 0 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  categoryBadge: {
    backgroundColor: OmniColors.cloud,
    borderRadius: 100,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  categoryText: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 11,
    color: '#52525B',
  },
  timeText: {
    fontFamily: OmniFonts.body,
    fontSize: 11,
    color: '#71717A',
  },
  thoughtTitle: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 15,
    color: OmniColors.charcoal,
    lineHeight: 20,
    marginTop: 6,
  },
  thoughtBody: {
    fontFamily: OmniFonts.body,
    fontSize: 13,
    color: '#52525B',
    lineHeight: 20,
    marginTop: 6,
  },

  // Action button
  actionBtn: {
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: OmniColors.mist,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  actionBtnText: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 11,
    color: '#52525B',
  },
});
