import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { Plus, Pencil, X, Users, ClipboardList } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { trpc } from '@/lib/trpc';
import ServiceIcon, { SERVICE_ICON_NAMES } from '@/components/ServiceIcon';
import { useMRefreshControl } from '@/components/MRefreshControl';
import MLoader from '@/components/MLoader';

interface AdminServiceCategory {
  id: string;
  slug: string;
  name: string;
  icon: string;
  color: string;
  bgColor: string;
  description: string;
  isActive: boolean;
  sortOrder: number;
  subscribersCount: number;
  requestsCount: number;
}

const COLOR_PRESETS: { color: string; bgColor: string }[] = [
  { color: '#0F766E', bgColor: '#CCFBF1' },
  { color: '#2563EB', bgColor: '#DBEAFE' },
  { color: '#DC2626', bgColor: '#FEE2E2' },
  { color: '#D97706', bgColor: '#FEF3C7' },
  { color: '#7C3AED', bgColor: '#EDE9FE' },
  { color: '#BE123C', bgColor: '#FFE4E6' },
  { color: '#15803D', bgColor: '#DCFCE7' },
  { color: '#0891B2', bgColor: '#CFFAFE' },
  { color: '#92400E', bgColor: '#FDE68A' },
  { color: '#475569', bgColor: '#E2E8F0' },
  { color: '#0369A1', bgColor: '#DBEAFE' },
  { color: '#1F2937', bgColor: '#E5E7EB' },
];

type EditorState = {
  visible: boolean;
  editingId: string | null;
  name: string;
  description: string;
  icon: string;
  colorIndex: number;
};

const emptyEditor: EditorState = {
  visible: false,
  editingId: null,
  name: '',
  description: '',
  icon: SERVICE_ICON_NAMES[0] ?? 'Wrench',
  colorIndex: 0,
};

