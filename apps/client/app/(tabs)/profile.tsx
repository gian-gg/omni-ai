import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, StyleSheet, Text, View, Pressable, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { jwtDecode } from 'jwt-decode';

import { OmniColors, OmniFonts, OmniGradient } from '@/constants/theme';
import { getMe, updateProfile } from '@/api/client';
import { OmniActionSheet } from '@/components/ui/OmniActionSheet';

// ── Types ───────────────────────────────────────────────────────────

type ProfileStats = {
  captured: number;
  activeSpaces: number;
  streakDays: number;
};

type UserProfile = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  plan: string;
  memberSinceYear: number;
  stats: ProfileStats;
};

type SettingValue = {
  label: string;
  value: string;
  isToggle?: boolean;
};

type UserSettings = {
  account: {
    defaultInputMode: SettingValue;
    timezone: SettingValue;
    language: SettingValue;
  };
  notifications: {
    draftReminders: SettingValue;
    dailySummary: SettingValue;
    productUpdates: SettingValue;
  };
};

// ── Static data (swap with API later) ───────────────────────────────

const PROFILE_DATA: UserProfile = {
  id: 'usr_123',
  name: '',
  email: '',
  avatarUrl: null, // Unset profile photo
  plan: 'Pro workspace',
  memberSinceYear: new Date().getFullYear(),
  stats: {
    captured: 0,
    activeSpaces: 0,
    streakDays: 0,
  },
};

// ── Sub-components ──────────────────────────────────────────────────

function ProfileCard({ profile }: { profile: UserProfile }) {
  return (
    <LinearGradient
      colors={OmniGradient}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={styles.profileCard}
    >
      <View style={styles.profileHeader}>
        {profile.avatarUrl ? (
          <Image
            source={{ uri: profile.avatarUrl }}
            style={styles.avatar}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <MaterialIcons name="person" size={32} color="#A1A1AA" />
          </View>
        )}
        <View style={styles.profileInfo}>
          <View style={styles.profileInfoTop}>
            <View style={styles.profileTextContainer}>
              <Text style={styles.profileName} numberOfLines={1}>{profile.name}</Text>
              <Text style={styles.profileEmail} numberOfLines={1}>{profile.email}</Text>
            </View>
          </View>
          <View style={styles.badgesRow}>

            <View style={styles.profileBadge}>
              <Text style={styles.profileBadgeTextRegular}>Member since {profile.memberSinceYear}</Text>
            </View>
          </View>
        </View>
      </View>


    </LinearGradient>
  );
}

function SettingsItem({ label, value, isToggle }: { label: string, value?: string, isToggle?: boolean }) {
  return (
    <Pressable style={({ pressed }) => [styles.settingsItem, pressed && styles.settingsItemPressed]}>
      <Text style={styles.settingsItemLabel}>{label}</Text>
      {value && (
        <Text style={[styles.settingsItemValue, isToggle && styles.settingsItemToggleValue]}>
          {value}
        </Text>
      )}
    </Pressable>
  );
}

function ActionItem({ label, icon, destructive, onPress }: { label: string, icon: keyof typeof MaterialIcons.glyphMap, destructive?: boolean, onPress?: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.settingsItem, destructive && styles.actionItemDestructive, pressed && styles.settingsItemPressed]} onPress={onPress}>
      <Text style={[styles.actionItemLabel, destructive && styles.actionItemLabelDestructive]}>{label}</Text>
      <MaterialIcons name={icon} size={16} color={destructive ? '#EF4444' : '#71717A'} />
    </Pressable>
  );
}

