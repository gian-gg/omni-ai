import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useRef, useState, useEffect } from 'react';
import { OmniGradient } from '@/constants/theme';
import {
  listConversations,
  listConversationMessages,
  createConversation,
  appendMessage,
  deleteConversation,
  createTransaction,
  createTodo,
  createNote,
  ConversationItem,
  MessageItem,
} from '@/api/client';
import { useFocusEffect } from 'expo-router';
import { MarkdownText } from '@/components/markdown-text';
import { OmniActionSheet } from '@/components/ui/OmniActionSheet';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
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
  Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSpeechRecognitionEvent, ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

type Message =
  | { id: string; type: 'divider'; label: string }
  | { id: string; type: 'omni'; text: string; time: string }
  | { id: string; type: 'user'; text: string; time: string }
  | {
      id: string;
      type: 'omni-structured';
      summary: string;
      rawIntent: 'finance' | 'todo' | 'note';
      rawData: any;
      completeResponse?: string | null;
      cancelledResponse?: string | null;
      isConfirmed?: boolean;
      isCancelled?: boolean;
      isEditing?: boolean;
      time: string;
    };

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

function getRecordsFromStructured(intent: 'finance' | 'todo' | 'note', data: any): StructuredRecord[] {
  if (!data) return [];
  switch (intent) {
    case 'finance':
      return [
        {
          id: 'finance-1',
          label: 'Transaction',
          title: `${data.type === 'expense' ? '-' : '+'}$${Number(data.amount || 0).toFixed(2)} ${data.description || ''}`,
          subtitle: `Category: ${data.category || 'None'}`,
        },
      ];
    case 'todo':
      return [
        {
          id: 'todo-1',
          label: 'Todo',
          title: data.title || 'Untitled task',
          subtitle: `${data.description ? 'Desc: ' + data.description : ''}${data.due_date ? ' | Due: ' + data.due_date : ''}`,
        },
      ];
    case 'note':
      return [
        {
          id: 'note-1',
          label: 'Note',
          title: data.title || 'Untitled note',
          subtitle: `${data.content || ''}${data.tags && data.tags.length > 0 ? ' | Tags: ' + data.tags.join(', ') : ''}`,
        },
      ];
    default:
      return [];
  }
}

