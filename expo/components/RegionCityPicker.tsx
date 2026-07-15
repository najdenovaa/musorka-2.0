import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
  StyleSheet,
  Dimensions,
  Animated,
  PanResponder,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { ChevronDown, ChevronUp, Search, X, MapPin, Check } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { getRegionNames, getCitiesByRegion } from '@/constants/russian-regions';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_MAX = SCREEN_HEIGHT * 0.85;
const SHEET_MIN = SCREEN_HEIGHT * 0.35;
const SHEET_DEFAULT = SCREEN_HEIGHT * 0.7;

interface PickerModalProps {
  visible: boolean;
  title: string;
  items: string[];
  selectedItem: string;
  onSelect: (item: string) => void;
  onClose: () => void;
}

function PickerModal({ visible, title, items, selectedItem, onSelect, onClose }: PickerModalProps) {
  const [search, setSearch] = useState<string>('');
  const sheetHeight = useRef(new Animated.Value(SHEET_DEFAULT)).current;
  const lastHeight = useRef(SHEET_DEFAULT);
  const dragStartHeight = useRef(SHEET_DEFAULT);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 4,
      onPanResponderGrant: () => {
        dragStartHeight.current = lastHeight.current;
      },
      onPanResponderMove: (_, gestureState) => {
        const newHeight = dragStartHeight.current - gestureState.dy;
        const clamped = Math.max(SHEET_MIN, Math.min(SHEET_MAX, newHeight));
        sheetHeight.setValue(clamped);
        lastHeight.current = clamped;
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 120 && gestureState.vy > 0.3) {
          onClose();
          return;
        }

        let target = lastHeight.current;
        if (gestureState.dy < -40) {
          target = SHEET_MAX;
        } else if (gestureState.dy > 40) {
          target = SHEET_DEFAULT;
        }

        Animated.spring(sheetHeight, {
          toValue: target,
          useNativeDriver: false,
          tension: 80,
          friction: 12,
        }).start();
        lastHeight.current = target;
      },
    })
  ).current;

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase().trim();
    return items.filter((item) => item.toLowerCase().includes(q));
  }, [items, search]);

  const handleSelect = useCallback((item: string) => {
    onSelect(item);
    setSearch('');
  }, [onSelect]);

  const handleClose = useCallback(() => {
    setSearch('');
    sheetHeight.setValue(SHEET_DEFAULT);
    lastHeight.current = SHEET_DEFAULT;
    onClose();
  }, [onClose, sheetHeight]);

  const handleOverlayPress = useCallback(() => {
    Keyboard.dismiss();
    handleClose();
  }, [handleClose]);

  const renderItem = useCallback(({ item }: { item: string }) => {
    const isSelected = item === selectedItem;
    return (
      <TouchableOpacity
        style={[pickerStyles.listItem, isSelected && pickerStyles.listItemSelected]}
        onPress={() => handleSelect(item)}
        activeOpacity={0.7}
      >
        <Text style={[pickerStyles.listItemText, isSelected && pickerStyles.listItemTextSelected]}>
          {item}
        </Text>
        {isSelected ? <Check size={18} color={Colors.primary} /> : null}
      </TouchableOpacity>
    );
  }, [selectedItem, handleSelect]);

  const keyExtractor = useCallback((item: string) => item, []);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <TouchableWithoutFeedback onPress={handleOverlayPress}>
        <View style={pickerStyles.overlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <Animated.View style={[pickerStyles.sheet, { height: sheetHeight }]}>
              <View {...panResponder.panHandlers} style={pickerStyles.handleZone}>
                <View style={pickerStyles.handle} />
              </View>

              <View style={pickerStyles.header}>
                <Text style={pickerStyles.title}>{title}</Text>
                <TouchableOpacity onPress={handleClose} style={pickerStyles.closeBtn} activeOpacity={0.7}>
                  <X size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={pickerStyles.searchWrap}>
                <Search size={16} color={Colors.textMuted} />
                <TextInput
                  style={pickerStyles.searchInput}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Введите название для поиска..."
                  placeholderTextColor={Colors.textMuted}
                  autoCorrect={false}
                  autoCapitalize="none"
                  returnKeyType="search"
                />
                {search.length > 0 ? (
                  <TouchableOpacity onPress={() => setSearch('')} activeOpacity={0.7}>
                    <X size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>

              {search.length > 0 && filtered.length > 0 ? (
                <Text style={pickerStyles.resultCount}>
                  Найдено: {filtered.length}
                </Text>
              ) : null}

              <KeyboardAvoidingView
                style={pickerStyles.listContainer}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              >
                <FlatList
                  data={filtered}
                  renderItem={renderItem}
                  keyExtractor={keyExtractor}
                  style={pickerStyles.list}
                  contentContainerStyle={pickerStyles.listContent}
                  keyboardShouldPersistTaps="handled"
                  initialNumToRender={25}
                  maxToRenderPerBatch={30}
                  windowSize={10}
                  ListEmptyComponent={
                    <View style={pickerStyles.emptyWrap}>
                      <Text style={pickerStyles.emptyText}>Ничего не найдено</Text>
                      <Text style={pickerStyles.emptyHint}>Попробуйте изменить запрос</Text>
                    </View>
                  }
                />
              </KeyboardAvoidingView>
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

interface InlinePickerProps {
  title: string;
  items: string[];
  selectedItem: string;
  onSelect: (item: string) => void;
  onClose: () => void;
}

function InlinePicker({ title, items, selectedItem, onSelect, onClose }: InlinePickerProps) {
  const [search, setSearch] = useState<string>('');

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase().trim();
    return items.filter((item) => item.toLowerCase().includes(q));
  }, [items, search]);

  const handleSelect = useCallback((item: string) => {
    onSelect(item);
    setSearch('');
  }, [onSelect]);

  const renderItem = useCallback(({ item }: { item: string }) => {
    const isSelected = item === selectedItem;
    return (
      <TouchableOpacity
        style={[pickerStyles.listItem, isSelected && pickerStyles.listItemSelected]}
        onPress={() => handleSelect(item)}
        activeOpacity={0.7}
      >
        <Text style={[pickerStyles.listItemText, isSelected && pickerStyles.listItemTextSelected]}>
          {item}
        </Text>
        {isSelected ? <Check size={18} color={Colors.primary} /> : null}
      </TouchableOpacity>
    );
  }, [selectedItem, handleSelect]);

  const keyExtractor = useCallback((item: string) => item, []);

  return (
    <View style={inlineStyles.container}>
      <View style={inlineStyles.header}>
        <Text style={inlineStyles.title}>{title}</Text>
        <TouchableOpacity onPress={onClose} style={pickerStyles.closeBtn} activeOpacity={0.7}>
          <X size={18} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>
      <View style={inlineStyles.searchWrap}>
        <Search size={14} color={Colors.textMuted} />
        <TextInput
          style={inlineStyles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Введите название для поиска..."
          placeholderTextColor={Colors.textMuted}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {search.length > 0 ? (
          <TouchableOpacity onPress={() => setSearch('')} activeOpacity={0.7}>
            <X size={14} color={Colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>
      {search.length > 0 && filtered.length > 0 ? (
        <Text style={inlineStyles.resultCount}>
          Найдено: {filtered.length}
        </Text>
      ) : null}
      <FlatList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        style={inlineStyles.list}
        contentContainerStyle={inlineStyles.listContent}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={20}
        maxToRenderPerBatch={30}
        nestedScrollEnabled
        ListEmptyComponent={
          <View style={pickerStyles.emptyWrap}>
            <Text style={pickerStyles.emptyText}>Ничего не найдено</Text>
          </View>
        }
      />
    </View>
  );
}

interface RegionCityPickerProps {
  region: string;
  city: string;
  onRegionChange: (region: string) => void;
  onCityChange: (city: string) => void;
  disabled?: boolean;
  inline?: boolean;
}

export default function RegionCityPicker({ region, city, onRegionChange, onCityChange, disabled, inline }: RegionCityPickerProps) {
  const [showRegionPicker, setShowRegionPicker] = useState<boolean>(false);
  const [showCityPicker, setShowCityPicker] = useState<boolean>(false);

  const regionNames = useMemo(() => getRegionNames(), []);
  const cities = useMemo(() => (region ? getCitiesByRegion(region) : []), [region]);

  const handleRegionSelect = useCallback((newRegion: string) => {
    onRegionChange(newRegion);
    onCityChange('');
    setShowRegionPicker(false);
  }, [onRegionChange, onCityChange]);

  const handleCitySelect = useCallback((newCity: string) => {
    onCityChange(newCity);
    setShowCityPicker(false);
  }, [onCityChange]);

  const handleRegionPress = useCallback(() => {
    setShowCityPicker(false);
    setShowRegionPicker((prev) => !prev);
  }, []);

  const handleCityPress = useCallback(() => {
    if (!region) return;
    setShowRegionPicker(false);
    setShowCityPicker((prev) => !prev);
  }, [region]);

  if (inline) {
    return (
      <View style={pickerStyles.container}>
        <TouchableOpacity
          style={pickerStyles.selector}
          onPress={handleRegionPress}
          activeOpacity={0.7}
          disabled={disabled}
          testID="region-picker-btn"
        >
          <MapPin size={16} color={region ? Colors.primary : Colors.textMuted} />
          <Text style={[pickerStyles.selectorText, !region && pickerStyles.selectorPlaceholder]} numberOfLines={1}>
            {region || 'Выберите регион'}
          </Text>
          {showRegionPicker ? (
            <ChevronUp size={16} color={Colors.textMuted} />
          ) : (
            <ChevronDown size={16} color={Colors.textMuted} />
          )}
        </TouchableOpacity>

        {showRegionPicker && (
          <InlinePicker
            title="Выберите регион"
            items={regionNames}
            selectedItem={region}
            onSelect={handleRegionSelect}
            onClose={() => setShowRegionPicker(false)}
          />
        )}

        <TouchableOpacity
          style={[pickerStyles.selector, !region && pickerStyles.selectorDisabled]}
          onPress={handleCityPress}
          activeOpacity={region ? 0.7 : 1}
          disabled={disabled || !region}
          testID="city-picker-btn"
        >
          <MapPin size={16} color={city ? Colors.primary : Colors.textMuted} />
          <Text style={[pickerStyles.selectorText, !city && pickerStyles.selectorPlaceholder]} numberOfLines={1}>
            {city || (region ? 'Выберите город' : 'Сначала выберите регион')}
          </Text>
          {showCityPicker ? (
            <ChevronUp size={16} color={Colors.textMuted} />
          ) : (
            <ChevronDown size={16} color={Colors.textMuted} />
          )}
        </TouchableOpacity>

        {showCityPicker && (
          <InlinePicker
            title="Выберите город"
            items={cities}
            selectedItem={city}
            onSelect={handleCitySelect}
            onClose={() => setShowCityPicker(false)}
          />
        )}
      </View>
    );
  }

  return (
    <View style={pickerStyles.container}>
      <TouchableOpacity
        style={pickerStyles.selector}
        onPress={() => setShowRegionPicker(true)}
        activeOpacity={0.7}
        disabled={disabled}
        testID="region-picker-btn"
      >
        <MapPin size={16} color={region ? Colors.primary : Colors.textMuted} />
        <Text style={[pickerStyles.selectorText, !region && pickerStyles.selectorPlaceholder]} numberOfLines={1}>
          {region || 'Выберите регион'}
        </Text>
        <ChevronDown size={16} color={Colors.textMuted} />
      </TouchableOpacity>

      <TouchableOpacity
        style={[pickerStyles.selector, !region && pickerStyles.selectorDisabled]}
        onPress={() => { if (region) setShowCityPicker(true); }}
        activeOpacity={region ? 0.7 : 1}
        disabled={disabled || !region}
        testID="city-picker-btn"
      >
        <MapPin size={16} color={city ? Colors.primary : Colors.textMuted} />
        <Text style={[pickerStyles.selectorText, !city && pickerStyles.selectorPlaceholder]} numberOfLines={1}>
          {city || (region ? 'Выберите город' : 'Сначала выберите регион')}
        </Text>
        <ChevronDown size={16} color={Colors.textMuted} />
      </TouchableOpacity>

      <PickerModal
        visible={showRegionPicker}
        title="Выберите регион"
        items={regionNames}
        selectedItem={region}
        onSelect={handleRegionSelect}
        onClose={() => setShowRegionPicker(false)}
      />

      <PickerModal
        visible={showCityPicker}
        title="Выберите город"
        items={cities}
        selectedItem={city}
        onSelect={handleCitySelect}
        onClose={() => setShowCityPicker(false)}
      />
    </View>
  );
}

const inlineStyles = StyleSheet.create({
  container: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginTop: 4,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
  },
  title: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 10,
    marginHorizontal: 10,
    marginBottom: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: Colors.text,
    paddingVertical: 8,
  },
  resultCount: {
    fontSize: 12,
    color: Colors.textMuted,
    paddingHorizontal: 14,
    marginBottom: 4,
  },
  list: {
    maxHeight: 260,
  },
  listContent: {
    paddingHorizontal: 6,
    paddingBottom: 10,
  },
});

const pickerStyles = StyleSheet.create({
  container: {
    gap: 8,
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  selectorDisabled: {
    opacity: 0.5,
  },
  selectorText: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
  },
  selectorPlaceholder: {
    color: Colors.textMuted,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderBottomWidth: 0,
    overflow: 'hidden',
  },
  handleZone: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
    paddingBottom: 6,
    cursor: 'grab' as any,
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    marginHorizontal: 20,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
    paddingVertical: 10,
  },
  resultCount: {
    fontSize: 12,
    color: Colors.textMuted,
    paddingHorizontal: 24,
    marginBottom: 4,
  },
  listContainer: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 40,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 2,
  },
  listItemSelected: {
    backgroundColor: 'rgba(22,163,74,0.08)',
  },
  listItemText: {
    fontSize: 15,
    color: Colors.text,
    flex: 1,
  },
  listItemTextSelected: {
    color: Colors.primary,
    fontWeight: '700' as const,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  emptyHint: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
    opacity: 0.7,
  },
});
