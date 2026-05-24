import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View, ScrollView } from 'react-native';
import { OmniColors, OmniFonts } from '@/constants/theme';

export interface ActionOption {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

interface OmniActionSheetProps {
  visible: boolean;
  title: string;
  options: ActionOption[];
  onClose: () => void;
}

export function OmniActionSheet({ visible, title, options, onClose }: OmniActionSheetProps) {
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.container} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.optionsList}>
            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              {options.map((opt, i) => (
                <Pressable
                  key={i}
                  style={[
                    styles.optionBtn,
                    i === options.length - 1 ? styles.optionBtnLast : null,
                  ]}
                  onPress={() => {
                    opt.onPress();
                    onClose();
                  }}
                >
                  <Text style={[
                    styles.optionText,
                    opt.destructive && styles.optionTextDestructive,
                  ]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          <Pressable style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '85%',
    backgroundColor: OmniColors.paper,
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  title: {
    fontFamily: OmniFonts.heading,
    fontSize: 18,
    color: OmniColors.ink,
    marginBottom: 16,
    textAlign: 'center',
  },
  optionsList: {
    backgroundColor: '#F4F4F5',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  optionBtn: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E4E4E7',
    alignItems: 'center',
  },
  optionBtnLast: {
    borderBottomWidth: 0,
  },
  optionText: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 15,
    color: '#18181B',
  },
  optionTextDestructive: {
    color: '#EF4444',
  },
  cancelBtn: {
    paddingVertical: 14,
    backgroundColor: '#F4F4F5',
    borderRadius: 16,
    alignItems: 'center',
  },
  cancelText: {
    fontFamily: OmniFonts.bodySemiBold,
    fontSize: 15,
    color: '#71717A',
  },
});
