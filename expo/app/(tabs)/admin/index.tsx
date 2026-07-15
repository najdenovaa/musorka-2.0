import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  FlatList,
  Modal,
} from 'react-native';
import { Image } from '@/components/MImage';
import { useRouter } from 'expo-router';
import {
  Users,
  ClipboardList,
  Send,
  Search,
  BarChart3,
  FileText,
  Clock,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  User,
  X,
  KeyRound,
  Pencil,
  Trash2,
  Shield,
  ShieldOff,
  Eye,
  Smartphone,
  LogOut,
  Mail,
  Phone,
  MapPin,
  Star,
  MessageSquare,
  Briefcase,
  Calendar,
  Lock,
  Hash,
  Globe,
  Building2,
  TrendingUp,
  Sparkles,
  Wrench,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useFloatingHeaderHeight } from '@/components/FloatingHeader';
import Colors from '@/constants/colors';
import { METALLIC_BORDER_COLOR, METALLIC_BORDER_COLOR_STRONG, METALLIC_SHADOW_COLOR } from '@/constants/metallic';
import { useMRefreshControl } from '@/components/MRefreshControl';
import { useAuth } from '@/providers/AuthProvider';
import { trpc } from '@/lib/trpc';
import {
  addressCityInputProps,
  emailInputProps,
  familyNameInputProps,
  givenNameInputProps,
  newPasswordInputProps,
  phoneInputProps,
  plainFieldProps,
  searchInputProps,
} from '@/lib/text-input-autofill';
import MLoader from '@/components/MLoader';
import AdminServicesSection from '@/components/AdminServicesSection';

type AdminTab = 'dashboard' | 'users' | 'requests' | 'services' | 'broadcast' | 'audit';

export default function AdminScreen() {
  const { role } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');

  const isAdmin = role === 'admin';

  const tabs: { key: AdminTab; label: string; icon: React.ReactNode; adminOnly: boolean }[] = useMemo(() => [
    { key: 'dashboard', label: 'Обзор', icon: <BarChart3 size={18} color={activeTab === 'dashboard' ? Colors.primary : Colors.textMuted} />, adminOnly: true },
    { key: 'users', label: 'Пользователи', icon: <Users size={18} color={activeTab === 'users' ? Colors.primary : Colors.textMuted} />, adminOnly: true },
    { key: 'requests', label: 'Заявки', icon: <ClipboardList size={18} color={activeTab === 'requests' ? Colors.primary : Colors.textMuted} />, adminOnly: true },
    { key: 'services', label: 'Услуги', icon: <Wrench size={18} color={activeTab === 'services' ? Colors.primary : Colors.textMuted} />, adminOnly: true },
    { key: 'broadcast', label: 'Рассылка', icon: <Send size={18} color={activeTab === 'broadcast' ? Colors.primary : Colors.textMuted} />, adminOnly: true },
    { key: 'audit', label: 'Журнал', icon: <FileText size={18} color={activeTab === 'audit' ? Colors.primary : Colors.textMuted} />, adminOnly: true },
  ], [activeTab]);

  const visibleTabs = useMemo(() => tabs.filter(t => !t.adminOnly || isAdmin), [tabs, isAdmin]);

  const floatingHeaderHeight = useFloatingHeaderHeight();

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.tabBar, { marginTop: floatingHeaderHeight }]} contentContainerStyle={styles.tabBarContent}>
        {visibleTabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tabItem, activeTab === tab.key && styles.tabItemActive]}
            onPress={() => {
              setActiveTab(tab.key);
              void Haptics.selectionAsync();
            }}
            activeOpacity={0.7}
          >
            {tab.icon}
            <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.content}>
        {activeTab === 'dashboard' && isAdmin && <DashboardSection />}
        {activeTab === 'users' && isAdmin && <UsersSection />}
        {activeTab === 'requests' && isAdmin && <RequestsSection />}
        {activeTab === 'services' && isAdmin && <AdminServicesSection />}
        {activeTab === 'broadcast' && isAdmin && <BroadcastSection />}
        {activeTab === 'audit' && isAdmin && <AuditSection />}
      </View>
    </View>
  );
}

