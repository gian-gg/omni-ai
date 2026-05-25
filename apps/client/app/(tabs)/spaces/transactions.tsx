import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  Keyboard,
} from 'react-native';
import { OmniDatePicker } from '@/components/ui/OmniDatePicker';
import { OmniActionSheet, ActionOption } from '@/components/ui/OmniActionSheet';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { OmniColors, OmniFonts, OmniGradient } from '@/constants/theme';
import {
  listTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  type TransactionItem,
  type TransactionUpdatePayload,
} from '@/api/client';

// ── Types ───────────────────────────────────────────────────────────

type TabKey = 'all' | 'income' | 'expenses';

function formatAmount(item: TransactionItem): string {
  const sign = item.type === 'expense' ? '-' : '+';
  return `${sign}$${item.amount.toFixed(2)}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (isToday) return `Today, ${time}`;
  if (isYesterday) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`;
}

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all',      label: 'All' },
  { key: 'income',   label: 'Income' },
  { key: 'expenses', label: 'Expenses' },
];

// ── Sub-components ──────────────────────────────────────────────────

function BalanceCard({ income, expenses }: { income: number; expenses: number }) {
  const balance = income - expenses;
  return (
    <LinearGradient
      colors={OmniGradient}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={styles.balanceCard}
    >
      <Text style={styles.balanceLabel}>Current balance</Text>
      <Text style={styles.balanceAmount}>${balance.toFixed(2)}</Text>
    </LinearGradient>
  );
}

function SummaryRow({ income, expenses }: { income: number; expenses: number }) {
  return (
    <View style={styles.summaryRow}>
      <View style={styles.summaryItem}>
        <Text style={styles.summaryLabel}>Total expenses</Text>
        <Text style={styles.summaryAmount}>${expenses.toFixed(2)}</Text>
      </View>
      <View style={styles.summaryItem}>
        <Text style={styles.summaryLabel}>Total income</Text>
        <Text style={styles.summaryAmount}>${income.toFixed(2)}</Text>
      </View>
    </View>
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
  onFilterPress,
  onSortPress,
}: {
  value: string;
  onChangeText: (t: string) => void;
  onFilterPress: () => void;
  onSortPress: () => void;
}) {
  return (
    <View style={styles.toolbarCard}>
      <View style={styles.toolbarInner}>
        <View style={styles.searchBox}>
          <MaterialIcons name="search" size={14} color="#71717A" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search transactions..."
            placeholderTextColor="#A1A1AA"
            value={value}
            onChangeText={onChangeText}
          />
        </View>
        <Pressable style={styles.toolBtn} onPress={onFilterPress}>
          <MaterialIcons name="filter-list" size={14} color={OmniColors.charcoal} />
        </Pressable>
        <Pressable style={[styles.toolBtn, styles.toolBtnSubtle]} onPress={onSortPress}>
          <MaterialIcons name="swap-vert" size={14} color="#52525B" />
        </Pressable>
      </View>
    </View>
  );
}

