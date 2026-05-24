import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { OmniColors, OmniFonts } from '@/constants/theme';

interface OmniDatePickerProps {
  visible: boolean;
  value: Date;
  onClose: () => void;
  onChange: (date: Date) => void;
}

export function OmniDatePicker({ visible, value, onClose, onChange }: OmniDatePickerProps) {
  const currentSelectedStr = value.toISOString().split('T')[0];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.container} onPress={() => {}}>
          <Calendar
            current={currentSelectedStr}
            onDayPress={(day: any) => {
              // Create a date object in local timezone to prevent offset issues
              // React Native Calendars timestamp is UTC midnight. We can just use the date string:
              const localDate = new Date(day.dateString + 'T12:00:00Z');
              onChange(localDate);
              onClose();
            }}
            markedDates={{
              [currentSelectedStr]: { selected: true, selectedColor: OmniColors.ink },
            }}
            theme={{
              backgroundColor: OmniColors.paper,
              calendarBackground: OmniColors.paper,
              textSectionTitleColor: '#71717A',
              selectedDayBackgroundColor: OmniColors.ink,
              selectedDayTextColor: '#ffffff',
              todayTextColor: OmniColors.ink,
              dayTextColor: '#18181B',
              textDisabledColor: '#D4D4D8',
              dotColor: OmniColors.ink,
              selectedDotColor: '#ffffff',
              arrowColor: OmniColors.ink,
              monthTextColor: OmniColors.ink,
              indicatorColor: OmniColors.ink,
              textDayFontFamily: OmniFonts.body,
              textMonthFontFamily: OmniFonts.heading,
              textDayHeaderFontFamily: OmniFonts.bodySemiBold,
              textDayFontWeight: '400',
              textMonthFontWeight: 'bold',
              textDayHeaderFontWeight: '600',
              textDayFontSize: 14,
              textMonthFontSize: 16,
              textDayHeaderFontSize: 13,
            }}
          />
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
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
});
