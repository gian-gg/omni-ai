import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useRef, useState } from 'react';
import { OmniGradient } from '@/constants/theme';
import { sendMessage } from '@/api/client';
import { MarkdownText } from '@/components/markdown-text';
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Message =
  | { id: string; type: 'divider'; label: string }
  | { id: string; type: 'omni'; text: string; time: string }
  | { id: string; type: 'user'; text: string; time: string }
  | { id: string; type: 'omni-structured'; summary: string; records: StructuredRecord[]; time: string };

type HistoryItem = {
  id: string;
  title: string;
  preview: string;
  date: string;
  active: boolean;
};

type StructuredRecord = {
  id: string;
  label: string;   // e.g. 'Transaction', 'Reminder', 'Task'
  title: string;   // primary descriptor
  subtitle: string; // secondary detail line
};

function HeroCard() {
  return (
    <LinearGradient
      colors={OmniGradient}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={styles.heroCard}
    >
      <Text style={styles.heroLabel}>Natural Language First</Text>
      <Text style={styles.heroTitle}>Tell Omni what you need in plain English</Text>
      <Text style={styles.heroBody}>
        I will parse intent, ask for missing details, and stage structured output for confirmation.
      </Text>
    </LinearGradient>
  );
}

function DateDivider({ label }: { label: string }) {
  return (
    <View style={styles.dividerRow}>
      <Text style={styles.dividerText}>{label}</Text>
    </View>
  );
}

function OmniMessage({ text, time }: { text: string; time: string }) {
  return (
    <View style={styles.omniBubble}>
      <Text style={styles.senderLabel}>Omni</Text>
      <MarkdownText style={styles.omniText}>{text}</MarkdownText>
      <Text style={styles.timeText}>{time}</Text>
    </View>
  );
}

function UserMessage({ text, time }: { text: string; time: string }) {
  return (
    <LinearGradient
      colors={OmniGradient}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={styles.userBubble}
    >
      <Text style={styles.userSenderLabel}>You</Text>
      <Text style={styles.userText}>{text}</Text>
      <Text style={styles.userTimeText}>{time}</Text>
    </LinearGradient>
  );
}

function OmniStructuredMessage({
  summary,
  records,
  time,
}: {
  summary: string;
  records: StructuredRecord[];
  time: string;
}) {
  return (
    <View style={styles.omniBubble}>
      <Text style={styles.senderLabel}>Omni</Text>
      <MarkdownText style={styles.omniText}>{summary}</MarkdownText>
      {records.length > 0 && (
        <View style={styles.structuredCards}>
          {records.map((record) => (
            <View key={record.id} style={styles.miniCard}>
              <Text style={styles.miniCardLabel}>{record.label}</Text>
              <Text style={styles.miniCardTitle}>{record.title}</Text>
              <Text style={styles.miniCardSub}>{record.subtitle}</Text>
            </View>
          ))}
        </View>
      )}
      <View style={styles.actionRow}>
        <Pressable style={({ pressed }) => [pressed && { opacity: 0.8 }]}>
          <LinearGradient
            colors={OmniGradient}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.confirmBtn}
          >
            <Text style={styles.confirmBtnText}>Confirm</Text>
          </LinearGradient>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.8 }]}>
          <Text style={styles.editBtnText}>Edit</Text>
        </Pressable>
      </View>
      <Text style={styles.timeText}>{time}</Text>
    </View>
  );
}

function renderMessage({ item }: { item: Message }) {
  switch (item.type) {
    case 'divider':
      return <DateDivider label={item.label} />;
    case 'omni':
      return <OmniMessage text={item.text} time={item.time} />;
    case 'user':
      return <UserMessage text={item.text} time={item.time} />;
    case 'omni-structured':
      return <OmniStructuredMessage summary={item.summary} records={item.records} time={item.time} />;
    default:
      return null;
  }
}

const DRAWER_WIDTH = 300;

