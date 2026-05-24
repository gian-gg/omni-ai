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
  listNotes,
  updateNote,
  deleteNote,
  NoteItem,
  NoteUpdatePayload,
} from '@/api/client';

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

function ThoughtCard({
  item,
  onEdit,
  onTogglePin,
}: {
  item: NoteItem;
  onEdit: () => void;
  onTogglePin: () => void;
}) {
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
    <Pressable
      onPress={onEdit}
      style={({ pressed }) => [
        styles.thoughtCard,
        pressed && { opacity: 0.6 }
      ]}
    >
      <View style={styles.thoughtTop}>
        <View style={styles.thoughtLeft}>
          <View style={styles.metaRow}>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{getCategory(item.tags)}</Text>
            </View>
            <Text style={styles.timeText}>{formatTime(item.created_at)}</Text>
          </View>
          <Text style={styles.thoughtTitle}>{item.title || 'Untitled thought'}</Text>
          <Text style={styles.thoughtBody} numberOfLines={1}>{item.content}</Text>
        </View>
        <Pressable style={[styles.actionBtn, isPinned && { backgroundColor: OmniColors.paper }]} onPress={onTogglePin}>
          <Text style={[styles.actionBtnText, isPinned && { color: OmniColors.ink }]}>{isPinned ? 'Pinned' : 'Pin'}</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

// ── Edit Modal ──────────────────────────────────────────────────────

function EditNoteModal({
  item,
  visible,
  onClose,
  onSave,
  onDelete,
}: {
  item: NoteItem | null;
  visible: boolean;
  onClose: () => void;
  onSave: (id: string, payload: NoteUpdatePayload) => void;
  onDelete: (id: string) => void;
}) {
  const [editFields, setEditFields] = useState({
    title: '',
    content: '',
  });

  useEffect(() => {
    if (item) {
      setEditFields({
        title: item.title || '',
        content: item.content || '',
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
              <Text style={[styles.modalTitle, { marginBottom: 0 }]}>Edit Thought</Text>
              <Pressable onPress={() => onDelete(item.id)}>
                <MaterialIcons name="delete-outline" size={24} color="#EF4444" />
              </Pressable>
            </View>

            <Text style={styles.editLabel}>Title</Text>
            <TextInput
              style={styles.editInput}
              value={editFields.title}
              placeholder="Thought title"
              placeholderTextColor="#A1A1AA"
              onChangeText={(val) => setEditFields({ ...editFields, title: val })}
            />

            <Text style={styles.editLabel}>Content</Text>
            <TextInput
              style={[styles.editInput, styles.editInputMultiline]}
              value={editFields.content}
              placeholder="What's on your mind?"
              placeholderTextColor="#A1A1AA"
              multiline
              onChangeText={(val) => setEditFields({ ...editFields, content: val })}
            />

            {/* Actions */}
            <View style={styles.editActions}>
              <Pressable style={styles.editCancelBtn} onPress={onClose}>
                <Text style={styles.editCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.editSaveBtn,
                  !editFields.content.trim() && { opacity: 0.5, backgroundColor: OmniColors.fog }
                ]}
                disabled={!editFields.content.trim()}
                onPress={() => {
                  onSave(item.id, {
                    title: editFields.title || null,
                    content: editFields.content,
                  });
                }}
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
          <Text style={styles.confirmTitle}>Delete Thought?</Text>
          <Text style={styles.confirmText}>
            Are you sure you want to delete this thought? This action cannot be undone.
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

export default function ThoughtsScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [search, setSearch] = useState('');
  const [thoughts, setThoughts] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<NoteItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  const handleUpdate = async (id: string, payload: NoteUpdatePayload) => {
    try {
      const updated = await updateNote(id, payload);
      setThoughts((prev) => prev.map((t) => (t.id === id ? updated : t)));
      setEditingItem(null);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update thought');
    }
  };

  const executeDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteNote(deletingId);
      setThoughts((prev) => prev.filter((t) => t.id !== deletingId));
      setDeletingId(null);
      setEditingItem(null);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete thought');
    }
  };

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

  // Sort pinned to top, then by creation date
  const sortedAndDisplayed = [...displayed].sort((a, b) => {
    const aPinned = a.tags.some((t) => t.toLowerCase() === 'pinned' || t.toLowerCase() === 'pin');
    const bPinned = b.tags.some((t) => t.toLowerCase() === 'pinned' || t.toLowerCase() === 'pin');

    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;

    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const totalCount = thoughts.length;
  const pinnedCount = thoughts.filter((t) =>
    t.tags.some((tag) => tag.toLowerCase() === 'pinned' || tag.toLowerCase() === 'pin')
  ).length;

  const togglePin = async (id: string) => {
    const item = thoughts.find((t) => t.id === id);
    if (!item) return;

    const isPinned = item.tags.some((t) => t.toLowerCase() === 'pinned' || t.toLowerCase() === 'pin');
    const newTags = isPinned
      ? item.tags.filter((t) => t.toLowerCase() !== 'pinned' && t.toLowerCase() !== 'pin')
      : [...item.tags, 'pinned'];

    // Optimistically update
    setThoughts((prev) => prev.map((t) => (t.id === id ? { ...t, tags: newTags } : t)));

    try {
      await updateNote(id, { tags: newTags });
    } catch (err) {
      // Revert if error
      setThoughts((prev) => prev.map((t) => (t.id === id ? { ...t, tags: item.tags } : t)));
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update pin status');
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={sortedAndDisplayed}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ThoughtCard item={item} onEdit={() => setEditingItem(item)} onTogglePin={() => togglePin(item.id)} />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => fetchThoughts(true)} tintColor={OmniColors.ink} />
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
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color={OmniColors.ink} />
            </View>
          ) : error ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>{error}</Text>
              <Pressable onPress={() => fetchThoughts()}>
                <Text style={{ fontFamily: OmniFonts.bodySemiBold, fontSize: 14, color: OmniColors.ink, marginTop: 4 }}>
                  Tap to retry
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No thoughts found</Text>
              <Text style={styles.emptySubtext}>Thoughts created through chat will appear here.</Text>
            </View>
          )
        }
      />

      <EditNoteModal
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
