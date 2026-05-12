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

type TransactionStatus = 'saved' | 'needs_receipt' | 'draft';

type Transaction = {
  id: string;
  title: string;
  amount: string;
  tags: string[];
  status: TransactionStatus;
  date: string;
  source: string;
};

type TabKey = 'all' | 'income' | 'expenses';

// ── Static data (swap with API later) ───────────────────────────────

const TRANSACTIONS: Transaction[] = [
  {
    id: '1',
    title: 'Lunch with Priya',
    amount: '-$42.50',
    tags: ['Client meeting', 'Card •••• 1924'],
    status: 'saved',
    date: 'Today, 9:42 AM',
    source: 'From Chat',
  },
  {
    id: '2',
    title: 'Design tools subscription',
    amount: '-$96.00',
    tags: ['Software', 'SaaS recurring'],
    status: 'needs_receipt',
    date: 'Yesterday, 5:18 PM',
    source: 'Autocaptured',
  },
  {
    id: '3',
    title: 'Workspace coffee run',
    amount: '-$17.20',
    tags: ['Office supplies', 'Pending review'],
    status: 'draft',
    date: 'Yesterday, 11:03 AM',
    source: 'Manual entry',
  },
  {
    id: '4',
    title: 'Team dinner',
    amount: '-$188.40',
    tags: ['Team event', 'Split expense'],
    status: 'saved',
    date: 'Feb 18, 8:17 PM',
    source: 'Synced',
  },
];

const STATUS_CONFIG: Record<TransactionStatus, { label: string; bg: string; color: string }> = {
  saved:         { label: 'Saved',         bg: '#ECFDF5', color: '#047857' },
  needs_receipt: { label: 'Needs receipt', bg: '#FFFBEB', color: '#B45309' },
  draft:         { label: 'Draft',         bg: OmniColors.cloud, color: '#52525B' },
};

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all',      label: 'All' },
  { key: 'income',   label: 'Income' },
  { key: 'expenses', label: 'Expenses' },
];

// ── Sub-components ──────────────────────────────────────────────────

function BalanceCard() {
  return (
    <LinearGradient
      colors={OmniGradient}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={styles.balanceCard}
    >
      <Text style={styles.balanceLabel}>Current balance</Text>
      <Text style={styles.balanceAmount}>$12,480.90</Text>
      <Text style={styles.balanceDelta}>+4.2% vs last month</Text>
    </LinearGradient>
  );
}

function SummaryRow() {
  return (
    <View style={styles.summaryRow}>
      <View style={styles.summaryItem}>
        <Text style={styles.summaryLabel}>Total expenses</Text>
        <Text style={styles.summaryAmount}>$1,744.30</Text>
        <Text style={styles.summaryPeriod}>This month</Text>
      </View>
      <View style={styles.summaryItem}>
        <Text style={styles.summaryLabel}>Total income</Text>
        <Text style={styles.summaryAmount}>$4,920.00</Text>
        <Text style={styles.summaryPeriod}>This month</Text>
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

function StatusBadge({ status }: { status: TransactionStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.statusBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

function TransactionCard({ item }: { item: Transaction }) {
  return (
    <View style={styles.txCard}>
      {/* Top row */}
      <View style={styles.txTop}>
        <View style={styles.txLeft}>
          <Text style={styles.txTitle}>{item.title}</Text>
          <View style={styles.tagRow}>
            {item.tags.map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={styles.txRight}>
          <Text style={styles.txAmount}>{item.amount}</Text>
          <StatusBadge status={item.status} />
        </View>
      </View>
      {/* Footer */}
      <View style={styles.txFooter}>
        <View style={styles.txDateRow}>
          <MaterialIcons name="date-range" size={12} color="#71717A" />
          <Text style={styles.txFooterText}>{item.date}</Text>
        </View>
        <Text style={styles.txSource}>{item.source}</Text>
      </View>
    </View>
  );
}

// ── Screen ──────────────────────────────────────────────────────────

export default function TransactionsScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [search, setSearch] = useState('');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={TRANSACTIONS}
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
              <BalanceCard />
              <SummaryRow />
            </View>

            {/* Tabs + Search */}
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
});