function mapMessageItemToMessage(m: MessageItem, isHistory: boolean = false): Message {
  const time = new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (m.role === 'user') {
    return { id: m.id, type: 'user', text: m.content, time };
  } else {
    if (m.details?.data && m.details?.intent && m.details.intent !== 'chat') {
      return {
        id: m.id,
        type: 'omni-structured',
        summary: m.content,
        rawIntent: m.details.intent,
        rawData: m.details.data,
        completeResponse: m.details.complete_response,
        cancelledResponse: m.details.cancelled_response,
        isConfirmed: isHistory, 
        isCancelled: false,
        isEditing: false,
        time,
      };
    } else {
      return { id: m.id, type: 'omni', text: m.content, time };
    }
  }
}

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
  messageId,
  summary,
  rawIntent,
  rawData,
  completeResponse,
  cancelledResponse,
  isConfirmed,
  isCancelled,
  isEditing,
  time,
  onConfirm,
  onCancel,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
}: {
  messageId: string;
  summary: string;
  rawIntent: 'finance' | 'todo' | 'note';
  rawData: any;
  completeResponse?: string | null;
  cancelledResponse?: string | null;
  isConfirmed?: boolean;
  isCancelled?: boolean;
  isEditing?: boolean;
  time: string;
  onConfirm: (id: string) => void;
  onCancel: (id: string) => void;
  onStartEdit: (id: string) => void;
  onSaveEdit: (id: string, updated: any) => void;
  onCancelEdit: (id: string) => void;
}) {
  const [editFields, setEditFields] = useState(rawData);

  useEffect(() => {
    setEditFields(rawData);
  }, [rawData, isEditing]);

  const handleSave = () => {
    onSaveEdit(messageId, editFields);
  };

  const records = getRecordsFromStructured(rawIntent, rawData);

  const getSubspaceName = () => {
    if (rawIntent === 'finance') return 'Transactions';
    if (rawIntent === 'todo') return 'To Dos';
    if (rawIntent === 'note') return 'Thoughts';
    return 'Spaces';
  };

  return (
    <View style={styles.omniBubble}>
      <Text style={styles.senderLabel}>Omni</Text>

      {isConfirmed ? (
        <View style={{ gap: 4, marginTop: 6 }}>
          <MarkdownText style={styles.omniText}>
            {completeResponse || `Successfully saved ${rawIntent}.`}
          </MarkdownText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <MaterialIcons name="check-circle" size={14} color="#047857" style={{ marginTop: 1 }} />
            <Text style={styles.statusText}>Saved to {getSubspaceName()}</Text>
          </View>
        </View>
      ) : isCancelled ? (
        <View style={{ gap: 4, marginTop: 6 }}>
          <MarkdownText style={styles.omniText}>
            {cancelledResponse || `Cancelled saving ${rawIntent}.`}
          </MarkdownText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <MaterialIcons name="cancel" size={14} color="#71717A" style={{ marginTop: 1 }} />
            <Text style={styles.statusTextCancelled}>Cancelled</Text>
          </View>
        </View>
      ) : isEditing ? (
        <View style={{ gap: 8, marginTop: 8 }}>
          <Text style={{ fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#3F3F46' }}>
            Edit details:
          </Text>

          {rawIntent === 'finance' && (
            <View style={{ gap: 6 }}>
              <Text style={styles.editLabel}>Type</Text>
              <View style={styles.typeToggleRow}>
                <Pressable
                  style={[
                    styles.typeToggleBtn,
                    editFields.type === 'expense' && styles.typeToggleBtnActive,
                  ]}
                  onPress={() => setEditFields({ ...editFields, type: 'expense' })}
                >
                  <Text
                    style={[
                      styles.typeToggleText,
                      editFields.type === 'expense' && styles.typeToggleTextActive,
                    ]}
                  >
                    Expense
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.typeToggleBtn,
                    editFields.type === 'income' && styles.typeToggleBtnActive,
                  ]}
                  onPress={() => setEditFields({ ...editFields, type: 'income' })}
                >
                  <Text
                    style={[
                      styles.typeToggleText,
                      editFields.type === 'income' && styles.typeToggleTextActive,
                    ]}
                  >
                    Income
                  </Text>
                </Pressable>
              </View>

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
                value={editFields.description || ''}
                onChangeText={(val) => setEditFields({ ...editFields, description: val })}
              />

              <Text style={styles.editLabel}>Category</Text>
              <TextInput
                style={styles.editInput}
                value={editFields.category || ''}
                onChangeText={(val) => setEditFields({ ...editFields, category: val })}
              />
            </View>
          )}

          {rawIntent === 'todo' && (
            <View style={{ gap: 6 }}>
              <Text style={styles.editLabel}>Title</Text>
              <TextInput
                style={styles.editInput}
                value={editFields.title || ''}
                onChangeText={(val) => setEditFields({ ...editFields, title: val })}
              />

              <Text style={styles.editLabel}>Description</Text>
              <TextInput
                style={styles.editInput}
                value={editFields.description || ''}
                onChangeText={(val) => setEditFields({ ...editFields, description: val })}
              />

              <Text style={styles.editLabel}>Due Date</Text>
              <TextInput
                style={styles.editInput}
                value={editFields.due_date || ''}
                onChangeText={(val) => setEditFields({ ...editFields, due_date: val })}
              />

              <Text style={styles.editLabel}>Priority</Text>
              <View style={styles.typeToggleRow}>
                {['low', 'medium', 'high'].map((prio) => (
                  <Pressable
                    key={prio}
                    style={[
                      styles.typeToggleBtn,
                      editFields.priority === prio && styles.typeToggleBtnActive,
                    ]}
                    onPress={() => setEditFields({ ...editFields, priority: prio })}
                  >
                    <Text
                      style={[
                        styles.typeToggleText,
                        editFields.priority === prio && styles.typeToggleTextActive,
                        { textTransform: 'capitalize' },
                      ]}
                    >
                      {prio}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {rawIntent === 'note' && (
            <View style={{ gap: 6 }}>
              <Text style={styles.editLabel}>Title</Text>
              <TextInput
                style={styles.editInput}
                value={editFields.title || ''}
                onChangeText={(val) => setEditFields({ ...editFields, title: val })}
              />

              <Text style={styles.editLabel}>Content</Text>
              <TextInput
                style={[styles.editInput, { minHeight: 60 }]}
                multiline
                value={editFields.content || ''}
                onChangeText={(val) => setEditFields({ ...editFields, content: val })}
              />

              <Text style={styles.editLabel}>Tags (comma-separated)</Text>
              <TextInput
                style={styles.editInput}
                value={Array.isArray(editFields.tags) ? editFields.tags.join(', ') : (editFields.tags || '')}
                onChangeText={(val) =>
                  setEditFields({
                    ...editFields,
                    tags: val.split(',').map((t) => t.trim()).filter(Boolean),
                  })
                }
              />
            </View>
          )}

          <View style={[styles.actionRow, { marginTop: 12 }]}>
            <Pressable style={({ pressed }) => [pressed && { opacity: 0.8 }]} onPress={handleSave}>
              <LinearGradient
                colors={OmniGradient}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.confirmBtn}
              >
                <Text style={styles.confirmBtnText}>Save</Text>
              </LinearGradient>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.8 }]}
              onPress={() => onCancelEdit(messageId)}
            >
              <Text style={styles.editBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={{ gap: 6 }}>
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
            <Pressable
              style={({ pressed }) => [pressed && { opacity: 0.8 }]}
              onPress={() => onConfirm(messageId)}
            >
              <LinearGradient
                colors={OmniGradient}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.confirmBtn}
              >
                <Text style={styles.confirmBtnText}>Confirm</Text>
              </LinearGradient>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.8 }]}
              onPress={() => onStartEdit(messageId)}
            >
              <Text style={styles.editBtnText}>Edit</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.8 }]}
              onPress={() => onCancel(messageId)}
            >
              <Text style={styles.editBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}

      <Text style={styles.timeText}>{time}</Text>
    </View>
  );
}