export default function AdminServicesSection() {
  const utils = trpc.useUtils();
  const listQuery = trpc.admin.listServiceCategories.useQuery(undefined, {
    retry: 1,
    staleTime: 15_000,
  });

  const [editor, setEditor] = useState<EditorState>(emptyEditor);

  const invalidateAll = useCallback(() => {
    void utils.admin.listServiceCategories.invalidate();
    void utils.services.list.invalidate();
  }, [utils]);

  const createMutation = trpc.admin.createServiceCategory.useMutation({
    onSuccess: () => {
      invalidateAll();
      setEditor(emptyEditor);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err) => {
      Alert.alert('Ошибка', err.message || 'Не удалось создать категорию');
    },
  });

  const updateMutation = trpc.admin.updateServiceCategory.useMutation({
    onSuccess: () => {
      invalidateAll();
      setEditor(emptyEditor);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err) => {
      Alert.alert('Ошибка', err.message || 'Не удалось обновить категорию');
    },
  });

  const toggleMutation = trpc.admin.updateServiceCategory.useMutation({
    onSuccess: invalidateAll,
    onError: (err) => {
      invalidateAll();
      Alert.alert('Ошибка', err.message || 'Не удалось изменить статус категории');
    },
  });

  const categories = useMemo(
    () => (listQuery.data ?? []) as AdminServiceCategory[],
    [listQuery.data],
  );

  const { refreshControl } = useMRefreshControl(listQuery.isRefetching, () => listQuery.refetch());

  const openAdd = useCallback(() => {
    setEditor({ ...emptyEditor, visible: true });
    void Haptics.selectionAsync();
  }, []);

  const openEdit = useCallback((cat: AdminServiceCategory) => {
    const presetIndex = COLOR_PRESETS.findIndex(
      (p) => p.color.toLowerCase() === cat.color.toLowerCase(),
    );
    setEditor({
      visible: true,
      editingId: cat.id,
      name: cat.name,
      description: cat.description,
      icon: cat.icon,
      colorIndex: presetIndex >= 0 ? presetIndex : 0,
    });
    void Haptics.selectionAsync();
  }, []);

  const handleToggleActive = useCallback(
    (cat: AdminServiceCategory) => {
      toggleMutation.mutate({ id: cat.id, isActive: !cat.isActive });
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [toggleMutation],
  );

  const handleSave = useCallback(() => {
    const name = editor.name.trim();
    if (name.length < 2) {
      Alert.alert('Ошибка', 'Введите название категории (минимум 2 символа)');
      return;
    }
    const preset = COLOR_PRESETS[editor.colorIndex] ?? COLOR_PRESETS[0];
    if (editor.editingId) {
      updateMutation.mutate({
        id: editor.editingId,
        name,
        description: editor.description.trim(),
        icon: editor.icon,
        color: preset.color,
        bgColor: preset.bgColor,
      });
    } else {
      createMutation.mutate({
        name,
        description: editor.description.trim(),
        icon: editor.icon,
        color: preset.color,
        bgColor: preset.bgColor,
      });
    }
  }, [editor, createMutation, updateMutation]);

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const previewPreset = COLOR_PRESETS[editor.colorIndex] ?? COLOR_PRESETS[0];

  if (listQuery.isLoading) {
    return (
      <View style={styles.loaderWrap}>
        <MLoader />
      </View>
    );
  }

  if (listQuery.error) {
    return (
      <View style={styles.loaderWrap}>
        <Text style={styles.errorText}>{listQuery.error.message}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => listQuery.refetch()}>
          <Text style={styles.retryText}>Повторить</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={refreshControl}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Категории услуг</Text>
            <Text style={styles.subtitle}>
              {categories.length} всего · {categories.filter((c) => c.isActive).length} активных
            </Text>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={openAdd} activeOpacity={0.8} testID="admin-add-category">
            <Plus size={18} color={Colors.white} />
            <Text style={styles.addBtnText}>Добавить</Text>
          </TouchableOpacity>
        </View>

        {categories.map((cat) => (
          <View key={cat.id} style={[styles.card, !cat.isActive && styles.cardInactive]}>
            <View style={[styles.cardIcon, { backgroundColor: cat.bgColor }]}>
              <ServiceIcon name={cat.icon} size={20} color={cat.color} />
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardName} numberOfLines={1}>{cat.name}</Text>
              {cat.description ? (
                <Text style={styles.cardDesc} numberOfLines={2}>{cat.description}</Text>
              ) : null}
              <View style={styles.cardMetaRow}>
                <View style={styles.cardMetaItem}>
                  <Users size={12} color={Colors.textMuted} />
                  <Text style={styles.cardMetaText}>{cat.subscribersCount}</Text>
                </View>
                <View style={styles.cardMetaItem}>
                  <ClipboardList size={12} color={Colors.textMuted} />
                  <Text style={styles.cardMetaText}>{cat.requestsCount}</Text>
                </View>
                {!cat.isActive ? <Text style={styles.hiddenLabel}>Скрыта</Text> : null}
              </View>
            </View>
            <View style={styles.cardActions}>
              <Switch
                value={cat.isActive}
                onValueChange={() => handleToggleActive(cat)}
                trackColor={{ false: Colors.border, true: Colors.primary }}
                thumbColor={Colors.white}
              />
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => openEdit(cat)}
                activeOpacity={0.7}
                testID={`admin-edit-category-${cat.slug}`}
              >
                <Pencil size={16} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {categories.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>Категорий пока нет — добавьте первую</Text>
          </View>
        ) : null}
      </ScrollView>

      <Modal
        visible={editor.visible}
        animationType="slide"
        transparent
        onRequestClose={() => setEditor(emptyEditor)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editor.editingId ? 'Редактировать категорию' : 'Новая категория'}
              </Text>
              <TouchableOpacity onPress={() => setEditor(emptyEditor)} style={styles.modalClose}>
                <X size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <View style={styles.previewRow}>
                <View style={[styles.previewIcon, { backgroundColor: previewPreset.bgColor }]}>
                  <ServiceIcon name={editor.icon} size={24} color={previewPreset.color} />
                </View>
                <Text style={styles.previewName} numberOfLines={1}>
                  {editor.name.trim() || 'Название категории'}
                </Text>
              </View>

              <Text style={styles.fieldLabel}>Название</Text>
              <TextInput
                style={styles.input}
                value={editor.name}
                onChangeText={(v) => setEditor((s) => ({ ...s, name: v }))}
                placeholder="Например: Мойка окон"
                placeholderTextColor={Colors.textMuted}
                maxLength={128}
                testID="admin-category-name"
              />

              <Text style={styles.fieldLabel}>Описание</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                value={editor.description}
                onChangeText={(v) => setEditor((s) => ({ ...s, description: v }))}
                placeholder="Короткое описание услуги"
                placeholderTextColor={Colors.textMuted}
                maxLength={500}
                multiline
              />

              <Text style={styles.fieldLabel}>Иконка</Text>
              <View style={styles.iconGrid}>
                {SERVICE_ICON_NAMES.map((iconName) => {
                  const selected = editor.icon === iconName;
                  return (
                    <TouchableOpacity
                      key={iconName}
                      style={[styles.iconCell, selected && styles.iconCellSelected]}
                      onPress={() => {
                        setEditor((s) => ({ ...s, icon: iconName }));
                        void Haptics.selectionAsync();
                      }}
                      activeOpacity={0.7}
                    >
                      <ServiceIcon
                        name={iconName}
                        size={20}
                        color={selected ? Colors.primary : Colors.textSecondary}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Цвет</Text>
              <View style={styles.colorRow}>
                {COLOR_PRESETS.map((preset, index) => {
                  const selected = editor.colorIndex === index;
                  return (
                    <TouchableOpacity
                      key={`${preset.color}_${index}`}
                      style={[
                        styles.colorCell,
                        { backgroundColor: preset.bgColor },
                        selected && styles.colorCellSelected,
                      ]}
                      onPress={() => {
                        setEditor((s) => ({ ...s, colorIndex: index }));
                        void Haptics.selectionAsync();
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.colorDot, { backgroundColor: preset.color }]} />
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={isSaving}
                activeOpacity={0.8}
                testID="admin-save-category"
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Text style={styles.saveBtnText}>
                    {editor.editingId ? 'Сохранить' : 'Создать категорию'}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  errorText: {
    color: Colors.danger,
    fontSize: 14,
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.primary,
  },
  retryText: {
    color: Colors.white,
    fontWeight: '600' as const,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 120,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  addBtnText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  cardInactive: {
    opacity: 0.55,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
  },
  cardName: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  cardDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
  },
  cardMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardMetaText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  hiddenLabel: {
    fontSize: 11,
    color: Colors.warning,
    fontWeight: '600' as const,
  },
  cardActions: {
    alignItems: 'center',
    gap: 8,
  },
  editBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.cardSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Colors.backgroundSecondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    paddingHorizontal: 20,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 12,
    marginTop: 8,
    marginBottom: 4,
  },
  previewIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    marginTop: 16,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.text,
  },
  inputMultiline: {
    minHeight: 72,
    textAlignVertical: 'top' as const,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  iconCell: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCellSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.successLight,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  colorCell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorCellSelected: {
    borderColor: Colors.primary,
  },
  colorDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  saveBtn: {
    marginTop: 24,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700' as const,
  },
});
