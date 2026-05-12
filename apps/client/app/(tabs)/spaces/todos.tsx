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

type Priority = 'high' | 'medium' | 'low';

type Todo = {
  id: string;
  title: string;
  priority: Priority;
  due: string;
  source: string;
  done: boolean;
};

type TabKey = 'all' | 'today' | 'upcoming' | 'done';

// ── Static data (swap with API later) ───────────────────────────────

const TODOS: Todo[] = [
  {
    id: '1',
    title: 'Submit reimbursement for lunch meeting',
    priority: 'high',
    due: 'Today 9:00 AM',
    source: 'From transaction',
    done: false,
  },
  {
    id: '2',
    title: 'Finalize hiring plan draft',
    priority: 'medium',
    due: 'Today 4:30 PM',
    source: 'Voice thought',
    done: false,
  },
  {
    id: '3',
    title: 'Send Q2 launch comms update to design and product',
    priority: 'low',
    due: 'Friday, 10:00 AM',
    source: 'Strategy note',
    done: false,
  },
];

const PRIORITY_CONFIG: Record<Priority, { label: string; bg: string; color: string }> = {
  high:   { label: 'High',   bg: '#FFF1F2', color: '#BE123C' },
  medium: { label: 'Medium', bg: '#FFFBEB', color: '#B45309' },
  low:    { label: 'Low',    bg: OmniColors.cloud, color: '#52525B' },
};

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all',      label: 'All' },
  { key: 'today',    label: 'Today' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'done',     label: 'Done' },
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
          <Text style={styles.bannerStatLabel}>Due today</Text>
          <Text style={styles.bannerStatValue}>3</Text>
        </View>
        <View style={styles.bannerStat}>
          <Text style={styles.bannerStatLabel}>Completed</Text>
          <Text style={styles.bannerStatValue}>1</Text>
        </View>
        <View style={styles.bannerStat}>
          <Text style={styles.bannerStatLabel}>Streak</Text>
          <Text style={styles.bannerStatValue}>5d</Text>
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
            placeholder="Search tasks..."
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

function PriorityBadge({ priority }: { priority: Priority }) {
  const cfg = PRIORITY_CONFIG[priority];
  return (
    <View style={[styles.priorityBadge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.priorityBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

function TodoCard({
  item,
  onToggle,
}: {
  item: Todo;
  onToggle: () => void;
}) {
  return (
    <View style={styles.todoCard}>
      <View style={styles.todoTop}>
        <View style={styles.todoLeft}>
          <View style={styles.todoTitleRow}>
            <Text style={[styles.todoTitle, item.done && styles.todoTitleDone]}>
              {item.title}
            </Text>
            <PriorityBadge priority={item.priority} />
          </View>
          <View style={styles.tagRow}>
            <View style={styles.tag}>
              <Text style={styles.tagTextBold}>{item.due}</Text>
            </View>
            <View style={styles.tag}>
              <Text style={styles.tagText}>{item.source}</Text>
            </View>
          </View>
        </View>
        <Pressable style={styles.checkBtn} onPress={onToggle}>
          <MaterialIcons
            name={item.done ? 'check-box' : 'check-box-outline-blank'}
            size={20}
            color={item.done ? OmniColors.ink : '#A1A1AA'}
          />
        </Pressable>
      </View>
    </View>
  );
}

// ── Screen ──────────────────────────────────────────────────────────

export default function TodosScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [search, setSearch] = useState('');
  const [todos, setTodos] = useState(TODOS);

  const toggleTodo = (id: string) => {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={todos}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TodoCard item={item} onToggle={() => toggleTodo(item.id)} />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <MaterialIcons name="arrow-back" size={14} color="#71717A" />
              <Text style={styles.backText}>back</Text>
            </Pressable>

            <Text style={styles.screenTitle}>To Do List</Text>

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

  // Todo card
  todoCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: OmniColors.mist,
    backgroundColor: '#fff',
    padding: 12,
  },
  todoTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  todoLeft: { flex: 1, minWidth: 0 },
  todoTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  todoTitle: {
    flex: 1,
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 15,
    color: OmniColors.charcoal,
    lineHeight: 20,
  },
  todoTitleDone: {
    textDecorationLine: 'line-through',
    color: OmniColors.fog,
  },

  // Tags
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  tag: {
    backgroundColor: OmniColors.cloud,
    borderRadius: 100,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagTextBold: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 11,
    color: '#52525B',
  },
  tagText: {
    fontFamily: OmniFonts.body,
    fontSize: 11,
    color: '#52525B',
  },

  // Priority badge
  priorityBadge: { borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3 },
  priorityBadgeText: { fontFamily: OmniFonts.bodySemiBold, fontSize: 11 },

  // Checkbox
  checkBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
});