function renderMessage(
  item: Message,
  onConfirm: (id: string) => void,
  onCancel: (id: string) => void,
  onStartEdit: (id: string) => void,
  onSaveEdit: (id: string, updated: any) => void,
  onCancelEdit: (id: string) => void,
) {
  switch (item.type) {
    case 'divider':
      return <DateDivider label={item.label} />;
    case 'omni':
      return <OmniMessage text={item.text} time={item.time} />;
    case 'user':
      return <UserMessage text={item.text} time={item.time} />;
    case 'omni-structured':
      return (
        <OmniStructuredMessage
          messageId={item.id}
          summary={item.summary}
          rawIntent={item.rawIntent}
          rawData={item.rawData}
          completeResponse={item.completeResponse}
          cancelledResponse={item.cancelledResponse}
          isConfirmed={item.isConfirmed}
          isCancelled={item.isCancelled}
          isEditing={item.isEditing}
          time={item.time}
          onConfirm={onConfirm}
          onCancel={onCancel}
          onStartEdit={onStartEdit}
          onSaveEdit={onSaveEdit}
          onCancelEdit={onCancelEdit}
        />
      );
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
  onSelect,
  onOptions,
  historyItems,
}: {
  translateX: Animated.Value;
  overlayOpacity: Animated.Value;
  onClose: () => void;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onOptions: (id: string) => void;
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
              onPress={() => onSelect(item.id)}
              style={[styles.historyItem, item.active && styles.historyItemActive]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.historyItemTitle}>{item.title}</Text>
                  {item.preview ? <Text style={styles.historyItemPreview} numberOfLines={2}>{item.preview}</Text> : null}
                  <Text style={styles.historyItemDate}>{item.date}</Text>
                </View>
                <Pressable
                  style={{ padding: 4, marginRight: -4, marginTop: -4 }}
                  onPress={(e) => {
                    e.stopPropagation();
                    onOptions(item.id);
                  }}>
                  <MaterialIcons name="more-horiz" size={18} color="#A1A1AA" />
                </Pressable>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </Animated.View>
    </>
  );
}

