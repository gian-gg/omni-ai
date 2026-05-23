import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OmniColors, OmniFonts, OmniGradient } from '@/constants/theme';
import { listTransactions, type TransactionItem } from '@/api/client';

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
            placeholder="Search transactions..."
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
        <Pressable style={styles.toolBtn}>
          <MaterialIcons name="date-range" size={14} color="#52525B" />
        </Pressable>
      </View>
    </View>
  );
}

function TransactionCard({ item }: { item: TransactionItem }) {
  const tags: string[] = [];
  if (item.category) tags.push(item.category);
  if (item.currency !== 'USD') tags.push(item.currency);

  return (
    <View style={styles.txCard}>
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
    </View>
  );
}

// ── Screen ──────────────────────────────────────────────────────────

export default function TransactionsScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [search, setSearch] = useState('');
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await listTransactions();
      setTransactions(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Filter by tab
  const filtered = transactions.filter((tx) => {
    if (activeTab === 'income') return tx.type === 'income';
    if (activeTab === 'expenses') return tx.type === 'expense';
    return true;
  });

  // Filter by search
  const displayed = search.trim()
    ? filtered.filter(
        (tx) =>
          (tx.description ?? '').toLowerCase().includes(search.toLowerCase()) ||
          (tx.category ?? '').toLowerCase().includes(search.toLowerCase()),
      )
    : filtered;

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
        data={displayed}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <TransactionCard item={item} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
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
              <Pressable onPress={fetchTransactions}>
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
});
