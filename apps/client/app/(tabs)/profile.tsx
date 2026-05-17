import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

import { OmniColors, OmniFonts, OmniGradient } from '@/constants/theme';

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
  name: 'Gian Gallardo',
  email: 'gian@omni.app',
  avatarUrl: null, // Unset profile photo
  plan: 'Pro workspace',
  memberSinceYear: 2024,
  stats: {
    captured: 214,
    activeSpaces: 3,
    streakDays: 12,
  },
};

const SETTINGS_DATA: UserSettings = {
  account: {
    defaultInputMode: { label: 'Default input mode', value: 'Voice + text' },
    timezone: { label: 'Timezone', value: 'America/New_York' },
    language: { label: 'Language', value: 'English' },
  },
  notifications: {
    draftReminders: { label: 'Draft reminders', value: 'On', isToggle: true },
    dailySummary: { label: 'Daily summary', value: 'On', isToggle: true },
    productUpdates: { label: 'Product updates', value: 'Off', isToggle: true },
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
            <Pressable style={styles.settingsBtn}>
              <MaterialIcons name="settings" size={16} color="#F4F4F5" />
            </Pressable>
          </View>
          <View style={styles.badgesRow}>
            <View style={styles.profileBadge}>
              <Text style={styles.profileBadgeText}>{profile.plan}</Text>
            </View>
            <View style={styles.profileBadge}>
              <Text style={styles.profileBadgeTextRegular}>Member since {profile.memberSinceYear}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Captured</Text>
          <Text style={styles.statValue}>{profile.stats.captured}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Spaces</Text>
          <Text style={styles.statValue}>{profile.stats.activeSpaces} active</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Streak</Text>
          <Text style={styles.statValue}>{profile.stats.streakDays}d</Text>
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

function ActionItem({ label, icon, destructive }: { label: string, icon: keyof typeof MaterialIcons.glyphMap, destructive?: boolean }) {
  return (
    <Pressable style={({ pressed }) => [styles.settingsItem, destructive && styles.actionItemDestructive, pressed && styles.settingsItemPressed]}>
      <Text style={[styles.actionItemLabel, destructive && styles.actionItemLabelDestructive]}>{label}</Text>
      <MaterialIcons name={icon} size={16} color={destructive ? '#EF4444' : '#71717A'} />
    </Pressable>
  );
}

// ── Screen ──────────────────────────────────────────────────────────

export default function ProfileScreen() {
  // In the future, this state will be populated from an API or global store
  const profile = PROFILE_DATA;
  const settings = SETTINGS_DATA;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ProfileCard profile={profile} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.settingsGroup}>
            <SettingsItem {...settings.account.defaultInputMode} />
            <SettingsItem {...settings.account.timezone} />
            <SettingsItem {...settings.account.language} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <View style={styles.settingsGroup}>
            <SettingsItem {...settings.notifications.draftReminders} />
            <SettingsItem {...settings.notifications.dailySummary} />
            <SettingsItem {...settings.notifications.productUpdates} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data and Security</Text>
          <View style={styles.settingsGroup}>
            <ActionItem label="Export my records" icon="file-download" />
            <ActionItem label="Manage Google sign-in" icon="security" />
            <ActionItem label="Sign out" icon="logout" destructive />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: OmniColors.paper },
  scroll: { padding: 20, gap: 24, paddingBottom: 32 },

  // Profile Card
  profileCard: {
    minHeight: 220,
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
});