function HistoryDrawer({
  translateX,
  overlayOpacity,
  onClose,
  onNewChat,
  historyItems,
}: {
  translateX: Animated.Value;
  overlayOpacity: Animated.Value;
  onClose: () => void;
  onNewChat: () => void;
  historyItems: HistoryItem[];
}) {
  return (
    <>
      <Animated.View style={[styles.drawerOverlay, { opacity: overlayOpacity }]}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>
      </Animated.View>

      <Animated.View style={[styles.drawer, { transform: [{ translateX }] }]}>
        {/* Header */}
        <View style={styles.drawerHeader}>
          <Text style={styles.drawerTitle}>Chats</Text>
          <Pressable style={styles.drawerCloseBtn} onPress={onClose}>
            <MaterialIcons name="close" size={18} color="#52525B" />
          </Pressable>
        </View>

        {/* New chat */}
        <View style={styles.drawerNewChatRow}>
          <Pressable style={styles.newChatBtn} onPress={onNewChat}>
            <MaterialIcons name="edit" size={16} color="#3F3F46" />
            <Text style={styles.newChatText}>New chat</Text>
          </Pressable>
        </View>

        {/* History list */}
        <ScrollView contentContainerStyle={styles.drawerList} showsVerticalScrollIndicator={false}>
          {historyItems.map((item: HistoryItem) => (
            <Pressable
              key={item.id}
              style={[styles.historyItem, item.active && styles.historyItemActive]}>
              <Text style={styles.historyItemTitle}>{item.title}</Text>
              <Text style={styles.historyItemPreview} numberOfLines={2}>{item.preview}</Text>
              <Text style={styles.historyItemDate}>{item.date}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </Animated.View>
    </>
  );
}

export default function ChatScreen() {
  // ── Sample data — uncomment to preview UI, comment out when wiring backend ──
  const [messages, setMessages] = useState<Message[]>(/* [
    { id: 'divider-today', type: 'divider', label: 'Today' },
    {
      id: 'omni-1',
      type: 'omni',
      text: 'What would you like to capture? You can describe a transaction, task, note, or reminder naturally.',
      time: '9:41 AM',
    },
    {
      id: 'user-1',
      type: 'user',
      text: 'Paid $42.50 for lunch with Priya at Alta, tag it client meeting, and remind me to submit reimbursement tomorrow morning.',
      time: '9:42 AM',
    },
    {
      id: 'omni-2',
      type: 'omni-structured',
      summary: 'Captured. I extracted one transaction and one reminder. Review before saving:',
      records: [
        { id: 'r1', label: 'Transaction', title: '$42.50 lunch with Priya at Alta', subtitle: 'Category: Client meeting' },
        { id: 'r2', label: 'Reminder', title: 'Submit reimbursement', subtitle: 'Scheduled: Tomorrow, 9:00 AM' },
      ],
      time: '9:42 AM',
    },
  ] */ []);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>(/* [
    { id: '1', title: 'Q1 tax prep checklist', preview: 'Summarized expenses and pending receipts from January to March.', date: 'Mar 4', active: true },
    { id: '2', title: 'Client dinner reimbursement', preview: 'Captured expense details and drafted a reimbursement reminder.', date: 'Mar 2', active: false },
    { id: '3', title: 'Weekly planning reset', preview: 'Converted rough notes into tasks and morning reminders.', date: 'Feb 28', active: false },
    { id: '4', title: 'Apartment budget split', preview: 'Tracked shared costs and generated next rent reminder.', date: 'Feb 24', active: false },
  ] */ []);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const flatListRef = useRef<FlatList<Message>>(null);
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  const openDrawer = () => {
    setDrawerOpen(true);
    Animated.parallel([
      Animated.timing(translateX, { toValue: 0, duration: 240, useNativeDriver: true }),
      Animated.timing(overlayOpacity, { toValue: 1, duration: 240, useNativeDriver: true }),
    ]).start();
  };

  const closeDrawer = () => {
    Animated.parallel([
      Animated.timing(translateX, { toValue: -DRAWER_WIDTH, duration: 200, useNativeDriver: true }),
      Animated.timing(overlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setDrawerOpen(false));
  };

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isSending) return;

    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const userMsgId = `user-${Date.now()}`;

    // Append user message
    const userMsg: Message = { id: userMsgId, type: 'user', text, time };
    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsSending(true);

    try {
      const { response } = await sendMessage(text);
      const omniMsg: Message = {
        id: `omni-${Date.now()}`,
        type: 'omni',
        text: response,
        time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, omniMsg]);
    } catch (err) {
      const errMsg: Message = {
        id: `err-${Date.now()}`,
        type: 'omni',
        text: `Something went wrong — ${err instanceof Error ? err.message : 'unknown error'}`,
        time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsSending(false);
    }
  }, [inputText, isSending]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Panel button */}
      <View style={styles.header}>
        <Pressable style={styles.panelBtn} onPress={openDrawer}>
          <MaterialIcons name="menu" size={22} color="#3F3F46" />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        keyboardVerticalOffset={0}>
        {/* Message list */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          ListHeaderComponent={<HeroCard />}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
        />

        {/* Input bar */}
        <View style={styles.inputSection}>
          <View style={styles.inputBar}>
            <Pressable style={styles.plusBtn}>
              <MaterialIcons name="add" size={22} color="#3F3F46" />
            </Pressable>
            <TextInput
              style={styles.textInput}
              placeholder="Describe what happened in natural language..."
              placeholderTextColor="#A1A1AA"
              value={inputText}
              onChangeText={setInputText}
              multiline
            />
            <Pressable
              style={({ pressed }) => [pressed && { opacity: 0.8 }]}
              onPress={handleSend}
              disabled={isSending}
            >
              <LinearGradient
                colors={OmniGradient}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={[styles.sendBtn, isSending && { opacity: 0.5 }]}
              >
                <MaterialIcons name={isSending ? 'hourglass-empty' : 'send'} size={18} color="#fff" />
              </LinearGradient>
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}>
            {['Add receipt photo', 'Log quick note', 'Create reminder'].map((chip) => (
              <Pressable key={chip} style={styles.chip}>
                <Text style={styles.chipText}>{chip}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      {/* History drawer (rendered last so it sits on top) */}
      {drawerOpen && (
        <HistoryDrawer
          translateX={translateX}
          overlayOpacity={overlayOpacity}
          onClose={closeDrawer}
          onNewChat={() => {
            setMessages([]);
            closeDrawer();
          }}
          historyItems={historyItems}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FAFAFA' },
  flex: { flex: 1 },

  // Header
  header: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  panelBtn: {
    width: 44,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Message list
  messageList: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 12,
  },

  // Hero card
  heroCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 4,
  },
  heroLabel: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#A1A1AA',
  },
  heroTitle: {
    fontFamily: 'Syne_600SemiBold',
    fontSize: 20,
    color: '#fff',
    marginTop: 4,
    lineHeight: 26,
  },
  heroBody: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    color: '#A1A1AA',
    marginTop: 8,
    lineHeight: 18,
  },

  // Divider
  dividerRow: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  dividerText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#71717A',
  },

  // Omni bubble
  omniBubble: {
    width: '85%',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E4E4E7',
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    padding: 14,
  },
  senderLabel: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#71717A',
  },
  omniText: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    color: '#3F3F46',
    marginTop: 6,
    lineHeight: 20,
  },
  timeText: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    color: '#A1A1AA',
    marginTop: 6,
  },

  // User bubble
  userBubble: {
    width: '85%',
    alignSelf: 'flex-end',
    borderRadius: 16,
    borderBottomRightRadius: 4,
    padding: 14,
  },
  userSenderLabel: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#A1A1AA',
  },
  userText: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    color: '#fff',
    marginTop: 6,
    lineHeight: 20,
  },
  userTimeText: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    color: '#A1A1AA',
    marginTop: 6,
  },

  // Structured message
  structuredCards: {
    marginTop: 10,
    gap: 8,
  },
  miniCard: {
    backgroundColor: '#F4F4F5',
    borderRadius: 10,
    padding: 10,
  },
  miniCardLabel: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#71717A',
  },
  miniCardTitle: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: '#18181B',
    marginTop: 4,
  },
  miniCardSub: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    color: '#52525B',
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  confirmBtn: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 40,
    justifyContent: 'center',
  },
  confirmBtnText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: '#fff',
  },
  editBtn: {
    borderWidth: 1,
    borderColor: '#E4E4E7',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 40,
    justifyContent: 'center',
  },
  editBtnText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: '#3F3F46',
  },

  // Input bar
  inputSection: {
    borderTopWidth: 1,
    borderTopColor: '#E4E4E7',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 8,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F4F4F5',
    borderWidth: 1,
    borderColor: '#E4E4E7',
    borderRadius: 16,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  plusBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textInput: {
    flex: 1,
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    color: '#18181B',
    maxHeight: 100,
    paddingVertical: 4,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipsRow: {
    gap: 8,
    paddingBottom: 2,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#E4E4E7',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 40,
    justifyContent: 'center',
  },
  chipText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
    color: '#3F3F46',
  },

  // Drawer
  drawerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex: 40,
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: DRAWER_WIDTH,
    backgroundColor: '#fff',
    borderRightWidth: 1,
    borderRightColor: '#E4E4E7',
    zIndex: 50,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#E4E4E7',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  drawerTitle: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#71717A',
  },
  drawerCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerNewChatRow: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 4,
  },
  newChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    backgroundColor: '#F4F4F5',
    borderRadius: 12,
  },
  newChatText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: '#3F3F46',
  },
  drawerList: {
    paddingHorizontal: 12,
    paddingTop: 12,
    gap: 8,
  },
  historyItem: {
    borderWidth: 1,
    borderColor: '#E4E4E7',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
  },
  historyItemActive: {
    backgroundColor: '#F4F4F5',
  },
  historyItemTitle: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: '#18181B',
  },
  historyItemPreview: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    color: '#71717A',
    marginTop: 4,
    lineHeight: 16,
  },
  historyItemDate: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    color: '#A1A1AA',
    marginTop: 6,
  },
});
