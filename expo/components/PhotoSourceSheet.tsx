import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Camera, ImageIcon, X } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { METALLIC_BORDER_COLOR_STRONG, METALLIC_SHADOW_COLOR } from '@/constants/metallic';

interface Props {
  visible: boolean;
  onClose: () => void;
  onPickCamera: () => void;
  onPickGallery: () => void;
  title?: string;
  hideCameraOnWeb?: boolean;
}

const PhotoSourceSheet = React.memo(function PhotoSourceSheet({
  visible,
  onClose,
  onPickCamera,
  onPickGallery,
  title = 'Добавить фото',
  hideCameraOnWeb = true,
}: Props) {
  const showCamera = !(hideCameraOnWeb && Platform.OS === 'web');
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} testID="photo-source-overlay">
        <TouchableOpacity activeOpacity={1} style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
              <X size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {showCamera ? (
            <TouchableOpacity
              style={styles.option}
              onPress={() => { onClose(); setTimeout(onPickCamera, 120); }}
              activeOpacity={0.75}
              testID="photo-source-camera"
            >
              <View style={[styles.iconWrap, { backgroundColor: 'rgba(22,163,74,0.18)' }]}>
                <Camera size={22} color={Colors.primary} />
              </View>
              <View style={styles.optionTextWrap}>
                <Text style={styles.optionTitle}>Камера</Text>
                <Text style={styles.optionSubtitle}>Сделать снимок сейчас</Text>
              </View>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={styles.option}
            onPress={() => { onClose(); setTimeout(onPickGallery, 120); }}
            activeOpacity={0.75}
            testID="photo-source-gallery"
          >
            <View style={[styles.iconWrap, { backgroundColor: 'rgba(56,189,248,0.18)' }]}>
              <ImageIcon size={22} color={Colors.info} />
            </View>
            <View style={styles.optionTextWrap}>
              <Text style={styles.optionTitle}>Галерея</Text>
              <Text style={styles.optionSubtitle}>Выбрать из библиотеки</Text>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
});

export default PhotoSourceSheet;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  sheet: {
    backgroundColor: Colors.card,
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
    ...Platform.select({
      ios: { shadowColor: METALLIC_SHADOW_COLOR, shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.5, shadowRadius: 14 },
      android: { elevation: 12 },
      default: {},
    }),
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
  },
  title: { fontSize: 16, fontWeight: '800' as const, color: Colors.text },
  closeBtn: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.cardSecondary,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    marginHorizontal: 4,
    marginVertical: 4,
  },
  iconWrap: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  optionTextWrap: { flex: 1 },
  optionTitle: { fontSize: 15, fontWeight: '700' as const, color: Colors.text },
  optionSubtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
});