function DashboardSection() {
  const statsQuery = trpc.admin.stats.useQuery(undefined, {
    retry: 1,
    staleTime: 30_000,
  });
  const [showRegionDetails, setShowRegionDetails] = useState<boolean>(false);
  const [showCityDetails, setShowCityDetails] = useState<boolean>(false);

  const { refreshControl: statsRefreshControl } = useMRefreshControl(statsQuery.isRefetching, () => statsQuery.refetch());

  if (statsQuery.isLoading) return <LoadingView />;
  if (statsQuery.error) return <ErrorView message={statsQuery.error.message} onRetry={() => statsQuery.refetch()} />;

  const stats = statsQuery.data;
  if (!stats) return null;

  const userCards = [
    { label: 'Всего', value: stats.totalUsers, color: Colors.primary, icon: '👥' },
    { label: 'Клиенты', value: stats.totalClients, color: Colors.info, icon: '👤' },
    { label: 'Исполнители', value: stats.totalExecutors, color: Colors.accent, icon: '🔧' },
    { label: 'Админы', value: stats.totalAdmins, color: '#A78BFA', icon: '🛡️' },
    { label: 'Поддержка', value: stats.totalSupport, color: '#34D399', icon: '💬' },
    { label: 'Заблокированы', value: stats.blockedUsers, color: Colors.danger, icon: '🚫' },
  ];

  const requestCards = [
    { label: 'Всего заявок', value: stats.totalRequests, color: Colors.primary },
    { label: 'Новые', value: stats.newRequests, color: Colors.info },
    { label: 'В работе', value: stats.inProgressRequests, color: Colors.accent },
    { label: 'Выполнены', value: stats.completedRequests, color: Colors.success },
    { label: 'Отменены', value: stats.cancelledRequests, color: Colors.danger },
  ];

  const regionStats = (stats as any).regionStats as { region: string; count: number }[] || [];
  const cityStats = (stats as any).cityStats as { city: string; count: number }[] || [];
  const regionRoleStats = (stats as any).regionRoleStats as { region: string; role: string; count: number }[] || [];
  const recentRegistrations = (stats as any).recentRegistrations as { day: string; count: number }[] || [];

  const totalRegUsers = regionStats.reduce((s, r) => s + r.count, 0);
  const totalCityUsers = cityStats.reduce((s, c) => s + c.count, 0);
  const recentTotal = recentRegistrations.reduce((s, r) => s + r.count, 0);

  return (
    <ScrollView
      style={styles.section}
      contentContainerStyle={styles.sectionContent}
      refreshControl={statsRefreshControl}
    >
      <Text style={styles.sectionTitle}>Пользователи</Text>
      <View style={styles.statsGrid}>
        {userCards.map((card, i) => (
          <View key={i} style={styles.statCard}>
            <Text style={styles.statEmoji}>{card.icon}</Text>
            <Text style={[styles.statValue, { color: card.color }]}>{card.value}</Text>
            <Text style={styles.statLabel}>{card.label}</Text>
          </View>
        ))}
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Заявки</Text>
      <View style={styles.statsGrid}>
        {requestCards.map((card, i) => (
          <View key={i} style={styles.statCard}>
            <Text style={[styles.statValue, { color: card.color }]}>{card.value}</Text>
            <Text style={styles.statLabel}>{card.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.extraStats}>
        <View style={styles.extraStatRow}>
          <Text style={styles.extraStatLabel}>Средний рейтинг</Text>
          <Text style={styles.extraStatValue}>⭐ {stats.averageRating.toFixed(1)}</Text>
        </View>
        <View style={styles.extraStatDivider} />
        <View style={styles.extraStatRow}>
          <Text style={styles.extraStatLabel}>Всего отзывов</Text>
          <Text style={styles.extraStatValue}>{stats.totalReviews}</Text>
        </View>
        <View style={styles.extraStatDivider} />
        <View style={styles.extraStatRow}>
          <Text style={styles.extraStatLabel}>Чатов поддержки</Text>
          <Text style={styles.extraStatValue}>{stats.supportChats}</Text>
        </View>
      </View>

      {recentRegistrations.length > 0 && (
        <View style={dashStyles.analyticsCard}>
          <View style={dashStyles.analyticsHeader}>
            <TrendingUp size={16} color={Colors.success} />
            <Text style={dashStyles.analyticsTitle}>Регистрации за 30 дней</Text>
            <Text style={dashStyles.analyticsBadge}>{recentTotal}</Text>
          </View>
          <View style={dashStyles.barChart}>
            {recentRegistrations.slice(0, 14).reverse().map((item, i) => {
              const maxCount = Math.max(...recentRegistrations.slice(0, 14).map(r => r.count), 1);
              const heightPct = (item.count / maxCount) * 100;
              const dayLabel = item.day.slice(8);
              return (
                <View key={i} style={dashStyles.barItem}>
                  <Text style={dashStyles.barValue}>{item.count}</Text>
                  <View style={[dashStyles.bar, { height: Math.max(heightPct * 0.6, 4), backgroundColor: Colors.primary }]} />
                  <Text style={dashStyles.barLabel}>{dayLabel}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {regionStats.length > 0 && (
        <View style={dashStyles.analyticsCard}>
          <TouchableOpacity
            style={dashStyles.analyticsHeader}
            onPress={() => setShowRegionDetails(v => !v)}
            activeOpacity={0.7}
          >
            <Globe size={16} color={Colors.info} />
            <Text style={[dashStyles.analyticsTitle, { flex: 1 }]}>По регионам</Text>
            <Text style={dashStyles.analyticsBadge}>{regionStats.length}</Text>
            <ChevronDown size={16} color={Colors.textMuted} style={showRegionDetails ? { transform: [{ rotate: '180deg' }] } : undefined} />
          </TouchableOpacity>
          {regionStats.slice(0, showRegionDetails ? regionStats.length : 5).map((item, i) => {
            const pct = totalRegUsers > 0 ? Math.round((item.count / totalRegUsers) * 100) : 0;
            const roleBreakdown = regionRoleStats.filter(r => r.region === item.region);
            const clientCount = roleBreakdown.find(r => r.role === 'client')?.count || 0;
            const executorCount = roleBreakdown.find(r => r.role === 'executor')?.count || 0;
            return (
              <View key={i} style={dashStyles.geoRow}>
                <View style={dashStyles.geoInfo}>
                  <Text style={dashStyles.geoName} numberOfLines={1}>{item.region}</Text>
                  <Text style={dashStyles.geoSub}>Кл: {clientCount} · Исп: {executorCount}</Text>
                </View>
                <View style={dashStyles.geoBarWrap}>
                  <View style={[dashStyles.geoBar, { width: `${pct}%` as any, backgroundColor: Colors.info }]} />
                </View>
                <Text style={dashStyles.geoCount}>{item.count}</Text>
              </View>
            );
          })}
          {regionStats.length > 5 && !showRegionDetails && (
            <TouchableOpacity onPress={() => setShowRegionDetails(true)} activeOpacity={0.7} style={dashStyles.showMoreBtn}>
              <Text style={dashStyles.showMoreText}>Показать все ({regionStats.length})</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {cityStats.length > 0 && (
        <View style={dashStyles.analyticsCard}>
          <TouchableOpacity
            style={dashStyles.analyticsHeader}
            onPress={() => setShowCityDetails(v => !v)}
            activeOpacity={0.7}
          >
            <Building2 size={16} color={Colors.accent} />
            <Text style={[dashStyles.analyticsTitle, { flex: 1 }]}>По городам</Text>
            <Text style={dashStyles.analyticsBadge}>{cityStats.length}</Text>
            <ChevronDown size={16} color={Colors.textMuted} style={showCityDetails ? { transform: [{ rotate: '180deg' }] } : undefined} />
          </TouchableOpacity>
          {cityStats.slice(0, showCityDetails ? cityStats.length : 5).map((item, i) => {
            const pct = totalCityUsers > 0 ? Math.round((item.count / totalCityUsers) * 100) : 0;
            return (
              <View key={i} style={dashStyles.geoRow}>
                <View style={dashStyles.geoInfo}>
                  <Text style={dashStyles.geoName} numberOfLines={1}>{item.city}</Text>
                </View>
                <View style={dashStyles.geoBarWrap}>
                  <View style={[dashStyles.geoBar, { width: `${pct}%` as any, backgroundColor: Colors.accent }]} />
                </View>
                <Text style={dashStyles.geoCount}>{item.count}</Text>
              </View>
            );
          })}
          {cityStats.length > 5 && !showCityDetails && (
            <TouchableOpacity onPress={() => setShowCityDetails(true)} activeOpacity={0.7} style={dashStyles.showMoreBtn}>
              <Text style={dashStyles.showMoreText}>Показать все ({cityStats.length})</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const dashStyles = StyleSheet.create({
  analyticsCard: { backgroundColor: Colors.card, borderRadius: 16, padding: 16, marginTop: 20, borderWidth: 1.5, borderColor: METALLIC_BORDER_COLOR_STRONG },
  analyticsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  analyticsTitle: { fontSize: 16, fontWeight: '700' as const, color: Colors.text },
  analyticsBadge: { fontSize: 12, fontWeight: '700' as const, color: Colors.white, backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  barChart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 80, gap: 2 },
  barItem: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: '80%' as any, borderRadius: 3, minWidth: 4 },
  barValue: { fontSize: 8, color: Colors.textMuted, marginBottom: 2 },
  barLabel: { fontSize: 8, color: Colors.textMuted, marginTop: 3 },
  geoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 },
  geoInfo: { width: 120 },
  geoName: { fontSize: 13, color: Colors.text, fontWeight: '500' as const },
  geoSub: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  geoBarWrap: { flex: 1, height: 8, backgroundColor: Colors.border, borderRadius: 4, overflow: 'hidden' },
  geoBar: { height: '100%' as any, borderRadius: 4, minWidth: 4 },
  geoCount: { width: 36, textAlign: 'right' as const, fontSize: 13, fontWeight: '700' as const, color: Colors.text },
  showMoreBtn: { paddingVertical: 8, alignItems: 'center' },
  showMoreText: { fontSize: 13, color: Colors.primary, fontWeight: '600' as const },
});

function UsersSection() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string | undefined>(undefined);
  const [regionFilter, setRegionFilter] = useState<string | undefined>(undefined);
  const [cityFilter, setCityFilter] = useState<string | undefined>(undefined);
  const [showGeoFilters, setShowGeoFilters] = useState<boolean>(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const usersQuery = trpc.admin.users.useQuery(
    { search: search || undefined, region: regionFilter, city: cityFilter },
    { retry: 1, staleTime: 60_000, gcTime: 300000 }
  );

  const { refreshControl: usersRefreshControl } = useMRefreshControl(usersQuery.isRefetching, () => usersQuery.refetch());

  const filteredUsers = useMemo(() => {
    const all = usersQuery.data || [];
    if (!roleFilter) return all;
    return all.filter(u => u.role === roleFilter);
  }, [usersQuery.data, roleFilter]);

  const availableRegions = useMemo(() => {
    const all = usersQuery.data || [];
    const regionMap = new Map<string, number>();
    all.forEach(u => {
      const r = (u as any).region || '';
      if (r) regionMap.set(r, (regionMap.get(r) || 0) + 1);
    });
    return Array.from(regionMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([region, count]) => ({ region, count }));
  }, [usersQuery.data]);

  const availableCities = useMemo(() => {
    const all = usersQuery.data || [];
    const cityMap = new Map<string, number>();
    all.forEach(u => {
      const c = u.city || '';
      if (c) cityMap.set(c, (cityMap.get(c) || 0) + 1);
    });
    return Array.from(cityMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([city, count]) => ({ city, count }));
  }, [usersQuery.data]);

  const roleFilters = [
    { key: undefined, label: 'Все' },
    { key: 'client', label: 'Клиенты' },
    { key: 'executor', label: 'Исполнители' },
    { key: 'admin', label: 'Админы' },
    { key: 'support', label: 'Поддержка' },
  ];

  const handleUserPress = useCallback((user: { id: string }) => {
    void Haptics.selectionAsync();
    setSelectedUserId(user.id);
  }, []);

  const activeGeoFilterCount = (regionFilter ? 1 : 0) + (cityFilter ? 1 : 0);

  return (
    <View style={styles.section}>
      <View style={styles.searchRow}>
        <Search size={18} color={Colors.textMuted} />
        <TextInput
          {...searchInputProps}
          style={styles.searchInput}
          placeholder="Поиск по имени, телефону, email..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        {roleFilters.map((f) => (
          <TouchableOpacity
            key={f.key ?? 'all'}
            style={[styles.filterChip, roleFilter === f.key && styles.filterChipActive]}
            onPress={() => setRoleFilter(f.key)}
          >
            <Text style={[styles.filterChipText, roleFilter === f.key && styles.filterChipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[styles.filterChip, activeGeoFilterCount > 0 && styles.filterChipActive]}
          onPress={() => setShowGeoFilters(v => !v)}
        >
          <MapPin size={12} color={activeGeoFilterCount > 0 ? Colors.primary : Colors.textSecondary} />
          <Text style={[styles.filterChipText, activeGeoFilterCount > 0 && styles.filterChipTextActive]}>
            Гео{activeGeoFilterCount > 0 ? ` (${activeGeoFilterCount})` : ''}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {showGeoFilters && (
        <View style={geoFilterStyles.container}>
          <View style={geoFilterStyles.filterGroup}>
            <View style={geoFilterStyles.filterHeader}>
              <Globe size={14} color={Colors.info} />
              <Text style={geoFilterStyles.filterLabel}>Регион</Text>
              {regionFilter && (
                <TouchableOpacity onPress={() => { setRegionFilter(undefined); setCityFilter(undefined); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <X size={14} color={Colors.danger} />
                </TouchableOpacity>
              )}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={geoFilterStyles.chipRow}>
              {availableRegions.map((r) => (
                <TouchableOpacity
                  key={r.region}
                  style={[geoFilterStyles.chip, regionFilter === r.region && geoFilterStyles.chipActive]}
                  onPress={() => {
                    setRegionFilter(regionFilter === r.region ? undefined : r.region);
                    if (regionFilter !== r.region) setCityFilter(undefined);
                  }}
                >
                  <Text style={[geoFilterStyles.chipText, regionFilter === r.region && geoFilterStyles.chipTextActive]} numberOfLines={1}>
                    {r.region} ({r.count})
                  </Text>
                </TouchableOpacity>
              ))}
              {availableRegions.length === 0 && <Text style={geoFilterStyles.noData}>Нет данных</Text>}
            </ScrollView>
          </View>
          <View style={geoFilterStyles.filterGroup}>
            <View style={geoFilterStyles.filterHeader}>
              <Building2 size={14} color={Colors.accent} />
              <Text style={geoFilterStyles.filterLabel}>Город</Text>
              {cityFilter && (
                <TouchableOpacity onPress={() => setCityFilter(undefined)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <X size={14} color={Colors.danger} />
                </TouchableOpacity>
              )}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={geoFilterStyles.chipRow}>
              {availableCities.map((c) => (
                <TouchableOpacity
                  key={c.city}
                  style={[geoFilterStyles.chip, cityFilter === c.city && geoFilterStyles.chipActive]}
                  onPress={() => setCityFilter(cityFilter === c.city ? undefined : c.city)}
                >
                  <Text style={[geoFilterStyles.chipText, cityFilter === c.city && geoFilterStyles.chipTextActive]} numberOfLines={1}>
                    {c.city} ({c.count})
                  </Text>
                </TouchableOpacity>
              ))}
              {availableCities.length === 0 && <Text style={geoFilterStyles.noData}>Нет данных</Text>}
            </ScrollView>
          </View>
        </View>
      )}

      {usersQuery.isLoading ? (
        <LoadingView />
      ) : usersQuery.error ? (
        <ErrorView message={usersQuery.error.message} onRetry={() => usersQuery.refetch()} />
      ) : (
        <FlatList
          data={filteredUsers}
          keyExtractor={(item) => item.id}
          style={styles.list}
          refreshControl={usersRefreshControl}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.userCard, item.isBlocked && styles.userCardBlocked]}
              onPress={() => handleUserPress(item)}
              activeOpacity={0.7}
            >
              <View style={styles.userAvatarWrap}>
                {item.avatar ? (
                  <Image source={{ uri: item.avatar }} style={styles.userAvatar} />
                ) : (
                  <View style={styles.userAvatarPlaceholder}>
                    <User size={20} color={Colors.primary} />
                  </View>
                )}
              </View>
              <View style={styles.userInfo}>
                <View style={styles.userNameRow}>
                  <Text style={styles.userName} numberOfLines={1}>{item.name}</Text>
                  {(item as any).userNumber && (
                    <View style={userIdStyles.idBadge}>
                      <Hash size={9} color={Colors.textMuted} />
                      <Text style={userIdStyles.idText}>{(item as any).userNumber}</Text>
                    </View>
                  )}
                  <View style={[styles.rolePill, { backgroundColor: getRoleColor(item.role) + '25' }]}>
                    <Text style={[styles.rolePillText, { color: getRoleColor(item.role) }]}>{getRoleLabel(item.role)}</Text>
                  </View>
                </View>
                <Text style={styles.userMeta} numberOfLines={1}>{item.phone}{item.email ? ` · ${item.email}` : ''}</Text>
                {(item.city || (item as any).region) && (
                  <Text style={styles.userMeta} numberOfLines={1}>
                    📍 {[(item as any).region, item.city].filter(Boolean).join(', ')}
                  </Text>
                )}
                <View style={styles.userStatsRow}>
                  <Text style={styles.userStatChip}>⭐ {item.rating?.toFixed(1)}</Text>
                  <Text style={styles.userStatChip}>Заявок: {item.requestsCount}</Text>
                  <Text style={styles.userStatChip}>Выполнено: {item.completedCount}</Text>
                </View>
                {item.isBlocked && (
                  <View style={styles.blockedRow}>
                    <AlertTriangle size={12} color={Colors.danger} />
                    <Text style={styles.blockedBadge}>ЗАБЛОКИРОВАН</Text>
                  </View>
                )}
              </View>
              <ChevronRight size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>Пользователи не найдены</Text>}
        />
      )}

      {selectedUserId && (
        <UserDetailModal
          userId={selectedUserId}
          onClose={() => setSelectedUserId(null)}
          onRefresh={() => usersQuery.refetch()}
        />
      )}
    </View>
  );
}

const geoFilterStyles = StyleSheet.create({
  container: { backgroundColor: Colors.card, borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1.5, borderColor: METALLIC_BORDER_COLOR },
  filterGroup: { marginBottom: 8 },
  filterHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  filterLabel: { fontSize: 12, fontWeight: '600' as const, color: Colors.textSecondary, flex: 1 },
  chipRow: { maxHeight: 36 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, backgroundColor: Colors.backgroundSecondary, borderWidth: 1.5, borderColor: METALLIC_BORDER_COLOR, marginRight: 6 },
  chipActive: { backgroundColor: Colors.primary + '25', borderColor: METALLIC_BORDER_COLOR_STRONG },
  chipText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500' as const },
  chipTextActive: { color: Colors.primary, fontWeight: '600' as const },
  noData: { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic' as const, paddingVertical: 6 },
});

const userIdStyles = StyleSheet.create({
  idBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: Colors.backgroundSecondary, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  idText: { fontSize: 10, fontWeight: '700' as const, color: Colors.textMuted },
});

const personalStyles = StyleSheet.create({
  container: { marginTop: 8, backgroundColor: Colors.backgroundSecondary, borderRadius: 12, padding: 12, borderWidth: 1.5, borderColor: METALLIC_BORDER_COLOR },
  fieldChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: Colors.card, borderWidth: 1.5, borderColor: METALLIC_BORDER_COLOR },
  fieldChipActive: { backgroundColor: Colors.primary + '25', borderColor: METALLIC_BORDER_COLOR_STRONG },
  fieldChipText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' as const },
  fieldChipTextActive: { color: Colors.primary, fontWeight: '700' as const },
  selectedWrap: { marginBottom: 8 },
  selectedLabel: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' as const, marginBottom: 6 },
  selectedChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primary + '20', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: Colors.primary + '40', maxWidth: 180 },
  selectedChipText: { fontSize: 12, fontWeight: '600' as const, color: Colors.primary },
  resultsWrap: { maxHeight: 320, backgroundColor: Colors.card, borderRadius: 10, borderWidth: 1, borderColor: METALLIC_BORDER_COLOR, overflow: 'hidden' as const },
  resultItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  resultItemSelected: { backgroundColor: Colors.primary + '10' },
  resultName: { fontSize: 14, fontWeight: '600' as const, color: Colors.text, flexShrink: 1 },
  resultMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: METALLIC_BORDER_COLOR_STRONG, alignItems: 'center' as const, justifyContent: 'center' as const },
  checkboxActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' as const, padding: 16, fontStyle: 'italic' as const },
});

interface UserDetailModalProps {
  userId: string;
  onClose: () => void;
  onRefresh: () => void;
}

function UserDetailModal({ userId, onClose, onRefresh }: UserDetailModalProps) {
  const [activeModalTab, setActiveModalTab] = useState<'info' | 'edit' | 'password' | 'activity'>('info');
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editAbout, setEditAbout] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [editInitialized, setEditInitialized] = useState(false);

  const detailsQuery = trpc.admin.adminGetUserDetails.useQuery(
    { userId },
    { retry: 1, staleTime: 30000 }
  );

  const resetPasswordMutation = trpc.admin.adminResetPassword.useMutation({
    onSuccess: () => {
      Alert.alert('Готово', 'Пароль пользователя сброшен');
      setNewPassword('');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err) => Alert.alert('Ошибка', err.message),
  });

  const updateUserMutation = trpc.admin.adminUpdateUser.useMutation({
    onSuccess: () => {
      Alert.alert('Готово', 'Данные пользователя обновлены');
      void detailsQuery.refetch();
      onRefresh();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err) => Alert.alert('Ошибка', err.message),
  });

  const blockMutation = trpc.admin.blockUser.useMutation({
    onSuccess: () => {
      Alert.alert('Готово', 'Пользователь заблокирован');
      void detailsQuery.refetch();
      onRefresh();
    },
    onError: (err) => Alert.alert('Ошибка', err.message),
  });

  const unblockMutation = trpc.admin.unblockUser.useMutation({
    onSuccess: () => {
      Alert.alert('Готово', 'Пользователь разблокирован');
      void detailsQuery.refetch();
      onRefresh();
    },
    onError: (err) => Alert.alert('Ошибка', err.message),
  });

  const deleteMutation = trpc.admin.deleteUser.useMutation({
    onSuccess: () => {
      Alert.alert('Готово', 'Пользователь удалён');
      onRefresh();
      onClose();
    },
    onError: (err) => Alert.alert('Ошибка', err.message),
  });

  const revokeMutation = trpc.admin.adminRevokeAllSessions.useMutation({
    onSuccess: () => {
      Alert.alert('Готово', 'Все сессии пользователя завершены');
      void detailsQuery.refetch();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err) => Alert.alert('Ошибка', err.message),
  });

  const user = detailsQuery.data;

  React.useEffect(() => {
    if (user && !editInitialized) {
      setEditFirstName(user.firstName || '');
      setEditLastName(user.lastName || '');
      setEditPhone(user.phone || '');
      setEditEmail(user.email || '');
      setEditCity(user.city || '');
      setEditRole(user.role || '');
      setEditAbout(user.about || '');
      setEditInitialized(true);
    }
  }, [user, editInitialized]);

  const handleResetPassword = useCallback(() => {
    if (!newPassword.trim() || newPassword.trim().length < 4) {
      Alert.alert('Ошибка', 'Пароль должен быть минимум 4 символа');
      return;
    }
    Alert.alert('Подтверждение', `Сбросить пароль пользователя?`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Сбросить', style: 'destructive', onPress: () => resetPasswordMutation.mutate({ userId, newPassword: newPassword.trim() }) },
    ]);
  }, [newPassword, userId, resetPasswordMutation]);

  const handleSaveUser = useCallback(() => {
    const updates: Record<string, string> = {};
    if (user) {
      if (editFirstName.trim() !== (user.firstName || '')) updates.firstName = editFirstName.trim();
      if (editLastName.trim() !== (user.lastName || '')) updates.lastName = editLastName.trim();
      if (editPhone.trim() !== (user.phone || '')) updates.phone = editPhone.trim();
      if (editEmail.trim() !== (user.email || '')) updates.email = editEmail.trim();
      if (editCity.trim() !== (user.city || '')) updates.city = editCity.trim();
      if (editRole !== user.role) updates.role = editRole;
      if (editAbout.trim() !== (user.about || '')) updates.about = editAbout.trim();
    }
    if (Object.keys(updates).length === 0) {
      Alert.alert('Нет изменений', 'Данные не были изменены');
      return;
    }
    Alert.alert('Подтверждение', 'Сохранить изменения?', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Сохранить', onPress: () => updateUserMutation.mutate({ userId, ...updates }) },
    ]);
  }, [user, editFirstName, editLastName, editPhone, editEmail, editCity, editRole, editAbout, userId, updateUserMutation]);

  const handleBlock = useCallback(() => {
    Alert.alert('Подтверждение', 'Заблокировать пользователя?', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Заблокировать', style: 'destructive', onPress: () => blockMutation.mutate({ userId }) },
    ]);
  }, [userId, blockMutation]);

  const handleUnblock = useCallback(() => {
    Alert.alert('Подтверждение', 'Разблокировать пользователя?', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Разблокировать', onPress: () => unblockMutation.mutate({ userId }) },
    ]);
  }, [userId, unblockMutation]);

  const handleDelete = useCallback(() => {
    Alert.alert('Удалить пользователя?', 'Это действие необратимо. Все данные будут удалены.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => deleteMutation.mutate({ userId }) },
    ]);
  }, [userId, deleteMutation]);

  const handleRevokeSessions = useCallback(() => {
    Alert.alert('Подтверждение', 'Завершить все сессии пользователя? Он будет разлогинен на всех устройствах.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Завершить', style: 'destructive', onPress: () => revokeMutation.mutate({ userId }) },
    ]);
  }, [userId, revokeMutation]);

  const modalTabs = [
    { key: 'info' as const, label: 'Инфо', icon: <Eye size={14} color={activeModalTab === 'info' ? Colors.primary : Colors.textMuted} /> },
    { key: 'edit' as const, label: 'Редакт.', icon: <Pencil size={14} color={activeModalTab === 'edit' ? Colors.primary : Colors.textMuted} /> },
    { key: 'password' as const, label: 'Пароль', icon: <KeyRound size={14} color={activeModalTab === 'password' ? Colors.primary : Colors.textMuted} /> },
    { key: 'activity' as const, label: 'Активность', icon: <Briefcase size={14} color={activeModalTab === 'activity' ? Colors.primary : Colors.textMuted} /> },
  ];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={udStyles.overlay}>
        <View style={udStyles.container}>
          <View style={udStyles.header}>
            <Text style={udStyles.headerTitle}>Управление пользователем</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <X size={22} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          {detailsQuery.isLoading ? (
            <View style={styles.centered}><MLoader size="large" /></View>
          ) : detailsQuery.error ? (
            <ErrorView message={detailsQuery.error.message} onRetry={() => detailsQuery.refetch()} />
          ) : user ? (
            <>
              <View style={udStyles.userHeader}>
                {user.avatar ? (
                  <Image source={{ uri: user.avatar }} style={udStyles.avatar} />
                ) : (
                  <View style={udStyles.avatarPlaceholder}>
                    <User size={28} color={Colors.primary} />
                  </View>
                )}
                <View style={udStyles.userHeaderInfo}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={udStyles.userHeaderName}>{user.name}</Text>
                    {(user as any).userNumber && (
                      <View style={userIdStyles.idBadge}>
                        <Hash size={10} color={Colors.textMuted} />
                        <Text style={userIdStyles.idText}>{(user as any).userNumber}</Text>
                      </View>
                    )}
                  </View>
                  <View style={[styles.rolePill, { backgroundColor: getRoleColor(user.role) + '25' }]}>
                    <Text style={[styles.rolePillText, { color: getRoleColor(user.role) }]}>{getRoleLabel(user.role)}</Text>
                  </View>
                  {user.isBlocked && (
                    <View style={styles.blockedRow}>
                      <AlertTriangle size={12} color={Colors.danger} />
                      <Text style={styles.blockedBadge}>ЗАБЛОКИРОВАН</Text>
                    </View>
                  )}
                </View>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={udStyles.modalTabBar}>
                {modalTabs.map((tab) => (
                  <TouchableOpacity
                    key={tab.key}
                    style={[udStyles.modalTab, activeModalTab === tab.key && udStyles.modalTabActive]}
                    onPress={() => setActiveModalTab(tab.key)}
                  >
                    {tab.icon}
                    <Text style={[udStyles.modalTabText, activeModalTab === tab.key && udStyles.modalTabTextActive]}>{tab.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <ScrollView style={udStyles.body} contentContainerStyle={{ paddingBottom: 20 }}>
                {activeModalTab === 'info' && (
                  <>
                    <Text style={udStyles.sectionLabel}>Контакты</Text>
                    {(user as any).userNumber && (
                      <InfoRow icon={<Hash size={14} color={Colors.primary} />} label="ID пользователя" value={`#${(user as any).userNumber}`} />
                    )}
                    <InfoRow icon={<Phone size={14} color={Colors.textMuted} />} label="Телефон" value={user.phone || '—'} />
                    <InfoRow icon={<Mail size={14} color={Colors.textMuted} />} label="Email" value={user.email || '—'} />
                    <InfoRow icon={<Shield size={14} color={Colors.textMuted} />} label="Email подтверждён" value={user.emailVerified ? 'Да' : 'Нет'} />
                    <InfoRow icon={<Globe size={14} color={Colors.textMuted} />} label="Регион" value={(user as any).region || '—'} />
                    <InfoRow icon={<MapPin size={14} color={Colors.textMuted} />} label="Город" value={user.city || '—'} />
                    <InfoRow icon={<Lock size={14} color={Colors.textMuted} />} label="Пароль" value={user.hasPassword ? 'Установлен' : 'Нет (OAuth)'} />
                    {user.oauthProvider && <InfoRow icon={<Shield size={14} color={Colors.textMuted} />} label="OAuth" value={user.oauthProvider} />}
                    <InfoRow icon={<Calendar size={14} color={Colors.textMuted} />} label="Регистрация" value={formatFullDate(user.createdAt)} />
                    <InfoRow icon={<Calendar size={14} color={Colors.textMuted} />} label="Обновлён" value={formatFullDate(user.updatedAt)} />

                    <Text style={[udStyles.sectionLabel, { marginTop: 16 }]}>Статистика</Text>
                    <InfoRow icon={<Star size={14} color={Colors.accent} />} label="Рейтинг" value={`${user.rating.toFixed(1)} (${user.ratingCount} отзывов)`} />
                    <InfoRow icon={<ClipboardList size={14} color={Colors.info} />} label="Заявок" value={`${user.requestsCount}`} />
                    <InfoRow icon={<Briefcase size={14} color={Colors.success} />} label="Выполнено" value={`${user.completedCount}`} />
                    <InfoRow icon={<MessageSquare size={14} color={Colors.textMuted} />} label="Чатов" value={`${user.chats.length}`} />

                    {user.about ? (
                      <>
                        <Text style={[udStyles.sectionLabel, { marginTop: 16 }]}>О себе</Text>
                        <Text style={udStyles.aboutText}>{user.about}</Text>
                      </>
                    ) : null}

                    {user.addresses.length > 0 && (
                      <>
                        <Text style={[udStyles.sectionLabel, { marginTop: 16 }]}>Адреса</Text>
                        {user.addresses.map((addr: any, i: number) => (
                          <View key={i} style={udStyles.addressCard}>
                            <MapPin size={14} color={Colors.primary} />
                            <View style={{ flex: 1, marginLeft: 8 }}>
                              <Text style={udStyles.addressLabel}>{addr.label}</Text>
                              <Text style={udStyles.addressText}>{addr.fullAddress || [addr.city, addr.street, addr.house].filter(Boolean).join(', ')}</Text>
                            </View>
                          </View>
                        ))}
                      </>
                    )}

                    {user.subscriptions.length > 0 && (
                      <>
                        <Text style={[udStyles.sectionLabel, { marginTop: 16 }]}>Подписки на услуги</Text>
                        <View style={udStyles.chipRow}>
                          {user.subscriptions.map((s: any, i: number) => (
                            <View key={i} style={udStyles.serviceChip}>
                              <Text style={udStyles.serviceChipText}>{s.name}</Text>
                            </View>
                          ))}
                        </View>
                      </>
                    )}

                    <Text style={[udStyles.sectionLabel, { marginTop: 16 }]}>Устройства ({user.devices.length})</Text>
                    {user.devices.map((d: any, i: number) => (
                      <View key={i} style={udStyles.deviceRow}>
                        <Smartphone size={14} color={d.isRevoked ? Colors.danger : Colors.success} />
                        <View style={{ flex: 1, marginLeft: 8 }}>
                          <Text style={[udStyles.deviceName, d.isRevoked && { color: Colors.textMuted }]}>{d.deviceName || 'Устройство'}</Text>
                          <Text style={udStyles.deviceMeta}>{d.platform} · {formatRelativeTime(d.createdAt)}{d.isRevoked ? ' · отозвано' : ''}</Text>
                        </View>
                      </View>
                    ))}

                    <View style={udStyles.actionsSection}>
                      <Text style={[udStyles.sectionLabel, { marginTop: 16 }]}>Действия</Text>
                      <Toggle2FAButton userId={userId} userRole={user.role} initialEnabled={!!(user as any).twoFaEnabled} onRefresh={() => { void detailsQuery.refetch(); onRefresh(); }} />
                      <ToggleDemoButton userId={userId} initialEnabled={!!(user as any).isDemo} onRefresh={() => { void detailsQuery.refetch(); onRefresh(); }} />
                      <TouchableOpacity style={udStyles.actionBtn} onPress={handleRevokeSessions} activeOpacity={0.7}>
                        <LogOut size={16} color={Colors.warning} />
                        <Text style={[udStyles.actionBtnText, { color: Colors.warning }]}>Завершить все сессии</Text>
                      </TouchableOpacity>
                      {user.isBlocked ? (
                        <TouchableOpacity style={udStyles.actionBtn} onPress={handleUnblock} activeOpacity={0.7}>
                          <ShieldOff size={16} color={Colors.success} />
                          <Text style={[udStyles.actionBtnText, { color: Colors.success }]}>Разблокировать</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity style={udStyles.actionBtn} onPress={handleBlock} activeOpacity={0.7}>
                          <Shield size={16} color={Colors.danger} />
                          <Text style={[udStyles.actionBtnText, { color: Colors.danger }]}>Заблокировать</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={[udStyles.actionBtn, udStyles.actionBtnDanger]} onPress={handleDelete} activeOpacity={0.7}>
                        <Trash2 size={16} color={Colors.danger} />
                        <Text style={[udStyles.actionBtnText, { color: Colors.danger }]}>Удалить пользователя</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                {activeModalTab === 'edit' && (
                  <>
                    <Text style={udStyles.sectionLabel}>Редактирование данных</Text>
                    <Text style={udStyles.inputLabel}>Имя</Text>
                    <TextInput {...givenNameInputProps} style={udStyles.input} value={editFirstName} onChangeText={setEditFirstName} placeholder="Имя" placeholderTextColor={Colors.textMuted} />
                    <Text style={udStyles.inputLabel}>Фамилия</Text>
                    <TextInput {...familyNameInputProps} style={udStyles.input} value={editLastName} onChangeText={setEditLastName} placeholder="Фамилия" placeholderTextColor={Colors.textMuted} />
                    <Text style={udStyles.inputLabel}>Телефон</Text>
                    <TextInput {...phoneInputProps} style={udStyles.input} value={editPhone} onChangeText={setEditPhone} placeholder="Телефон" placeholderTextColor={Colors.textMuted} />
                    <Text style={udStyles.inputLabel}>Email</Text>
                    <TextInput {...emailInputProps} style={udStyles.input} value={editEmail} onChangeText={setEditEmail} placeholder="Email" placeholderTextColor={Colors.textMuted} />
                    <Text style={udStyles.inputLabel}>Город</Text>
                    <TextInput {...addressCityInputProps} style={udStyles.input} value={editCity} onChangeText={setEditCity} placeholder="Город" placeholderTextColor={Colors.textMuted} />
                    <Text style={udStyles.inputLabel}>О себе</Text>
                    <TextInput {...plainFieldProps} style={[udStyles.input, { minHeight: 80, textAlignVertical: 'top' as const }]} value={editAbout} onChangeText={setEditAbout} placeholder="Описание" placeholderTextColor={Colors.textMuted} multiline />

                    <Text style={udStyles.inputLabel}>Роль</Text>
                    <View style={udStyles.roleSelector}>
                      {(['client', 'executor', 'admin', 'support'] as const).map((r) => (
                        <TouchableOpacity
                          key={r}
                          style={[udStyles.roleOption, editRole === r && udStyles.roleOptionActive]}
                          onPress={() => setEditRole(r)}
                        >
                          <Text style={[udStyles.roleOptionText, editRole === r && udStyles.roleOptionTextActive]}>{getRoleLabel(r)}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <TouchableOpacity
                      style={[udStyles.saveBtn, updateUserMutation.isPending && { opacity: 0.6 }]}
                      onPress={handleSaveUser}
                      disabled={updateUserMutation.isPending}
                      activeOpacity={0.8}
                    >
                      {updateUserMutation.isPending ? (
                        <MLoader size="small" color={Colors.white} />
                      ) : (
                        <Text style={udStyles.saveBtnText}>Сохранить изменения</Text>
                      )}
                    </TouchableOpacity>
                  </>
                )}

                {activeModalTab === 'password' && (
                  <>
                    <Text style={udStyles.sectionLabel}>Сброс пароля</Text>
                    <Text style={udStyles.hintText}>
                      Задайте новый пароль для пользователя. После сброса все сессии будут завершены.
                    </Text>
                    <Text style={udStyles.inputLabel}>Новый пароль</Text>
                    <TextInput
                      {...newPasswordInputProps}
                      style={udStyles.input}
                      value={newPassword}
                      onChangeText={setNewPassword}
                      placeholder="Минимум 4 символа"
                      placeholderTextColor={Colors.textMuted}
                      secureTextEntry
                    />
                    <TouchableOpacity
                      style={[udStyles.resetBtn, resetPasswordMutation.isPending && { opacity: 0.6 }]}
                      onPress={handleResetPassword}
                      disabled={resetPasswordMutation.isPending}
                      activeOpacity={0.8}
                    >
                      {resetPasswordMutation.isPending ? (
                        <MLoader size="small" color={Colors.white} />
                      ) : (
                        <>
                          <KeyRound size={16} color={Colors.white} />
                          <Text style={udStyles.resetBtnText}>Сбросить пароль</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </>
                )}

                {activeModalTab === 'activity' && (
                  <>
                    <Text style={udStyles.sectionLabel}>Заявки ({user.requests.length})</Text>
                    {user.requests.length === 0 ? (
                      <Text style={udStyles.emptyHint}>Нет заявок</Text>
                    ) : (
                      user.requests.map((r: any, i: number) => (
                        <View key={i} style={udStyles.activityCard}>
                          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(r.status) }]}>
                            <Text style={styles.statusText}>{getStatusLabel(r.status)}</Text>
                          </View>
                          <Text style={udStyles.activityCardTitle}>{r.categoryName}</Text>
                          <Text style={udStyles.activityCardMeta}>{formatRelativeTime(r.createdAt)}</Text>
                        </View>
                      ))
                    )}

                    <Text style={[udStyles.sectionLabel, { marginTop: 16 }]}>Отзывы ({user.reviews.length})</Text>
                    {user.reviews.length === 0 ? (
                      <Text style={udStyles.emptyHint}>Нет отзывов</Text>
                    ) : (
                      user.reviews.map((r: any, i: number) => (
                        <View key={i} style={udStyles.activityCard}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <Text style={{ color: Colors.accent, fontWeight: '700' as const, fontSize: 13 }}>⭐ {r.rating}</Text>
                            <Text style={{ color: Colors.textMuted, fontSize: 12 }}>{r.authorName}</Text>
                          </View>
                          {r.text ? <Text style={udStyles.activityCardMeta}>{r.text}</Text> : null}
                          <Text style={[udStyles.activityCardMeta, { marginTop: 4 }]}>{formatRelativeTime(r.createdAt)}</Text>
                        </View>
                      ))
                    )}

                    {user.portfolio.length > 0 && (
                      <>
                        <Text style={[udStyles.sectionLabel, { marginTop: 16 }]}>Портфолио ({user.portfolio.length})</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                          {user.portfolio.map((p: any, i: number) => (
                            <Image key={i} source={{ uri: p.photoUrl }} style={udStyles.portfolioThumb} />
                          ))}
                        </ScrollView>
                      </>
                    )}
                  </>
                )}
              </ScrollView>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function ToggleDemoButton({ userId, initialEnabled, onRefresh }: { userId: string; initialEnabled: boolean; onRefresh: () => void }) {
  const [isDemo, setIsDemo] = useState<boolean>(initialEnabled);
  useEffect(() => { setIsDemo(initialEnabled); }, [initialEnabled]);

  const toggleDemoMutation = trpc.admin.adminToggleDemo.useMutation({
    onSuccess: (_data, variables) => {
      setIsDemo(variables.isDemo);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Готово', variables.isDemo ? 'Демо-режим включён. 2FA будет пропускаться, доступно переключение роли.' : 'Демо-режим отключён.');
      onRefresh();
    },
    onError: (err) => Alert.alert('Ошибка', err.message),
  });

  const handleToggle = useCallback(() => {
    const newValue = !isDemo;
    Alert.alert(
      'Демо-режим',
      newValue
        ? 'Включить демо-режим для этого аккаунта? Будет пропускаться 2FA, пользователь сможет переключаться между ролями клиент/исполнитель.'
        : 'Отключить демо-режим?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: newValue ? 'Включить' : 'Отключить',
          style: newValue ? 'default' : 'destructive',
          onPress: () => toggleDemoMutation.mutate({ userId, isDemo: newValue }),
        },
      ]
    );
  }, [isDemo, userId, toggleDemoMutation]);

  const color = isDemo ? '#F59E0B' : '#8B5CF6';
  return (
    <TouchableOpacity style={udStyles.actionBtn} onPress={handleToggle} activeOpacity={0.7} disabled={toggleDemoMutation.isPending} testID="toggle-demo-btn">
      <Sparkles size={16} color={color} />
      <Text style={[udStyles.actionBtnText, { color }]}>
        {toggleDemoMutation.isPending ? 'Обработка...' : isDemo ? 'Отключить демо-режим' : 'Включить демо-режим'}
      </Text>
    </TouchableOpacity>
  );
}

function Toggle2FAButton({ userId, userRole, initialEnabled, onRefresh }: { userId: string; userRole: string; initialEnabled: boolean; onRefresh: () => void }) {
  void userRole;
  const [is2FAEnabled, setIs2FAEnabled] = useState<boolean>(initialEnabled);
  useEffect(() => { setIs2FAEnabled(initialEnabled); }, [initialEnabled]);

  const toggle2FAMutation = trpc.admin.adminToggle2FA.useMutation({
    onSuccess: (_data, variables) => {
      setIs2FAEnabled(variables.enabled);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Готово', variables.enabled ? '2FA включена для пользователя' : '2FA отключена для пользователя');
      onRefresh();
    },
    onError: (err) => Alert.alert('Ошибка', err.message),
  });

  const handleToggle = useCallback(() => {
    const newValue = !is2FAEnabled;
    Alert.alert(
      'Подтверждение',
      newValue ? 'Включить двухфакторную аутентификацию?' : 'Отключить двухфакторную аутентификацию?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: newValue ? 'Включить' : 'Отключить',
          style: newValue ? 'default' : 'destructive',
          onPress: () => toggle2FAMutation.mutate({ userId, enabled: newValue }),
        },
      ]
    );
  }, [is2FAEnabled, userId, toggle2FAMutation]);

  return (
    <TouchableOpacity style={udStyles.actionBtn} onPress={handleToggle} activeOpacity={0.7} disabled={toggle2FAMutation.isPending}>
      {is2FAEnabled ? (
        <ShieldOff size={16} color="#F59E0B" />
      ) : (
        <Shield size={16} color="#22C55E" />
      )}
      <Text style={[udStyles.actionBtnText, { color: is2FAEnabled ? '#F59E0B' : '#22C55E' }]}>
        {toggle2FAMutation.isPending ? 'Обработка...' : is2FAEnabled ? 'Отключить 2FA' : 'Включить 2FA'}
      </Text>
    </TouchableOpacity>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={udStyles.infoRow}>
      {icon}
      <Text style={udStyles.infoLabel}>{label}</Text>
      <Text style={udStyles.infoValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function RequestsSection() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');

  const requestsQuery = trpc.admin.allRequests.useQuery(
    { search: search || undefined },
    { retry: 1, staleTime: 60_000, gcTime: 300000 }
  );

  const { refreshControl: requestsRefreshControl } = useMRefreshControl(requestsQuery.isRefetching, () => requestsQuery.refetch());

  const filteredRequests = useMemo(() => {
    const all = requestsQuery.data || [];
    if (!statusFilter) return all;
    return all.filter(r => r.status === statusFilter);
  }, [requestsQuery.data, statusFilter]);

  const statusFilters = [
    { key: undefined, label: 'Все' },
    { key: 'new', label: 'Новые' },
    { key: 'in_progress', label: 'В работе' },
    { key: 'completed', label: 'Выполнены' },
    { key: 'cancelled', label: 'Отменены' },
  ];

  const handleRequestPress = useCallback((requestId: string) => {
    void Haptics.selectionAsync();
    router.push({ pathname: '/request-details', params: { id: requestId, adminMode: 'true' } });
  }, [router]);

  return (
    <View style={styles.section}>
      <View style={styles.searchRow}>
        <Search size={18} color={Colors.textMuted} />
        <TextInput
          {...searchInputProps}
          style={styles.searchInput}
          placeholder="Поиск по описанию, категории..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        {statusFilters.map((f) => (
          <TouchableOpacity
            key={f.key ?? 'all'}
            style={[styles.filterChip, statusFilter === f.key && styles.filterChipActive]}
            onPress={() => setStatusFilter(f.key)}
          >
            <Text style={[styles.filterChipText, statusFilter === f.key && styles.filterChipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {requestsQuery.isLoading ? (
        <LoadingView />
      ) : requestsQuery.error ? (
        <ErrorView message={requestsQuery.error.message} onRetry={() => requestsQuery.refetch()} />
      ) : (
        <FlatList
          data={filteredRequests}
          keyExtractor={(item) => item.id}
          style={styles.list}
          refreshControl={requestsRefreshControl}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.requestCard}
              onPress={() => handleRequestPress(item.id)}
              activeOpacity={0.7}
            >
              <View style={styles.requestHeader}>
                <Text style={styles.requestCategory} numberOfLines={1}>{item.categoryName}</Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
                  <Text style={styles.statusText}>{getStatusLabel(item.status)}</Text>
                </View>
              </View>
              <Text style={styles.requestDesc} numberOfLines={2}>{item.description || 'Без описания'}</Text>
              {item.acceptablePrice && <Text style={styles.requestPrice}>💰 {item.acceptablePrice}</Text>}
              <Text style={styles.requestMeta}>Клиент: {item.clientName || '—'}</Text>
              {item.executorName && <Text style={styles.requestMeta}>Исполнитель: {item.executorName}</Text>}
              {item.address && <Text style={styles.requestMeta} numberOfLines={1}>📍 {item.address}</Text>}
              <View style={styles.requestFooter}>
                <Text style={styles.requestTime}>{formatRelativeTime(item.createdAt)}</Text>
                <ChevronRight size={16} color={Colors.textMuted} />
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>Заявки не найдены</Text>}
        />
      )}
    </View>
  );
}

type SearchField = 'all' | 'id' | 'phone' | 'lastName';

interface BroadcastUser {
  id: string;
  userNumber: number | null;
  name: string;
  phone: string;
  email: string | null;
  role: string;
}

function BroadcastSection() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [target, setTarget] = useState<'all' | 'client' | 'executor' | 'personal'>('all');
  const [userSearch, setUserSearch] = useState<string>('');
  const [searchField, setSearchField] = useState<SearchField>('all');
  const [selectedUsers, setSelectedUsers] = useState<BroadcastUser[]>([]);

  const usersQuery = trpc.admin.users.useQuery(
    { search: userSearch.trim() || undefined, limit: 50 },
    { enabled: target === 'personal' && userSearch.trim().length >= 1, staleTime: 30_000 }
  );

  const filteredSearchUsers = useMemo<BroadcastUser[]>(() => {
    const all = (usersQuery.data || []) as unknown as BroadcastUser[];
    const q = userSearch.trim().toLowerCase();
    if (!q) return [];
    if (searchField === 'all') return all;
    return all.filter((u) => {
      if (searchField === 'id') {
        const num = u.userNumber ? String(u.userNumber) : '';
        return num.includes(q) || u.id.toLowerCase().includes(q);
      }
      if (searchField === 'phone') {
        return (u.phone || '').toLowerCase().includes(q);
      }
      if (searchField === 'lastName') {
        const lastName = u.name.split(' ')[0] || '';
        return lastName.toLowerCase().includes(q);
      }
      return true;
    });
  }, [usersQuery.data, userSearch, searchField]);

  const toggleUser = useCallback((u: BroadcastUser) => {
    void Haptics.selectionAsync();
    setSelectedUsers((prev) => {
      if (prev.find((p) => p.id === u.id)) {
        return prev.filter((p) => p.id !== u.id);
      }
      return [...prev, u];
    });
  }, []);

  const broadcastMutation = trpc.admin.sendBroadcast.useMutation({
    onSuccess: (data) => {
      Alert.alert('Отправлено', `Рассылка отправлена ${data.sent} пользователям`);
      setTitle('');
      setBody('');
      setSelectedUsers([]);
      setUserSearch('');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err) => {
      console.error('[Admin] Broadcast error:', err);
      Alert.alert('Ошибка', err.message || 'Не удалось отправить рассылку');
    },
  });

  const handleSend = useCallback(() => {
    if (!title.trim() || !body.trim()) {
      Alert.alert('Ошибка', 'Заполните заголовок и текст');
      return;
    }
    if (target === 'personal' && selectedUsers.length === 0) {
      Alert.alert('Ошибка', 'Выберите хотя бы одного пользователя');
      return;
    }
    const recipientsLabel = target === 'personal'
      ? `${selectedUsers.length} выбранным пользователям`
      : target === 'all' ? 'всем' : target === 'client' ? 'клиентам' : 'исполнителям';
    Alert.alert('Подтверждение', `Отправить рассылку "${title}" ${recipientsLabel}?`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Отправить',
        onPress: () => {
          if (target === 'personal') {
            broadcastMutation.mutate({
              title: title.trim(),
              body: body.trim(),
              userIds: selectedUsers.map((u) => u.id),
            });
          } else {
            broadcastMutation.mutate({ title: title.trim(), body: body.trim(), targetRole: target });
          }
        },
      },
    ]);
  }, [title, body, target, broadcastMutation, selectedUsers]);

  return (
    <ScrollView style={styles.section} contentContainerStyle={styles.sectionContent}>
      <Text style={styles.sectionTitle}>Пуш-рассылка</Text>
      <Text style={styles.sectionSubtitle}>Сообщение придёт в уведомления выбранным пользователям</Text>

      <Text style={styles.inputLabel}>Получатели</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44, marginBottom: 4 }}>
        <View style={[styles.targetRow, { paddingRight: 16 }]}>
          {[
            { key: 'all' as const, label: 'Все' },
            { key: 'client' as const, label: 'Клиенты' },
            { key: 'executor' as const, label: 'Исполнители' },
            { key: 'personal' as const, label: 'Персонально' },
          ].map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[styles.filterChip, target === t.key && styles.filterChipActive]}
              onPress={() => setTarget(t.key)}
            >
              <Text style={[styles.filterChipText, target === t.key && styles.filterChipTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {target === 'personal' && (
        <View style={personalStyles.container}>
          <View style={[styles.searchRow, { marginTop: 8, marginBottom: 8 }]}>
            <Search size={18} color={Colors.textMuted} />
            <TextInput
              {...searchInputProps}
              style={styles.searchInput}
              placeholder="Поиск..."
              placeholderTextColor={Colors.textMuted}
              value={userSearch}
              onChangeText={setUserSearch}
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 40, marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {[
                { key: 'all' as SearchField, label: 'Все' },
                { key: 'id' as SearchField, label: 'ID' },
                { key: 'phone' as SearchField, label: 'Телефон' },
                { key: 'lastName' as SearchField, label: 'Фамилия' },
              ].map((f) => (
                <TouchableOpacity
                  key={f.key}
                  style={[personalStyles.fieldChip, searchField === f.key && personalStyles.fieldChipActive]}
                  onPress={() => setSearchField(f.key)}
                >
                  <Text style={[personalStyles.fieldChipText, searchField === f.key && personalStyles.fieldChipTextActive]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {selectedUsers.length > 0 && (
            <View style={personalStyles.selectedWrap}>
              <Text style={personalStyles.selectedLabel}>Выбрано: {selectedUsers.length}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {selectedUsers.map((u) => (
                    <TouchableOpacity
                      key={u.id}
                      style={personalStyles.selectedChip}
                      onPress={() => toggleUser(u)}
                    >
                      <Text style={personalStyles.selectedChipText} numberOfLines={1}>{u.name}</Text>
                      <X size={12} color={Colors.primary} />
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}

          {userSearch.trim().length >= 1 && (
            <View style={personalStyles.resultsWrap}>
              {usersQuery.isLoading ? (
                <View style={{ padding: 12, alignItems: 'center' }}>
                  <MLoader size="small" color={Colors.primary} />
                </View>
              ) : filteredSearchUsers.length === 0 ? (
                <Text style={personalStyles.emptyText}>Ничего не найдено</Text>
              ) : (
                filteredSearchUsers.slice(0, 20).map((u) => {
                  const isSelected = !!selectedUsers.find((s) => s.id === u.id);
                  return (
                    <TouchableOpacity
                      key={u.id}
                      style={[personalStyles.resultItem, isSelected && personalStyles.resultItemSelected]}
                      onPress={() => toggleUser(u)}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={personalStyles.resultName} numberOfLines={1}>{u.name}</Text>
                          {u.userNumber != null && (
                            <View style={userIdStyles.idBadge}>
                              <Hash size={9} color={Colors.textMuted} />
                              <Text style={userIdStyles.idText}>{u.userNumber}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={personalStyles.resultMeta} numberOfLines={1}>{u.phone}{u.email ? ` · ${u.email}` : ''}</Text>
                      </View>
                      <View style={[personalStyles.checkbox, isSelected && personalStyles.checkboxActive]}>
                        {isSelected && <Text style={{ color: Colors.white, fontSize: 12, fontWeight: '700' as const }}>✓</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          )}
        </View>
      )}

      <Text style={styles.inputLabel}>Заголовок</Text>
      <TextInput
        {...plainFieldProps}
        style={styles.textInput}
        value={title}
        onChangeText={setTitle}
        placeholder="Заголовок рассылки..."
        placeholderTextColor={Colors.textMuted}
      />

      <Text style={styles.inputLabel}>Текст</Text>
      <TextInput
        {...plainFieldProps}
        style={[styles.textInput, styles.textArea]}
        value={body}
        onChangeText={setBody}
        placeholder="Текст сообщения..."
        placeholderTextColor={Colors.textMuted}
        multiline
        numberOfLines={4}
      />

      <TouchableOpacity
        style={[styles.sendBtn, broadcastMutation.isPending && styles.sendBtnDisabled]}
        onPress={handleSend}
        disabled={broadcastMutation.isPending}
        activeOpacity={0.8}
      >
        {broadcastMutation.isPending ? (
          <MLoader size="small" color={Colors.white} />
        ) : (
          <>
            <Send size={18} color={Colors.white} />
            <Text style={styles.sendBtnText}>Отправить рассылку</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

interface AuditLogItem {
  id: string;
  adminId: string;
  adminName: string;
  action: string;
  targetType: string;
  targetId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

function AuditSection() {
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

  const auditQuery = trpc.admin.auditLog.useQuery(
    { limit: 200 },
    { retry: 1, staleTime: 15000 }
  );

  const { refreshControl: auditRefreshControl } = useMRefreshControl(auditQuery.isRefetching, () => auditQuery.refetch());

  if (auditQuery.isLoading) return <LoadingView />;
  if (auditQuery.error) return <ErrorView message={auditQuery.error.message} onRetry={() => auditQuery.refetch()} />;

  const logs = (auditQuery.data || []) as AuditLogItem[];

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Журнал действий</Text>
      <Text style={styles.sectionSubtitle}>Все административные действия</Text>
      <FlatList
        data={logs}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={auditRefreshControl}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.auditCard}
            onPress={() => {
              void Haptics.selectionAsync();
              setSelectedLog(item);
            }}
            activeOpacity={0.7}
          >
            <View style={styles.auditHeader}>
              <View style={[styles.auditActionBadge, { backgroundColor: getAuditActionColor(item.action) + '25' }]}>
                <Text style={[styles.auditActionText, { color: getAuditActionColor(item.action) }]}>{getAuditActionLabel(item.action)}</Text>
              </View>
              <View style={styles.auditTimeRow}>
                <Clock size={12} color={Colors.textMuted} />
                <Text style={styles.auditTime}>{formatRelativeTime(item.createdAt)}</Text>
              </View>
            </View>
            <Text style={styles.auditAdmin}>{item.adminName}</Text>
            {item.details && Object.keys(item.details).length > 0 && (
              <Text style={styles.auditDetails} numberOfLines={2}>
                {formatAuditDetails(item.action, item.details)}
              </Text>
            )}
            <View style={styles.auditOpenHint}>
              <Text style={styles.auditOpenHintText}>Подробнее</Text>
              <ChevronRight size={14} color={Colors.textMuted} />
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <FileText size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>Журнал пуст</Text>
          </View>
        }
      />

      <Modal visible={selectedLog !== null} transparent animationType="fade" onRequestClose={() => setSelectedLog(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSelectedLog(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
            {selectedLog && (
              <>
                <View style={styles.modalHeader}>
                  <View style={[styles.auditActionBadge, { backgroundColor: getAuditActionColor(selectedLog.action) + '25' }]}>
                    <Text style={[styles.auditActionText, { color: getAuditActionColor(selectedLog.action) }]}>{getAuditActionLabel(selectedLog.action)}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedLog(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <X size={20} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>

                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Администратор</Text>
                  <Text style={styles.modalValue}>{selectedLog.adminName}</Text>
                </View>

                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Время</Text>
                  <Text style={styles.modalValue}>{formatFullDate(selectedLog.createdAt)}</Text>
                </View>

                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Тип объекта</Text>
                  <Text style={styles.modalValue}>{selectedLog.targetType}</Text>
                </View>

                {selectedLog.targetId && (
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>ID объекта</Text>
                    <Text style={[styles.modalValue, styles.modalMono]}>{selectedLog.targetId}</Text>
                  </View>
                )}

                {selectedLog.details && Object.keys(selectedLog.details).length > 0 && (
                  <>
                    <View style={styles.modalDivider} />
                    <Text style={styles.modalSectionTitle}>Детали</Text>
                    {Object.entries(selectedLog.details).map(([key, value]) => (
                      <View key={key} style={styles.modalRow}>
                        <Text style={styles.modalLabel}>{getDetailLabel(key)}</Text>
                        <Text style={styles.modalValue}>{value != null && typeof value === 'object' ? JSON.stringify(value) : (value != null ? `${value as string | number | boolean}` : '—')}</Text>
                      </View>
                    ))}
                  </>
                )}
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function LoadingView() {
  return (
    <View style={styles.centered}>
      <MLoader size="large" />
      <Text style={styles.loadingText}>Загрузка...</Text>
    </View>
  );
}

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.centered}>
      <AlertTriangle size={40} color={Colors.danger} />
      <Text style={styles.errorText}>{message}</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={onRetry} activeOpacity={0.8}>
        <Text style={styles.retryBtnText}>Повторить</Text>
      </TouchableOpacity>
    </View>
  );
}

function getRoleLabel(role: string): string {
  const labels: Record<string, string> = { client: 'Клиент', executor: 'Исполнитель', admin: 'Админ', support: 'Поддержка' };
  return labels[role] || role;
}

function getRoleColor(role: string): string {
  const colors: Record<string, string> = { client: Colors.info, executor: Colors.accent, admin: '#A78BFA', support: '#34D399' };
  return colors[role] || Colors.textMuted;
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = { new: 'Новая', in_progress: 'В работе', completed: 'Выполнена', cancelled: 'Отменена' };
  return labels[status] || status;
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = { new: Colors.info + '40', in_progress: Colors.accent + '40', completed: Colors.success + '40', cancelled: Colors.danger + '40' };
  return colors[status] || Colors.border;
}

function getAuditActionLabel(action: string): string {
  const labels: Record<string, string> = {
    block_user: 'Блокировка', unblock_user: 'Разблокировка', delete_user: 'Удаление',
    set_role: 'Смена роли', update_request_status: 'Статус заявки', send_broadcast: 'Рассылка',
    reset_password: 'Сброс пароля', update_user: 'Изменение данных', revoke_sessions: 'Завершение сессий',
  };
  return labels[action] || action;
}

function getAuditActionColor(action: string): string {
  const colors: Record<string, string> = {
    block_user: Colors.warning, unblock_user: Colors.success, delete_user: Colors.danger,
    set_role: Colors.info, update_request_status: Colors.accent, send_broadcast: Colors.primary,
    reset_password: '#A78BFA', update_user: Colors.info, revoke_sessions: Colors.warning,
  };
  return colors[action] || Colors.textMuted;
}

function getDetailLabel(key: string): string {
  const labels: Record<string, string> = {
    targetName: 'Пользователь', targetPhone: 'Телефон', targetRole: 'Роль',
    oldRole: 'Старая роль', newRole: 'Новая роль', oldStatus: 'Старый статус',
    newStatus: 'Новый статус', categoryName: 'Категория', title: 'Заголовок',
    recipientCount: 'Получателей', changes: 'Изменения',
    oldFirstName: 'Старое имя', oldLastName: 'Старая фамилия',
    oldPhone: 'Старый телефон', oldEmail: 'Старый email',
  };
  return labels[key] || key;
}

function formatAuditDetails(action: string, details: Record<string, unknown>): string {
  const s = (v: unknown): string => {
    if (v == null) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return `${v as string | number | boolean}`;
  };
  if (action === 'set_role' && details.targetName) return `${s(details.targetName)}: ${s(details.oldRole)} → ${s(details.newRole)}`;
  if (action === 'block_user' && details.targetName) return `Пользователь: ${s(details.targetName)}`;
  if (action === 'delete_user' && details.targetName) return `${s(details.targetName)} (${s(details.targetPhone)}, ${s(details.targetRole)})`;
  if (action === 'send_broadcast') return `"${s(details.title)}" — ${s(details.recipientCount)} получателей`;
  if (action === 'update_request_status') return `${s(details.categoryName)}: ${s(details.oldStatus)} → ${s(details.newStatus)}`;
  if (action === 'reset_password') return `Пароль сброшен: ${s(details.targetName)}`;
  if (action === 'update_user') return `Данные изменены: ${s(details.targetName)}`;
  if (action === 'revoke_sessions') return `Сессии завершены`;
  return JSON.stringify(details);
}

function formatRelativeTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'сейчас';
    if (diffMin < 60) return `${diffMin}м`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}ч`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}д`;
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  } catch { return ''; }
}

function formatFullDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return dateStr; }
}

const udStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  container: { backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%', borderWidth: 1.5, borderColor: METALLIC_BORDER_COLOR_STRONG },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700' as const, color: Colors.text },
  userHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12, gap: 14 },
  avatar: { width: 56, height: 56, borderRadius: 28, borderWidth: 1.5, borderColor: METALLIC_BORDER_COLOR_STRONG },
  avatarPlaceholder: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.primary + '15', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: METALLIC_BORDER_COLOR_STRONG },
  userHeaderInfo: { flex: 1, gap: 4 },
  userHeaderName: { fontSize: 17, fontWeight: '700' as const, color: Colors.text },
  modalTabBar: { maxHeight: 44, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingHorizontal: 12 },
  modalTab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 10, marginRight: 4, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  modalTabActive: { borderBottomColor: Colors.primary },
  modalTabText: { fontSize: 12, color: Colors.textMuted, fontWeight: '500' as const },
  modalTabTextActive: { color: Colors.primary, fontWeight: '700' as const },
  body: { paddingHorizontal: 20, paddingTop: 16 },
  sectionLabel: { fontSize: 15, fontWeight: '700' as const, color: Colors.text, marginBottom: 10 },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, gap: 8 },
  infoLabel: { fontSize: 13, color: Colors.textMuted, width: 120 },
  infoValue: { flex: 1, fontSize: 13, color: Colors.text, fontWeight: '500' as const, textAlign: 'right' as const },
  aboutText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },
  addressCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: Colors.backgroundSecondary, borderRadius: 10, padding: 10, marginBottom: 6 },
  addressLabel: { fontSize: 12, fontWeight: '600' as const, color: Colors.text },
  addressText: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  serviceChip: { backgroundColor: Colors.primary + '20', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  serviceChipText: { fontSize: 12, color: Colors.primary, fontWeight: '500' as const },
  deviceRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  deviceName: { fontSize: 13, color: Colors.text, fontWeight: '500' as const },
  deviceMeta: { fontSize: 11, color: Colors.textMuted },
  actionsSection: { marginTop: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: Colors.backgroundSecondary, borderRadius: 12, marginBottom: 8 },
  actionBtnDanger: { borderWidth: 1, borderColor: Colors.danger + '30' },
  actionBtnText: { fontSize: 14, fontWeight: '600' as const },
  inputLabel: { fontSize: 12, fontWeight: '600' as const, color: Colors.textMuted, marginBottom: 4, marginTop: 12 },
  input: { backgroundColor: Colors.backgroundSecondary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: Colors.text, fontSize: 14, borderWidth: 1.5, borderColor: METALLIC_BORDER_COLOR },
  roleSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  roleOption: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.backgroundSecondary, borderWidth: 1.5, borderColor: METALLIC_BORDER_COLOR },
  roleOptionActive: { backgroundColor: Colors.primary + '25', borderColor: METALLIC_BORDER_COLOR_STRONG },
  roleOptionText: { fontSize: 13, color: Colors.textMuted, fontWeight: '500' as const },
  roleOptionTextActive: { color: Colors.primary, fontWeight: '600' as const },
  saveBtn: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: Colors.white, fontSize: 15, fontWeight: '700' as const },
  hintText: { fontSize: 13, color: Colors.textMuted, lineHeight: 18, marginBottom: 12 },
  resetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#A78BFA', borderRadius: 14, paddingVertical: 14, marginTop: 20 },
  resetBtnText: { color: Colors.white, fontSize: 15, fontWeight: '700' as const },
  emptyHint: { fontSize: 13, color: Colors.textMuted, fontStyle: 'italic' as const },
  activityCard: { backgroundColor: Colors.backgroundSecondary, borderRadius: 10, padding: 10, marginBottom: 6 },
  activityCardTitle: { fontSize: 13, color: Colors.text, fontWeight: '500' as const, marginTop: 4 },
  activityCardMeta: { fontSize: 12, color: Colors.textMuted },
  portfolioThumb: { width: 80, height: 80, borderRadius: 10, marginRight: 8 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  tabBar: { maxHeight: 52, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.card },
  tabBarContent: { paddingHorizontal: 8, alignItems: 'center', gap: 2 },
  tabItem: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabItemActive: { borderBottomColor: Colors.primary },
  tabLabel: { fontSize: 12, color: Colors.textMuted, fontWeight: '500' as const },
  tabLabelActive: { color: Colors.primary, fontWeight: '700' as const },
  content: { flex: 1 },
  section: { flex: 1, padding: 16 },
  sectionContent: { paddingBottom: 100 },
  sectionTitle: { fontSize: 20, fontWeight: '700' as const, color: Colors.text, marginBottom: 4 },
  sectionSubtitle: { fontSize: 13, color: Colors.textMuted, marginBottom: 16 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  statCard: { backgroundColor: Colors.card, borderRadius: 14, padding: 14, width: '31%' as any, borderWidth: 1.5, borderColor: METALLIC_BORDER_COLOR, alignItems: 'center' },
  statEmoji: { fontSize: 20, marginBottom: 4 },
  statValue: { fontSize: 24, fontWeight: '800' as const },
  statLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 4, textAlign: 'center' as const },
  extraStats: { backgroundColor: Colors.card, borderRadius: 16, padding: 16, marginTop: 20, borderWidth: 1.5, borderColor: METALLIC_BORDER_COLOR_STRONG },
  extraStatRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  extraStatLabel: { fontSize: 14, color: Colors.textSecondary },
  extraStatValue: { fontSize: 16, fontWeight: '700' as const, color: Colors.text },
  extraStatDivider: { height: 1, backgroundColor: Colors.border },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: 12, paddingHorizontal: 12, borderWidth: 1.5, borderColor: METALLIC_BORDER_COLOR, marginBottom: 12 },
  searchInput: { flex: 1, color: Colors.text, paddingVertical: 12, paddingHorizontal: 8, fontSize: 14 },
  filterRow: { maxHeight: 44, marginBottom: 12 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.card, borderWidth: 1.5, borderColor: METALLIC_BORDER_COLOR, marginRight: 8 },
  filterChipActive: { backgroundColor: Colors.primary + '30', borderColor: METALLIC_BORDER_COLOR_STRONG },
  filterChipText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' as const },
  filterChipTextActive: { color: Colors.primary, fontWeight: '600' as const },
  list: { flex: 1 },
  userCard: { flexDirection: 'row', backgroundColor: Colors.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1.5, borderColor: METALLIC_BORDER_COLOR, alignItems: 'center' },
  userCardBlocked: { borderColor: Colors.danger + '60', backgroundColor: Colors.dangerLight },
  userAvatarWrap: { marginRight: 12 },
  userAvatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: METALLIC_BORDER_COLOR_STRONG },
  userAvatarPlaceholder: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primary + '15', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: METALLIC_BORDER_COLOR_STRONG },
  userInfo: { flex: 1 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  userName: { fontSize: 15, fontWeight: '600' as const, color: Colors.text, flex: 1 },
  rolePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  rolePillText: { fontSize: 10, fontWeight: '700' as const },
  userMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  userStatsRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  userStatChip: { fontSize: 11, color: Colors.textSecondary },
  blockedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  blockedBadge: { fontSize: 10, fontWeight: '700' as const, color: Colors.danger },
  requestCard: { backgroundColor: Colors.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1.5, borderColor: METALLIC_BORDER_COLOR },
  requestHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  requestCategory: { fontSize: 15, fontWeight: '600' as const, color: Colors.text, flex: 1 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginLeft: 8 },
  statusText: { fontSize: 11, fontWeight: '600' as const, color: Colors.text },
  requestDesc: { fontSize: 13, color: Colors.textSecondary, marginBottom: 6 },
  requestPrice: { fontSize: 13, color: Colors.accent, fontWeight: '600' as const, marginBottom: 4 },
  requestMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  requestFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  requestTime: { fontSize: 11, color: Colors.textMuted },
  inputLabel: { fontSize: 13, fontWeight: '600' as const, color: Colors.textSecondary, marginBottom: 6, marginTop: 14 },
  targetRow: { flexDirection: 'row', gap: 8 },
  textInput: { backgroundColor: Colors.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: Colors.text, fontSize: 14, borderWidth: 1.5, borderColor: METALLIC_BORDER_COLOR },
  textArea: { minHeight: 100, textAlignVertical: 'top' as const },
  sendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, marginTop: 24 },
  sendBtnDisabled: { opacity: 0.6 },
  sendBtnText: { fontSize: 15, fontWeight: '700' as const, color: Colors.white },
  auditCard: { backgroundColor: Colors.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1.5, borderColor: METALLIC_BORDER_COLOR },
  auditHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  auditActionBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  auditActionText: { fontSize: 11, fontWeight: '700' as const },
  auditTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  auditTime: { fontSize: 11, color: Colors.textMuted },
  auditAdmin: { fontSize: 14, fontWeight: '600' as const, color: Colors.text, marginBottom: 2 },
  auditDetails: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  auditOpenHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 8 },
  auditOpenHintText: { fontSize: 12, color: Colors.textMuted },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  loadingText: { color: Colors.textMuted, marginTop: 10 },
  errorText: { color: Colors.danger, textAlign: 'center' as const, marginBottom: 12, marginTop: 12, fontSize: 14 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: Colors.primary, borderRadius: 12 },
  retryBtnText: { color: Colors.white, fontWeight: '600' as const },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { color: Colors.textMuted, textAlign: 'center' as const, marginTop: 12, fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { backgroundColor: Colors.card, borderRadius: 20, padding: 24, width: '100%', maxWidth: 400, borderWidth: 1.5, borderColor: METALLIC_BORDER_COLOR_STRONG },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 8 },
  modalLabel: { fontSize: 13, color: Colors.textMuted, flex: 1 },
  modalValue: { fontSize: 13, color: Colors.text, fontWeight: '600' as const, flex: 2, textAlign: 'right' as const },
  modalMono: { fontFamily: 'monospace' as any, fontSize: 11 },
  modalDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 12 },
  modalSectionTitle: { fontSize: 15, fontWeight: '700' as const, color: Colors.text, marginBottom: 8 },
});