export default function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);

  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);

  const handleOpenOptions = (id: string) => {
    setSelectedHistoryId(id);
    setActionSheetVisible(true);
  };

  // Fetch conversations history
  useFocusEffect(
    useCallback(() => {
      async function fetchHistory() {
        try {
          const res = await listConversations(50, 0);
          const formatted: HistoryItem[] = res.items.map(conv => ({
            id: conv.id,
            title: conv.title,
            preview: '', 
            date: new Date(conv.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            active: conv.id === currentConversationId,
          }));
          setHistoryItems(formatted);
        } catch (err) {
          console.error("Failed to load history", err);
        }
      }
      fetchHistory();
    }, [currentConversationId])
  );

  // Load a specific conversation
  const loadConversation = async (id: string) => {
    closeDrawer();
    setCurrentConversationId(id);
    try {
      const res = await listConversationMessages(id);
      const formattedMessages = res.items.map(m => mapMessageItemToMessage(m, true));
      setMessages(formattedMessages);
    } catch (err) {
      console.error("Failed to load conversation messages", err);
      setMessages([]);
    }
  };

  // Start a new chat
  const handleNewChat = () => {
    closeDrawer();
    setCurrentConversationId(null);
    setMessages([]);
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await deleteConversation(id);
      setHistoryItems((prev) => prev.filter((item) => item.id !== id));
      if (currentConversationId === id) {
        handleNewChat();
      }
    } catch (err) {
      alert("Failed to delete conversation.");
    }
  };
  
  // Speech-to-Text State
  const [recognizing, setRecognizing] = useState(false);

  useSpeechRecognitionEvent('start', () => setRecognizing(true));
  useSpeechRecognitionEvent('end', () => setRecognizing(false));
  useSpeechRecognitionEvent('error', (event) => {
    console.log('Speech error:', event.error, event.message);
    setRecognizing(false);
  });
  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript;
    if (transcript) {
      setInputText(transcript);
    }
  });

  const toggleRecording = async () => {
    if (recognizing) {
      ExpoSpeechRecognitionModule.stop();
    } else {
      const hasPermission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!hasPermission.granted) {
        alert('Microphone permission is required for dictation.');
        return;
      }
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
      });
    }
  };

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

  const onConfirmStructured = useCallback(async (id: string) => {
    let rawIntent: 'finance' | 'todo' | 'note' | null = null;
    let rawData: any = null;

    setMessages((prev) => {
      const msg = prev.find((m) => m.id === id);
      if (msg && msg.type === 'omni-structured') {
        rawIntent = msg.rawIntent;
        rawData = msg.rawData;
      }
      return prev;
    });

    if (!rawIntent || !rawData) return;

    try {
      if (rawIntent === 'finance') {
        await createTransaction(rawData);
      } else if (rawIntent === 'todo') {
        await createTodo(rawData);
      } else if (rawIntent === 'note') {
        await createNote(rawData);
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? { ...m, isConfirmed: true, isEditing: false, isCancelled: false }
            : m,
        ),
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save data to Spaces.');
    }
  }, []);

  const onCancelStructured = useCallback((id: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id
          ? { ...m, isCancelled: true, isEditing: false, isConfirmed: false }
          : m,
      ),
    );
  }, []);

  const onStartEditStructured = useCallback((id: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, isEditing: true } : m)),
    );
  }, []);

  const onSaveEditStructured = useCallback((id: string, updatedData: any) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id
          ? { ...m, rawData: updatedData, isEditing: false }
          : m,
      ),
    );
  }, []);

  const onCancelEditStructured = useCallback((id: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, isEditing: false } : m)),
    );
  }, []);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isSending) return;

    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const userMsgId = `user-${Date.now()}`;

    const userMsg: Message = { id: userMsgId, type: 'user', text, time };
    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsSending(true);

    try {
      let assistantMsgItem: MessageItem;
      
      if (currentConversationId) {
        assistantMsgItem = await appendMessage(currentConversationId, text);
      } else {
        const res = await createConversation(text);
        setCurrentConversationId(res.conversation.id);
        assistantMsgItem = res.message;
      }
      
      const omniMsg = mapMessageItemToMessage(assistantMsgItem, false);
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
  }, [inputText, isSending, currentConversationId]);

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const insets = useSafeAreaInsets();
  
  const tabBarHeight = useBottomTabBarHeight();
  
  const androidBottomPadding = Platform.OS === 'android' && keyboardHeight > 0 
    ? Math.max(0, keyboardHeight - tabBarHeight + insets.bottom) 
    : 0;

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return (
    <SafeAreaView style={[styles.safe, { paddingBottom: androidBottomPadding }]} edges={['top']}>
      {/* Panel button */}
      <View style={styles.header}>
        <Pressable style={styles.panelBtn} onPress={openDrawer}>
          <MaterialIcons name="menu" size={22} color="#3F3F46" />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={Platform.OS === 'ios'}
      >

        {/* Message list */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) =>
            renderMessage(
              item,
              onConfirmStructured,
              onCancelStructured,
              onStartEditStructured,
              onSaveEditStructured,
              onCancelEditStructured,
            )
          }
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
            <Pressable 
              style={[styles.plusBtn, recognizing && { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5', borderWidth: 1 }]}
              onPress={toggleRecording}
            >
              <MaterialIcons name={recognizing ? "stop" : "mic"} size={22} color={recognizing ? "#EF4444" : "#3F3F46"} />
            </Pressable>
            <TextInput
              style={styles.textInput}
              placeholder={recognizing ? "Listening..." : "Describe what happened in natural language..."}
              placeholderTextColor={recognizing ? "#EF4444" : "#A1A1AA"}
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
            onNewChat={handleNewChat}
            onSelect={loadConversation}
            onOptions={handleOpenOptions}
            historyItems={historyItems}
          />
        )}

        <OmniActionSheet
          visible={actionSheetVisible}
          title="Conversation Options"
          options={[
            { 
              label: 'Delete', 
              destructive: true, 
              onPress: () => {
                if (selectedHistoryId) handleDeleteConversation(selectedHistoryId);
              } 
            }
          ]}
          onClose={() => setActionSheetVisible(false)}
        />
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

  // Edit forms
  editLabel: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
    color: '#71717A',
    marginTop: 8,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  editInput: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#FAFAFA',
    color: '#18181B',
  },
  editRow: {
    flexDirection: 'row',
    gap: 8,
  },
  editCol: {
    flex: 1,
  },
  typeToggleRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#E4E4E7',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 4,
  },
  typeToggleBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    backgroundColor: '#FAFAFA',
  },
  typeToggleBtnActive: {
    backgroundColor: '#18181B',
  },
  typeToggleText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
    color: '#71717A',
  },
  typeToggleTextActive: {
    color: '#fff',
  },
  statusText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: '#047857',
  },
  statusTextCancelled: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: '#71717A',
  },
});
