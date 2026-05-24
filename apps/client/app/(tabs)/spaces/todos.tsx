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
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OmniColors, OmniFonts, OmniGradient } from '@/constants/theme';
import {
  listTodos,
  completeTodoApi,
  updateTodo,
  deleteTodo,
  TodoItem,
  TodoUpdatePayload,
} from '@/api/client';

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
  onEdit,
}: {
  item: TodoItem;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const formatDateLabel = (dateStr: string | null) => {
    if (!dateStr) return 'No date';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <Pressable
      onPress={onEdit}
      style={({ pressed }) => [
        styles.todoCard,
        pressed && { opacity: 0.6 }
      ]}
    >
      <View style={styles.todoTop}>
        <View style={styles.todoLeft}>
          <View style={styles.todoTitleRow}>
            <Text style={[styles.todoTitle, item.is_done && styles.todoTitleDone]}>
              {item.title}
            </Text>
            <PriorityBadge priority={item.priority} />
          </View>
          <View style={styles.tagRow}>
            {(item.due_date || item.date) && (
              <View style={styles.tag}>
                <Text style={styles.tagTextBold}>
                  {formatDateLabel(item.due_date || item.date)}
                </Text>
              </View>
            )}
            {item.description ? (
              <View style={[styles.tag, { paddingHorizontal: 6 }]}>
                <MaterialIcons name="notes" size={14} color="#52525B" />
              </View>
            ) : null}
          </View>
        </View>
        <Pressable style={styles.checkBtn} onPress={onToggle}>
          <MaterialIcons
            name={item.is_done ? 'check-box' : 'check-box-outline-blank'}
            size={20}
            color={item.is_done ? OmniColors.ink : '#A1A1AA'}
          />
        </Pressable>
      </View>
    </Pressable>
  );
}

// ── Edit Modal ──────────────────────────────────────────────────────

