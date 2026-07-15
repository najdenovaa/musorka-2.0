import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Platform,
} from 'react-native';
import { useRouter, Stack, useLocalSearchParams } from 'expo-router';
import { MapPin, Search, Check, Navigation } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { tyumenAddresses, tyumenDistricts } from '@/mocks/tyumen-addresses';
import { TyumenAddress } from '@/types';
import { searchInputProps, streetAddressInputProps } from '@/lib/text-input-autofill';

export default function MapPickerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ currentAddress?: string }>();
  const [search, setSearch] = useState<string>('');
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<TyumenAddress | null>(null);
  const [customAddress, setCustomAddress] = useState<string>(params.currentAddress ?? '');

  const filteredAddresses = useMemo(() => {
    let filtered = tyumenAddresses;
    if (selectedDistrict) {
      filtered = filtered.filter(a => a.district === selectedDistrict);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(a => a.address.toLowerCase().includes(q));
    }
    return filtered;
  }, [search, selectedDistrict]);

  const handleSelect = (addr: TyumenAddress) => {
    setSelectedAddress(addr);
    setCustomAddress(addr.address);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleConfirm = () => {
    if (!customAddress.trim()) {
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch((error) => {
      console.log('[MapPicker] Haptics error:', error);
    });

    const normalizedAddress = customAddress.trim();
    console.log('[MapPicker] Confirmed address:', {
      address: normalizedAddress,
      latitude: selectedAddress?.latitude,
      longitude: selectedAddress?.longitude,
      platform: Platform.OS,
    });

    router.push({
      pathname: '/create-request',
      params: {
        selectedAddress: normalizedAddress,
        latitude: selectedAddress?.latitude?.toString() ?? '',
        longitude: selectedAddress?.longitude?.toString() ?? '',
      },
    });
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Выбор адреса',
          headerStyle: { backgroundColor: Colors.white },
          headerTintColor: Colors.primary,
        }}
      />

      <View style={styles.mapPreview}>
        <View style={styles.mapPlaceholder}>
          <Navigation size={32} color={Colors.primary} />
          <Text style={styles.mapCity}>Выбор адреса</Text>
          <Text style={styles.mapCoords}>
            {selectedAddress
              ? `${selectedAddress.latitude.toFixed(4)}, ${selectedAddress.longitude.toFixed(4)}`
              : '57.1553, 65.5340'}
          </Text>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <Search size={18} color={Colors.textMuted} />
        <TextInput
          {...searchInputProps}
          style={styles.searchInput}
          placeholder="Поиск улицы..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
          testID="address-search"
        />
      </View>

      <View style={styles.districtsRow}>
        <TouchableOpacity
          style={[styles.districtChip, !selectedDistrict && styles.districtChipActive]}
          onPress={() => setSelectedDistrict(null)}
        >
          <Text style={[styles.districtText, !selectedDistrict && styles.districtTextActive]}>Все</Text>
        </TouchableOpacity>
        {tyumenDistricts.map(d => (
          <TouchableOpacity
            key={d}
            style={[styles.districtChip, selectedDistrict === d && styles.districtChipActive]}
            onPress={() => setSelectedDistrict(selectedDistrict === d ? null : d)}
          >
            <Text style={[styles.districtText, selectedDistrict === d && styles.districtTextActive]}>{d}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredAddresses}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.addressItem, selectedAddress?.id === item.id && styles.addressItemActive]}
            onPress={() => handleSelect(item)}
            activeOpacity={0.7}
          >
            <MapPin size={18} color={selectedAddress?.id === item.id ? Colors.primary : Colors.textSecondary} />
            <View style={styles.addressContent}>
              <Text style={[styles.addressText, selectedAddress?.id === item.id && styles.addressTextActive]}>
                {item.address}
              </Text>
              <Text style={styles.addressDistrict}>{item.district} район</Text>
            </View>
            {selectedAddress?.id === item.id && (
              <Check size={18} color={Colors.primary} />
            )}
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      <View style={styles.customAddressContainer}>
        <TextInput
          {...streetAddressInputProps}
          style={styles.customInput}
          placeholder="Или введите адрес вручную..."
          placeholderTextColor={Colors.textMuted}
          value={customAddress}
          onChangeText={setCustomAddress}
          testID="custom-address"
        />
      </View>

      <TouchableOpacity
        style={[styles.confirmButton, !customAddress.trim() && styles.confirmButtonDisabled]}
        onPress={handleConfirm}
        disabled={!customAddress.trim()}
        activeOpacity={0.8}
        testID="confirm-address"
      >
        <Text style={styles.confirmText}>Подтвердить адрес</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  mapPreview: {
    height: 140,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 16,
    overflow: 'hidden',
  },
  mapPlaceholder: {
    flex: 1,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.primaryLight,
    borderStyle: "dashed",
  },
  mapCity: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.primary,
    marginTop: 8,
  },
  mapCoords: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.text,
  },
  districtsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 12,
    gap: 8,
    flexWrap: 'wrap',
  },
  districtChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  districtChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  districtText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  districtTextActive: {
    color: Colors.white,
  },
  listContent: {
    padding: 16,
    paddingBottom: 8,
  },
  addressItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  addressItemActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  addressContent: {
    flex: 1,
  },
  addressText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.text,
  },
  addressTextActive: {
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  addressDistrict: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  customAddressContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  customInput: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  confirmButton: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    marginHorizontal: 16,
    marginBottom: 20,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.white,
  },
});