// ── Screen ──────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const [profile, setProfile] = useState<UserProfile>(PROFILE_DATA);
  const [displayName, setDisplayName] = useState<string>('');
  const [currency, setCurrency] = useState<string>('USD');
  const [currencySheetVisible, setCurrencySheetVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();

  useEffect(() => {
    async function loadProfile() {
      try {
        const token = await SecureStore.getItemAsync('access_token');
        if (token) {
          const decoded = jwtDecode<any>(token);
          setProfile((prev) => ({
            ...prev,
            id: decoded.sub || prev.id,
            name: decoded.user_metadata?.full_name || decoded.user_metadata?.name || prev.name,
            email: decoded.email || decoded.user_metadata?.email || prev.email,
            avatarUrl: decoded.user_metadata?.avatar_url || decoded.user_metadata?.picture || prev.avatarUrl,
          }));
        }

        const me = await getMe();
        if (me.user.display_name) {
          setDisplayName(me.user.display_name);
        } else if (token) {
          const decoded = jwtDecode<any>(token);
          setDisplayName(decoded.user_metadata?.full_name || decoded.user_metadata?.name || '');
        }
        if (me.user.currency) {
          setCurrency(me.user.currency);
        }
        if (me.user.created_at) {
          setProfile(prev => ({ ...prev, memberSinceYear: new Date(me.user.created_at).getFullYear() }));
        }
      } catch (e) {
        console.error('Failed to load profile', e);
      }
    }
    loadProfile();
  }, []);

  const handleSignOut = async () => {
    await SecureStore.deleteItemAsync('access_token');
    await SecureStore.deleteItemAsync('refresh_token');
    router.replace('/welcome');
  };

  const handleUpdate = async (updates: { display_name?: string; currency?: string }) => {
    setIsSaving(true);
    try {
      await updateProfile(updates);
      if (updates.display_name !== undefined) setDisplayName(updates.display_name);
      if (updates.currency !== undefined) setCurrency(updates.currency);
    } catch (err) {
      console.error('Failed to update profile', err);
    } finally {
      setIsSaving(false);
    }
  };

  const effectiveName = displayName || profile.name;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ProfileCard profile={{ ...profile, name: effectiveName }} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <View style={styles.settingsGroup}>
            <View style={styles.inputItem}>
              <Text style={styles.inputItemLabel}>Display Name</Text>
              <TextInput
                style={styles.inputItemField}
                value={displayName}
                onChangeText={setDisplayName}
                onBlur={() => handleUpdate({ display_name: displayName })}
                placeholder="Enter display name"
                placeholderTextColor="#A1A1AA"
              />
            </View>
            <Pressable style={styles.settingsItem} onPress={() => setCurrencySheetVisible(true)}>
              <Text style={styles.settingsItemLabel}>Currency</Text>
              <Text style={styles.settingsItemValue}>{currency}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.settingsGroup}>
            <ActionItem label="Sign out" icon="logout" destructive onPress={handleSignOut} />
          </View>
        </View>
      </ScrollView>

      <OmniActionSheet
        visible={currencySheetVisible}
        title="Select Currency"
        options={[
          { label: 'USD ($)', onPress: () => handleUpdate({ currency: 'USD' }) },
          { label: 'EUR (€)', onPress: () => handleUpdate({ currency: 'EUR' }) },
          { label: 'GBP (£)', onPress: () => handleUpdate({ currency: 'GBP' }) },
          { label: 'PHP (₱)', onPress: () => handleUpdate({ currency: 'PHP' }) },
          { label: 'JPY (¥)', onPress: () => handleUpdate({ currency: 'JPY' }) },
        ]}
        onClose={() => setCurrencySheetVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: OmniColors.paper },
  scroll: { padding: 20, gap: 24, paddingBottom: 32 },

  // Profile Card
  profileCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#27272a',
    padding: 20,
    justifyContent: 'center',
    gap: 12,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  avatarPlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: {
    flex: 1,
    minWidth: 0,
  },
  profileInfoTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  profileTextContainer: {
    flex: 1,
    minWidth: 0,
  },
  profileName: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 15,
    color: '#fff',
  },
  profileEmail: {
    fontFamily: OmniFonts.body,
    fontSize: 12,
    color: '#D4D4D8',
  },
  settingsBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 8,
  },
  profileBadge: {
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  profileBadgeText: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 10,
    color: '#F4F4F5',
  },
  profileBadgeTextRegular: {
    fontFamily: OmniFonts.body,
    fontSize: 10,
    color: '#E4E4E7',
  },

  // Stats Row
  statsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  statBox: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 6,
  },
  statLabel: {
    fontFamily: OmniFonts.body,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: '#D4D4D8',
  },
  statValue: {
    fontFamily: OmniFonts.data,
    fontSize: 14,
    color: '#fff',
    marginTop: 2,
  },

  // Sections
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontFamily: OmniFonts.heading,
    fontSize: 16,
    color: OmniColors.ink,
  },
  settingsGroup: {
    gap: 0,
  },
  
  // List Items
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: OmniColors.mist,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
  },
  settingsItemPressed: {
    opacity: 0.7,
  },
  settingsItemLabel: {
    fontFamily: OmniFonts.body,
    fontSize: 14,
    color: '#52525B', // zinc-600
  },
  settingsItemValue: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 14,
    color: OmniColors.ink,
  },
  settingsItemToggleValue: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 12,
    color: '#52525B', // zinc-600
    backgroundColor: OmniColors.cloud,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 100,
    overflow: 'hidden',
  },

  // Action Items
  actionItemLabel: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 14,
    color: '#3F3F46', // zinc-700
  },
  actionItemDestructive: {
    borderColor: '#FECACA', // red-200
  },
  actionItemLabelDestructive: {
    color: '#DC2626', // red-600
  },
  
  // Custom Input Item
  inputItem: {
    flexDirection: 'column',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: OmniColors.mist,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
    gap: 8,
  },
  inputItemLabel: {
    fontFamily: OmniFonts.body,
    fontSize: 14,
    color: '#52525B', // zinc-600
  },
  inputItemField: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 15,
    color: OmniColors.ink,
    padding: 0,
  },
});