function EditTodoModal({
  item,
  visible,
  onClose,
  onSave,
  onDelete,
}: {
  item: TodoItem | null;
  visible: boolean;
  onClose: () => void;
  onSave: (id: string, payload: TodoUpdatePayload) => void;
  onDelete: (id: string) => void;
}) {
  const [editFields, setEditFields] = useState({
    title: '',
    description: '',
    due_date: '',
    priority: 'medium' as Priority,
  });

  useEffect(() => {
    if (item) {
      setEditFields({
        title: item.title,
        description: item.description || '',
        due_date: item.due_date || '',
        priority: item.priority,
      });
    }
  }, [item]);

  if (!item) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ width: '100%' }}
        >
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            {/* Drag handle */}
            <View style={styles.modalHandle} />

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={[styles.modalTitle, { marginBottom: 0 }]}>Edit To-Do</Text>
              <Pressable onPress={() => onDelete(item.id)}>
                <MaterialIcons name="delete-outline" size={24} color="#EF4444" />
              </Pressable>
            </View>

            <Text style={styles.editLabel}>Title</Text>
            <TextInput
              style={styles.editInput}
              value={editFields.title}
              placeholder="Task title"
              placeholderTextColor="#A1A1AA"
              onChangeText={(val) => setEditFields({ ...editFields, title: val })}
            />

            <Text style={styles.editLabel}>Priority</Text>
            <View style={styles.typeToggleRow}>
              {(['low', 'medium', 'high'] as Priority[]).map((p) => (
                <Pressable
                  key={p}
                  style={[styles.typeToggleBtn, editFields.priority === p && styles.typeToggleBtnActive]}
                  onPress={() => setEditFields({ ...editFields, priority: p })}
                >
                  <Text
                    style={[
                      styles.typeToggleText,
                      editFields.priority === p && styles.typeToggleTextActive,
                      { textTransform: 'capitalize' }
                    ]}
                  >
                    {p}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.editLabel}>Description</Text>
            <TextInput
              style={[styles.editInput, styles.editInputMultiline]}
              value={editFields.description}
              placeholder="Additional details..."
              placeholderTextColor="#A1A1AA"
              multiline
              onChangeText={(val) => setEditFields({ ...editFields, description: val })}
            />

            <Text style={styles.editLabel}>Due Date</Text>
            <TextInput
              style={styles.editInput}
              value={editFields.due_date}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#A1A1AA"
              onChangeText={(val) => setEditFields({ ...editFields, due_date: val })}
            />

            {/* Actions */}
            <View style={styles.editActions}>
              <Pressable style={styles.editCancelBtn} onPress={onClose}>
                <Text style={styles.editCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.editSaveBtn}
                onPress={() =>
                  onSave(item.id, {
                    title: editFields.title,
                    description: editFields.description || null,
                    due_date: editFields.due_date || null,
                    priority: editFields.priority,
                  })
                }
              >
                <Text style={styles.editSaveText}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// ── Confirm Delete Modal ────────────────────────────────────────────

function ConfirmDeleteModal({
  visible,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlayCenter} onPress={onClose}>
        <Pressable style={styles.confirmModalBox} onPress={() => {}}>
          <View style={styles.confirmIconBox}>
            <MaterialIcons name="delete-outline" size={24} color="#EF4444" />
          </View>
          <Text style={styles.confirmTitle}>Delete Task?</Text>
          <Text style={styles.confirmText}>
            Are you sure you want to delete this to-do? This action cannot be undone.
          </Text>
          <View style={styles.confirmActions}>
            <Pressable style={styles.confirmCancelBtn} onPress={onClose}>
              <Text style={styles.confirmCancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.confirmDeleteBtn} onPress={onConfirm}>
              <Text style={styles.confirmDeleteText}>Delete</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
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
  const [editingItem, setEditingItem] = useState<TodoItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
    if (!item) return;

    const newStatus = !item.is_done;

    // Optimistically toggle
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, is_done: newStatus } : t)),
    );

    try {
      if (newStatus) {
        await completeTodoApi(id);
      } else {
        await updateTodo(id, { is_done: false });
      }
    } catch (err) {
      // Revert if error
      setTodos((prev) =>
        prev.map((t) => (t.id === id ? { ...t, is_done: item.is_done } : t)),
      );
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update task');
    }
  };

  const handleUpdate = async (id: string, payload: TodoUpdatePayload) => {
    try {
      const updated = await updateTodo(id, payload);
      setTodos((prev) => prev.map((t) => (t.id === id ? updated : t)));
      setEditingItem(null);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update task');
    }
  };

  const executeDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteTodo(deletingId);
      setTodos((prev) => prev.filter((t) => t.id !== deletingId));
      setDeletingId(null);
      setEditingItem(null); // Close edit modal as well
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete task');
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];

  // Dynamic banner stats
  const dueTodayCount = todos.filter((t) => {
    const effectiveDate = t.due_date || t.date;
    return !t.is_done && effectiveDate === todayStr;
  }).length;

  const completedCount = todos.filter((t) => t.is_done).length;

  // Filter list by Tab
  const filtered = todos.filter((todo) => {
    const effectiveDate = todo.due_date || todo.date;

    if (activeTab === 'today') {
      return !todo.is_done && effectiveDate === todayStr;
    }
    if (activeTab === 'upcoming') {
      return !todo.is_done && effectiveDate > todayStr;
    }
    if (activeTab === 'done') {
      return todo.is_done;
    }
    // "all" tab
    return !todo.is_done;
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
      <FlatList
        data={displayed}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TodoCard
            item={item}
            onToggle={() => toggleTodo(item.id)}
            onEdit={() => setEditingItem(item)}
          />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => fetchTodos(true)} tintColor={OmniColors.ink} />
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
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color={OmniColors.ink} />
            </View>
          ) : error ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>{error}</Text>
              <Pressable onPress={() => fetchTodos()}>
                <Text style={{ fontFamily: OmniFonts.bodySemiBold, fontSize: 14, color: OmniColors.ink, marginTop: 4 }}>
                  Tap to retry
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No tasks found</Text>
              <Text style={styles.emptySubtext}>Tasks created through chat will appear here.</Text>
            </View>
          )
        }
      />

      <EditTodoModal
        item={editingItem}
        visible={editingItem !== null}
        onClose={() => setEditingItem(null)}
        onSave={handleUpdate}
        onDelete={(id) => setDeletingId(id)}
      />

      <ConfirmDeleteModal
        visible={deletingId !== null}
        onClose={() => setDeletingId(null)}
        onConfirm={executeDelete}
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
  todoDescription: {
    fontFamily: OmniFonts.body,
    fontSize: 13,
    color: '#71717A',
    marginTop: 4,
    lineHeight: 18,
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

  // Modal bottom sheet
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 12,
    gap: 8,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D4D4D8',
    alignSelf: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontFamily: OmniFonts.heading,
    fontSize: 18,
    color: OmniColors.ink,
    marginBottom: 4,
  },
  editLabel: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 11,
    color: '#71717A',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  editInput: {
    fontFamily: OmniFonts.body,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FAFAFA',
    color: '#18181B',
  },
  editInputMultiline: {
    minHeight: 80,
    maxHeight: 160,
    textAlignVertical: 'top',
  },
  typeToggleRow: {
    flexDirection: 'row',
    gap: 6,
  },
  typeToggleBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    backgroundColor: '#FAFAFA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeToggleBtnActive: {
    backgroundColor: OmniColors.ink,
    borderColor: OmniColors.ink,
  },
  typeToggleText: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 13,
    color: '#71717A',
  },
  typeToggleTextActive: {
    color: '#fff',
  },
  editActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  editCancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: OmniColors.mist,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editCancelText: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 14,
    color: '#52525B',
  },
  editSaveBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: OmniColors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editSaveText: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 14,
    color: '#fff',
  },

  // Confirm delete modal
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  confirmModalBox: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
  },
  confirmIconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  confirmTitle: {
    fontFamily: OmniFonts.heading,
    fontSize: 18,
    color: OmniColors.ink,
    textAlign: 'center',
    marginBottom: 8,
  },
  confirmText: {
    fontFamily: OmniFonts.body,
    fontSize: 14,
    color: '#52525B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  confirmCancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: OmniColors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancelText: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 14,
    color: '#52525B',
  },
  confirmDeleteBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmDeleteText: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 14,
    color: '#fff',
  },
});