function TransactionCard({
  item,
  onEdit,
}: {
  item: TransactionItem;
  onEdit: () => void;
}) {
  const tags: string[] = [];
  if (item.category) tags.push(item.category);
  if (item.currency !== 'USD') tags.push(item.currency);

  return (
    <Pressable
      onPress={onEdit}
      style={({ pressed }) => [
        styles.txCard,
        pressed && { opacity: 0.6 }
      ]}
    >
      {/* Top row */}
      <View style={styles.txTop}>
        <View style={styles.txLeft}>
          <Text style={styles.txTitle}>{item.description || item.category || 'Transaction'}</Text>
          {tags.length > 0 && (
            <View style={styles.tagRow}>
              {tags.map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
        <View style={styles.txRight}>
          <Text style={[styles.txAmount, item.type === 'income' && { color: '#047857' }]}>
            {formatAmount(item)}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: item.type === 'income' ? '#ECFDF5' : '#FEF2F2' }]}>
            <Text style={[styles.statusBadgeText, { color: item.type === 'income' ? '#047857' : '#B91C1C' }]}>
              {item.type === 'income' ? 'Income' : 'Expense'}
            </Text>
          </View>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.txFooter}>
        <View style={styles.txDateRow}>
          <MaterialIcons name="date-range" size={12} color="#71717A" />
          <Text style={styles.txFooterText}>{formatDate(item.created_at)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

// ── Edit Modal ──────────────────────────────────────────────────────

function EditTransactionModal({
  item,
  visible,
  onClose,
  onSave,
  onDelete,
  isAdding,
}: {
  item: TransactionItem | null;
  visible: boolean;
  onClose: () => void;
  onSave: (id: string | null, payload: TransactionUpdatePayload) => void;
  onDelete: (id: string) => void;
  isAdding?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [editFields, setEditFields] = useState({
    type: 'expense' as 'income' | 'expense',
    amount: 0,
    description: '',
    category: '',
    date: new Date(),
  });
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (item) {
      setEditFields({
        type: item.type,
        amount: item.amount,
        description: item.description || '',
        category: item.category || '',
        date: item.date ? new Date(item.date) : new Date(item.created_at || Date.now()),
      });
    } else if (isAdding) {
      setEditFields({
        type: 'expense',
        amount: 0,
        description: '',
        category: '',
        date: new Date(),
      });
    }
  }, [item, isAdding]);

  if (!item && !isAdding) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable 
          style={[
            styles.modalSheet, 
            { paddingBottom: (insets.bottom > 0 ? insets.bottom + 24 : 24) + keyboardHeight, width: '100%' }
          ]} 
          onPress={() => {}}
        >
            {/* Drag handle */}
            <View style={styles.modalHandle} />

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text style={[styles.modalTitle, { marginBottom: 0 }]}>{isAdding ? 'Add Transaction' : 'Edit Transaction'}</Text>
              {!isAdding && item && (
                <Pressable onPress={() => onDelete(item.id)}>
                  <MaterialIcons name="delete-outline" size={24} color="#EF4444" />
                </Pressable>
              )}
            </View>

            {/* Amount display */}
            <View style={styles.modalAmountRow}>
              <Text style={[
                styles.modalAmountText,
                editFields.type === 'income' ? { color: '#047857' } : { color: OmniColors.ink },
              ]}>
                {editFields.type === 'expense' ? '-' : '+'}${(editFields.amount || 0).toFixed(2)}
              </Text>
            </View>

            {/* Type toggle */}
            <Text style={styles.editLabel}>Type</Text>
            <View style={styles.typeToggleRow}>
              <Pressable
                style={[styles.typeToggleBtn, editFields.type === 'expense' && styles.typeToggleBtnActive]}
                onPress={() => setEditFields({ ...editFields, type: 'expense' })}
              >
                <Text style={[styles.typeToggleText, editFields.type === 'expense' && styles.typeToggleTextActive]}>
                  Expense
                </Text>
              </Pressable>
              <Pressable
                style={[styles.typeToggleBtn, editFields.type === 'income' && styles.typeToggleBtnActive]}
                onPress={() => setEditFields({ ...editFields, type: 'income' })}
              >
                <Text style={[styles.typeToggleText, editFields.type === 'income' && styles.typeToggleTextActive]}>
                  Income
                </Text>
              </Pressable>
            </View>

            {/* Fields */}
            <Text style={styles.editLabel}>Date</Text>
            <Pressable
              style={styles.editInput}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={{ color: editFields.date ? OmniColors.ink : '#A1A1AA' }}>
                {editFields.date ? editFields.date.toISOString().split('T')[0] : 'YYYY-MM-DD'}
              </Text>
            </Pressable>

            {/* Date Picker Modal */}
            <OmniDatePicker
              visible={showDatePicker}
              value={editFields.date || new Date()}
              onClose={() => setShowDatePicker(false)}
              onChange={(selectedDate) => {
                setEditFields({ ...editFields, date: selectedDate });
              }}
            />

            <Text style={styles.editLabel}>Amount ($)</Text>
            <TextInput
              style={styles.editInput}
              keyboardType="numeric"
              value={String(editFields.amount || '')}
              onChangeText={(val) => {
                const amt = parseFloat(val);
                setEditFields({ ...editFields, amount: isNaN(amt) ? 0 : amt });
              }}
            />

            <Text style={styles.editLabel}>Description</Text>
            <TextInput
              style={styles.editInput}
              value={editFields.description}
              placeholder="What was this for?"
              placeholderTextColor="#A1A1AA"
              onChangeText={(val) => setEditFields({ ...editFields, description: val })}
            />

            <Text style={styles.editLabel}>Category</Text>
            <TextInput
              style={styles.editInput}
              value={editFields.category}
              placeholder="e.g. Food, Transport"
              placeholderTextColor="#A1A1AA"
              onChangeText={(val) => setEditFields({ ...editFields, category: val })}
            />

            {/* Actions */}
            <View style={styles.editActions}>
              <Pressable style={styles.editCancelBtn} onPress={onClose}>
                <Text style={styles.editCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.editSaveBtn}
                onPress={() =>
                  onSave(item ? item.id : null, {
                    type: editFields.type,
                    amount: editFields.amount,
                    description: editFields.description || null,
                    category: editFields.category || null,
                    date: editFields.date ? editFields.date.toISOString().split('T')[0] : undefined,
                  })
                }
              >
                <Text style={styles.editSaveText}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
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
          <Text style={styles.confirmTitle}>Delete Transaction?</Text>
          <Text style={styles.confirmText}>
            Are you sure you want to delete this transaction? This action cannot be undone.
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

export default function TransactionsScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [search, setSearch] = useState('');
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<TransactionItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortConfig, setSortConfig] = useState<{ by: 'date' | 'amount', asc: boolean }>({ by: 'date', asc: false });
  const [actionSheet, setActionSheet] = useState<{ visible: boolean, title: string, options: ActionOption[] }>({ visible: false, title: '', options: [] });

  const fetchTransactions = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      const data = await listTransactions();
      setTransactions(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transactions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const handleUpdate = async (id: string | null, payload: TransactionUpdatePayload) => {
    try {
      if (id) {
        const updated = await updateTransaction(id, payload);
        setTransactions((prev) =>
          prev.map((tx) => (tx.id === id ? updated : tx)),
        );
        setEditingItem(null);
      } else {
        const created = await createTransaction(payload);
        setTransactions((prev) => [created, ...prev]);
        setIsAdding(false);
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save transaction');
    }
  };

  const executeDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteTransaction(deletingId);
      setTransactions((prev) => prev.filter((tx) => tx.id !== deletingId));
      setDeletingId(null);
      setEditingItem(null); // Close modal if open
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete transaction');
    }
  };

  const handleFilterPress = () => {
    // Dynamically get unique categories from filtered transactions (respecting activeTab)
    const allCategories = new Set<string>();
    filtered.forEach(tx => {
      if (tx.category) allCategories.add(tx.category.toLowerCase());
    });
    const uniqueCategories = Array.from(allCategories).sort();

    const options: ActionOption[] = [
      { label: 'All Categories', onPress: () => setCategoryFilter('all') }
    ];

    // Capitalize first letter for display
    uniqueCategories.forEach(cat => {
      const displayLabel = cat.charAt(0).toUpperCase() + cat.slice(1);
      options.push({ label: displayLabel, onPress: () => setCategoryFilter(cat) });
    });

    setActionSheet({
      visible: true,
      title: 'Filter by Category',
      options
    });
  };

  const handleSortPress = () => {
    setActionSheet({
      visible: true,
      title: 'Sort Transactions',
      options: [
        { label: 'Date (Newest)', onPress: () => setSortConfig({ by: 'date', asc: false }) },
        { label: 'Date (Oldest)', onPress: () => setSortConfig({ by: 'date', asc: true }) },
        { label: 'Amount (Highest)', onPress: () => setSortConfig({ by: 'amount', asc: false }) },
        { label: 'Amount (Lowest)', onPress: () => setSortConfig({ by: 'amount', asc: true }) },
      ]
    });
  };

  // Filter by tab
  const filtered = transactions.filter((tx) => {
    if (activeTab === 'income') return tx.type === 'income';
    if (activeTab === 'expenses') return tx.type === 'expense';
    return true;
  });

  // Filter by search
  let displayed = search.trim()
    ? filtered.filter(
        (tx) =>
          tx.description?.toLowerCase().includes(search.toLowerCase()) ||
          tx.category?.toLowerCase().includes(search.toLowerCase())
      )
    : filtered;

  if (categoryFilter !== 'all') {
    displayed = displayed.filter(tx => tx.category?.toLowerCase() === categoryFilter.toLowerCase());
  }

  const sortedAndDisplayed = [...displayed].sort((a, b) => {
    if (sortConfig.by === 'date') {
      const da = new Date(a.date || a.created_at || 0).getTime();
      const db = new Date(b.date || b.created_at || 0).getTime();
      return sortConfig.asc ? da - db : db - da;
    } else {
      return sortConfig.asc ? a.amount - b.amount : b.amount - a.amount;
    }
  });

  // Calculate summaries from real data
  const totalIncome = transactions
    .filter((tx) => tx.type === 'income')
    .reduce((sum, tx) => sum + tx.amount, 0);
  const totalExpenses = transactions
    .filter((tx) => tx.type === 'expense')
    .reduce((sum, tx) => sum + tx.amount, 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={sortedAndDisplayed}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TransactionCard
            item={item}
            onEdit={() => setEditingItem(item)}
          />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => fetchTransactions(true)} tintColor={OmniColors.ink} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            {/* Back */}
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <MaterialIcons name="arrow-back" size={14} color="#71717A" />
              <Text style={styles.backText}>back</Text>
            </Pressable>

            <Text style={styles.screenTitle}>Transactions</Text>

            {/* Overview cards */}
            <View style={styles.overviewSection}>
              <BalanceCard income={totalIncome} expenses={totalExpenses} />
              <SummaryRow income={totalIncome} expenses={totalExpenses} />
            </View>

            {/* Tabs + Search */}
            <FilterTabs active={activeTab} onSelect={setActiveTab} />
            <SearchBar 
              value={search} 
              onChangeText={setSearch} 
              onFilterPress={handleFilterPress}
              onSortPress={handleSortPress}
            />
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
              <Pressable onPress={() => fetchTransactions()}>
                <Text style={styles.retryText}>Tap to retry</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No transactions yet</Text>
              <Text style={styles.emptySubtext}>Transactions created through chat will appear here.</Text>
            </View>
          )
        }
      />

      <Pressable
        onPress={() => setIsAdding(true)}
        style={({ pressed }) => [
          styles.fab,
          pressed && { opacity: 0.8 }
        ]}
      >
        <MaterialIcons name="add" size={24} color="#fff" />
      </Pressable>

      <EditTransactionModal
        item={editingItem}
        visible={editingItem !== null || isAdding}
        isAdding={isAdding}
        onClose={() => {
          setEditingItem(null);
          setIsAdding(false);
        }}
        onSave={handleUpdate}
        onDelete={(id) => setDeletingId(id)}
      />

      <ConfirmDeleteModal
        visible={deletingId !== null}
        onClose={() => setDeletingId(null)}
        onConfirm={executeDelete}
      />
      <OmniActionSheet
        visible={actionSheet.visible}
        title={actionSheet.title}
        options={actionSheet.options}
        onClose={() => setActionSheet(prev => ({ ...prev, visible: false }))}
      />
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: OmniColors.paper },
  listContent: { paddingHorizontal: 16, paddingBottom: 32, gap: 8 },

  // Header block
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

  // FAB
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: OmniColors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },

  // Overview
  overviewSection: { gap: 6 },
  balanceCard: {
    borderRadius: 16,
    padding: 12,
  },
  balanceLabel: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: OmniColors.fog,
  },
  balanceAmount: {
    fontFamily: OmniFonts.data,
    fontSize: 28,
    color: '#fff',
    marginTop: 2,
  },
  balanceDelta: {
    fontFamily: OmniFonts.body,
    fontSize: 12,
    color: OmniColors.fog,
  },

  // Summary row
  summaryRow: { flexDirection: 'row', gap: 6 },
  summaryItem: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: OmniColors.mist,
    backgroundColor: '#fff',
    padding: 10,
  },
  summaryLabel: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#71717A',
  },
  summaryAmount: {
    fontFamily: OmniFonts.data,
    fontSize: 18,
    color: OmniColors.ink,
    marginTop: 2,
  },
  summaryPeriod: {
    fontFamily: OmniFonts.body,
    fontSize: 12,
    color: '#71717A',
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

  // Transaction card
  txCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: OmniColors.mist,
    backgroundColor: '#fff',
    padding: 12,
  },
  txTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  txLeft: { flex: 1, minWidth: 0 },
  txTitle: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 15,
    color: OmniColors.charcoal,
    lineHeight: 20,
  },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  tag: {
    backgroundColor: OmniColors.cloud,
    borderRadius: 100,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagText: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 11,
    color: '#52525B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  txRight: { alignItems: 'flex-end', gap: 4 },
  txAmount: {
    fontFamily: OmniFonts.data,
    fontSize: 15,
    color: OmniColors.ink,
  },

  // Status badge
  statusBadge: { borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeText: { fontFamily: OmniFonts.bodySemiBold, fontSize: 11 },

  // Footer
  txFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: OmniColors.cloud,
    marginTop: 8,
    paddingTop: 6,
  },
  txDateRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  txFooterText: {
    fontFamily: OmniFonts.body,
    fontSize: 12,
    color: '#71717A',
  },
  txSource: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 12,
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
  retryText: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 13,
    color: OmniColors.ink,
    marginTop: 4,
  },

  // Card action buttons
  cardActionBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: OmniColors.mist,
    backgroundColor: OmniColors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardActionBtnDanger: {
    borderColor: '#FECDD3',
    backgroundColor: '#FFF1F2',
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
  modalAmountRow: {
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 4,
  },
  modalAmountText: {
    fontFamily: OmniFonts.data,
    fontSize: 32,
    color: OmniColors.ink,
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
