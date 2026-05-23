import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OmniColors, OmniFonts, OmniGradient } from '@/constants/theme';
import { listNotes, NoteItem } from '@/api/client';

// ── Types ───────────────────────────────────────────────────────────

type TabKey = 'all' | 'product' | 'ops' | 'personal';

// ── Sub-components ──────────────────────────────────────────────────

function SummaryBanner({ total, pinned }: { total: number; pinned: number }) {
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
          <Text style={styles.bannerStatValue}>{total}</Text>
        </View>
        <View style={styles.bannerStat}>
          <Text style={styles.bannerStatLabel}>Pinned</Text>
          <Text style={styles.bannerStatValue}>{pinned}</Text>
        </View>
        <View style={styles.bannerStat}>
          <Text style={styles.bannerStatLabel}>Converted</Text>
          <Text style={styles.bannerStatValue}>{Math.max(0, total - pinned)}</Text>
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
  const tabs: { key: TabKey; label: string }[] = [
    { key: 'all',      label: 'All' },
    { key: 'product',  label: 'Product' },
    { key: 'ops',      label: 'Ops' },
    { key: 'personal', label: 'Personal' },
  ];

  return (
    <View style={styles.tabRow}>
      {tabs.map((tab) => {
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

function ThoughtCard({ item }: { item: NoteItem }) {
  const getCategory = (tags: string[]) => {
    if (!tags || tags.length === 0) return 'Note';
    const known = ['product', 'ops', 'personal'];
    const found = tags.find((t) => known.includes(t.toLowerCase()));
    return found ? found.toUpperCase() : tags[0].toUpperCase();
  };

  const formatTime = (createdAt: string) => {
    const d = new Date(createdAt);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHrs < 24 && diffHrs >= 0) {
      if (diffHrs === 0) {
        const mins = Math.floor(diffMs / (1000 * 60));
        return `${mins || 1}m ago`;
      }
      return `${diffHrs}h ago`;
    }
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays === 1) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const isPinned = item.tags.some((t) => t.toLowerCase() === 'pinned' || t.toLowerCase() === 'pin');

  return (
    <View style={styles.thoughtCard}>
      <View style={styles.thoughtTop}>
        <View style={styles.thoughtLeft}>
          <View style={styles.metaRow}>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{getCategory(item.tags)}</Text>
            </View>
            <Text style={styles.timeText}>{formatTime(item.created_at)}</Text>
          </View>
          <Text style={styles.thoughtTitle}>{item.title || 'Untitled thought'}</Text>
          <Text style={styles.thoughtBody}>{item.content}</Text>
        </View>
        <Pressable style={styles.actionBtn}>
          <Text style={styles.actionBtnText}>{isPinned ? 'Pinned' : 'Pin'}</Text>
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
  const [thoughts, setThoughts] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchThoughts = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      const res = await listNotes();
      setThoughts(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch thoughts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchThoughts();
  }, [fetchThoughts]);

  // Filter list by Tab category
  const filtered = thoughts.filter((note) => {
    if (activeTab === 'all') return true;
    return note.tags.some((tag) => tag.toLowerCase() === activeTab.toLowerCase());
  });

  // Filter list by Search text
  const displayed = search.trim()
    ? filtered.filter(
        (note) =>
          (note.title && note.title.toLowerCase().includes(search.toLowerCase())) ||
          note.content.toLowerCase().includes(search.toLowerCase())
      )
    : filtered;

  const totalCount = thoughts.length;
  const pinnedCount = thoughts.filter((t) =>
    t.tags.some((tag) => tag.toLowerCase() === 'pinned' || tag.toLowerCase() === 'pin')
  ).length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={OmniColors.ink} />
        </View>
      ) : error ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 }}>
          <MaterialIcons name="error-outline" size={48} color="#EF4444" />
          <Text style={{ fontFamily: OmniFonts.bodySemiBold, fontSize: 16, color: OmniColors.charcoal, textAlign: 'center' }}>
            {error}
          </Text>
          <Pressable
            style={({ pressed }) => [{
              backgroundColor: OmniColors.ink,
              borderRadius: 12,
              paddingHorizontal: 20,
              paddingVertical: 10,
              opacity: pressed ? 0.9 : 1
            }]}
            onPress={() => fetchThoughts()}
          >
            <Text style={{ fontFamily: OmniFonts.bodySemiBold, fontSize: 14, color: '#fff' }}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ThoughtCard item={item} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchThoughts(true)} tintColor={OmniColors.ink} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No thoughts found</Text>
              <Text style={styles.emptySubtext}>Thoughts created through chat will appear here.</Text>
            </View>
          }
          ListHeaderComponent={
            <View style={styles.header}>
              <Pressable style={styles.backBtn} onPress={() => router.back()}>
                <MaterialIcons name="arrow-back" size={14} color="#71717A" />
                <Text style={styles.backText}>back</Text>
              </Pressable>

              <Text style={styles.screenTitle}>Thoughts</Text>

              <SummaryBanner total={totalCount} pinned={pinnedCount} />
              <FilterTabs active={activeTab} onSelect={setActiveTab} />
              <SearchBar value={search} onChangeText={setSearch} />
            </View>
          }
        />
      )}
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

  // Empty states
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyText: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 14,
    color: '#71717A',
  },
  emptySubtext: {
    fontFamily: OmniFonts.body,
    fontSize: 13,
    color: '#A1A1AA',
    textAlign: 'center',
    maxWidth: 240,
  },
});
