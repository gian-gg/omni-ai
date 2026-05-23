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
import { listTodos, completeTodoApi, TodoItem } from '@/api/client';

// ── Types ───────────────────────────────────────────────────────────

type Priority = 'high' | 'medium' | 'low';
type TabKey = 'all' | 'today' | 'upcoming' | 'done';

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

function SummaryBanner({ dueToday, completed }: { dueToday: number; completed: number }) {
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
          <Text style={styles.bannerStatValue}>{dueToday}</Text>
        </View>
        <View style={styles.bannerStat}>
          <Text style={styles.bannerStatLabel}>Completed</Text>
          <Text style={styles.bannerStatValue}>{completed}</Text>
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
  item: TodoItem;
  onToggle: () => void;
}) {
  const formatDateLabel = (dateStr: string | null) => {
    if (!dateStr) return 'No date';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <View style={styles.todoCard}>
      <View style={styles.todoTop}>
        <View style={styles.todoLeft}>
          <View style={styles.todoTitleRow}>
            <Text style={[styles.todoTitle, item.is_done && styles.todoTitleDone]}>
              {item.title}
            </Text>
            <PriorityBadge priority={item.priority} />
          </View>
          <View style={styles.tagRow}>
            <View style={styles.tag}>
              <Text style={styles.tagTextBold}>
                {formatDateLabel(item.due_date || item.date)}
              </Text>
            </View>
            <View style={styles.tag}>
              <Text style={styles.tagText} numberOfLines={1}>
                {item.description || 'Task'}
              </Text>
            </View>
          </View>
        </View>
        <Pressable style={styles.checkBtn} onPress={onToggle} disabled={item.is_done}>
          <MaterialIcons
            name={item.is_done ? 'check-box' : 'check-box-outline-blank'}
            size={20}
            color={item.is_done ? OmniColors.ink : '#A1A1AA'}
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
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTodos = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      const res = await listTodos();
      setTodos(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tasks');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  const toggleTodo = async (id: string) => {
    // Find item
    const item = todos.find((t) => t.id === id);
    if (!item || item.is_done) return;

    // Optimistically mark as done
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, is_done: true } : t)),
    );

    try {
      await completeTodoApi(id);
    } catch (err) {
      // Revert if error
      setTodos((prev) =>
        prev.map((t) => (t.id === id ? { ...t, is_done: false } : t)),
      );
      alert(err instanceof Error ? err.message : 'Failed to mark task as completed');
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];

  // Dynamic banner stats
  const dueTodayCount = todos.filter(
    (t) => !t.is_done && (t.due_date === todayStr || t.date === todayStr)
  ).length;

  const completedCount = todos.filter((t) => t.is_done).length;

  // Filter list by Tab
  const filtered = todos.filter((todo) => {
    if (activeTab === 'today') {
      return !todo.is_done && (todo.due_date === todayStr || todo.date === todayStr);
    }
    if (activeTab === 'upcoming') {
      const due = todo.due_date || todo.date;
      return !todo.is_done && due > todayStr;
    }
    if (activeTab === 'done') {
      return todo.is_done;
    }
    return true;
  });

  // Filter list by Search text
  const displayed = search.trim()
    ? filtered.filter(
        (todo) =>
          todo.title.toLowerCase().includes(search.toLowerCase()) ||
          (todo.description && todo.description.toLowerCase().includes(search.toLowerCase()))
      )
    : filtered;

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
            onPress={() => fetchTodos()}
          >
            <Text style={{ fontFamily: OmniFonts.bodySemiBold, fontSize: 14, color: '#fff' }}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TodoCard item={item} onToggle={() => toggleTodo(item.id)} />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchTodos(true)} tintColor={OmniColors.ink} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No tasks found</Text>
              <Text style={styles.emptySubtext}>Tasks created through chat will appear here.</Text>
            </View>
          }
          ListHeaderComponent={
            <View style={styles.header}>
              <Pressable style={styles.backBtn} onPress={() => router.back()}>
                <MaterialIcons name="arrow-back" size={14} color="#71717A" />
                <Text style={styles.backText}>back</Text>
              </Pressable>

              <Text style={styles.screenTitle}>To Do List</Text>

              <SummaryBanner dueToday={dueTodayCount} completed={completedCount} />
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
