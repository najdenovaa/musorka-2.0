import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { useMRefreshControl } from '@/components/MRefreshControl';
import {
  Calendar,
  TrendingUp,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Clock,
  Briefcase,
  BarChart3,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Colors from '@/constants/colors';
import MLoader from '@/components/MLoader';
import FloatingHeader, { useFloatingHeaderHeight } from '@/components/FloatingHeader';
import { trpc } from '@/lib/trpc';

type TabKey = 'current' | 'monthly' | 'yearly';

const MONTH_NAMES: Record<string, string> = {
  '01': 'Январь',
  '02': 'Февраль',
  '03': 'Март',
  '04': 'Апрель',
  '05': 'Май',
  '06': 'Июнь',
  '07': 'Июль',
  '08': 'Август',
  '09': 'Сентябрь',
  '10': 'Октябрь',
  '11': 'Ноябрь',
  '12': 'Декабрь',
};

function formatPrice(value: number): string {
  if (value >= 1000) {
    return value.toLocaleString('ru-RU') + ' ₽';
  }
  return value + ' ₽';
}

function formatDay(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const day = d.getDate();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day} ${MONTH_NAMES[month]?.slice(0, 3) ?? month}`;
  } catch {
    return dateStr;
  }
}

function formatFullDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const day = d.getDate();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day} ${MONTH_NAMES[month] ?? month} ${year}, ${hours}:${mins}`;
  } catch {
    return dateStr;
  }
}

function formatMonthLabel(monthStr: string): string {
  const [year, month] = monthStr.split('-');
  return `${MONTH_NAMES[month ?? ''] ?? month} ${year}`;
}

interface DaySummary {
  day: string;
  count: number;
  total: number;
}

interface MonthSummary {
  month: string;
  count: number;
  total: number;
}

interface YearSummary {
  year: string;
  count: number;
  total: number;
}

interface RecentRequest {
  id: string;
  categoryName: string;
  completedAt: string;
  address: string;
  price: number;
}

export default function ExecutorSummaryScreen() {
  const floatingHeaderHeight = useFloatingHeaderHeight();
  const [activeTab, setActiveTab] = useState<TabKey>('current');
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const summaryQuery = trpc.requests.executorSummary.useQuery(undefined, {
    staleTime: 30_000,
    gcTime: 120_000,
  });

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [fadeAnim]);

  const { refreshControl: summaryRefreshControl } = useMRefreshControl(summaryQuery.isRefetching, () => { void summaryQuery.refetch(); });

  const data = summaryQuery.data as {
    daily: DaySummary[];
    monthly: MonthSummary[];
    yearly: YearSummary[];
    recent: RecentRequest[];
  } | undefined;

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const currentYearKey = String(now.getFullYear());

  const currentMonthData = useMemo(() => {
    if (!data) return null;
    return data.monthly.find((m) => m.month === currentMonthKey) ?? { month: currentMonthKey, count: 0, total: 0 };
  }, [data, currentMonthKey]);

  const currentMonthDays = useMemo(() => {
    if (!data) return [];
    return data.daily.filter((d) => d.day.startsWith(currentMonthKey));
  }, [data, currentMonthKey]);

  const currentYearData = useMemo(() => {
    if (!data) return null;
    return data.yearly.find((y) => y.year === currentYearKey) ?? { year: currentYearKey, count: 0, total: 0 };
  }, [data, currentYearKey]);

  const totalAllTime = useMemo(() => {
    if (!data) return { count: 0, total: 0 };
    return data.yearly.reduce((acc, y) => ({ count: acc.count + y.count, total: acc.total + y.total }), { count: 0, total: 0 });
  }, [data]);

  const monthDaysMap = useMemo(() => {
    if (!data) return new Map<string, DaySummary[]>();
    const map = new Map<string, DaySummary[]>();
    for (const d of data.daily) {
      const key = d.day.substring(0, 7);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return map;
  }, [data]);

  const toggleMonth = useCallback((month: string) => {
    setExpandedMonth((prev) => (prev === month ? null : month));
  }, []);

  if (summaryQuery.isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: 'Сводные данные' }} />
        <MLoader size="large" />
        <Text style={styles.loadingText}>Загрузка данных...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
    <FloatingHeader showBack title="Сводные данные" />
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: floatingHeaderHeight }]}
      showsVerticalScrollIndicator={false}
      refreshControl={summaryRefreshControl}
    >

      <Animated.View style={{ opacity: fadeAnim }}>
        <LinearGradient
          colors={['#052E1C', '#0A5537', '#0D7A4B']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroDecor1} />
          <View style={styles.heroDecor2} />

          <View style={styles.heroRow}>
            <View style={styles.heroStatBlock}>
              <View style={styles.heroIconWrap}>
                <DollarSign size={18} color="#4ADE80" />
              </View>
              <Text style={styles.heroStatValue}>{formatPrice(currentMonthData?.total ?? 0)}</Text>
              <Text style={styles.heroStatLabel}>Этот месяц</Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroStatBlock}>
              <View style={styles.heroIconWrap}>
                <TrendingUp size={18} color="#38BDF8" />
              </View>
              <Text style={styles.heroStatValue}>{formatPrice(currentYearData?.total ?? 0)}</Text>
              <Text style={styles.heroStatLabel}>Этот год</Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroStatBlock}>
              <View style={styles.heroIconWrap}>
                <BarChart3 size={18} color="#FBBF24" />
              </View>
              <Text style={styles.heroStatValue}>{formatPrice(totalAllTime.total)}</Text>
              <Text style={styles.heroStatLabel}>Всё время</Text>
            </View>
          </View>

          <View style={styles.heroOrdersRow}>
            <Briefcase size={14} color="rgba(255,255,255,0.5)" />
            <Text style={styles.heroOrdersText}>
              Заявок: {currentMonthData?.count ?? 0} за месяц · {totalAllTime.count} всего
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.tabsContainer}>
          {(['current', 'monthly', 'yearly'] as TabKey[]).map((tab) => {
            const isActive = activeTab === tab;
            const labels: Record<TabKey, string> = {
              current: 'Текущий месяц',
              monthly: 'По месяцам',
              yearly: 'По годам',
            };
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => setActiveTab(tab)}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{labels[tab]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {activeTab === 'current' && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Calendar size={16} color={Colors.primary} />
              <Text style={styles.sectionTitle}>{formatMonthLabel(currentMonthKey)}</Text>
            </View>

            {currentMonthDays.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>Нет выполненных заявок в этом месяце</Text>
              </View>
            ) : (
              currentMonthDays.map((day) => (
                <View key={day.day} style={styles.dayRow}>
                  <View style={styles.dayDateWrap}>
                    <View style={styles.dayDot} />
                    <Text style={styles.dayDate}>{formatDay(day.day)}</Text>
                  </View>
                  <View style={styles.dayStats}>
                    <Text style={styles.dayCount}>{day.count} заявок</Text>
                    <Text style={styles.dayTotal}>{formatPrice(day.total)}</Text>
                  </View>
                </View>
              ))
            )}

            {data && data.recent.length > 0 && (
              <View style={styles.recentSection}>
                <Text style={styles.recentTitle}>Последние заявки</Text>
                {data.recent.slice(0, 10).map((req) => (
                  <View key={req.id} style={styles.recentItem}>
                    <View style={styles.recentLeft}>
                      <Text style={styles.recentCategory}>{req.categoryName}</Text>
                      <View style={styles.recentMeta}>
                        <Clock size={11} color={Colors.textMuted} />
                        <Text style={styles.recentDate}>{formatFullDate(req.completedAt)}</Text>
                      </View>
                    </View>
                    <Text style={styles.recentPrice}>{req.price > 0 ? formatPrice(req.price) : '—'}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {activeTab === 'monthly' && (
          <View style={styles.section}>
            {(!data || data.monthly.length === 0) ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>Нет данных</Text>
              </View>
            ) : (
              data.monthly.map((m) => {
                const isExpanded = expandedMonth === m.month;
                const days = monthDaysMap.get(m.month) ?? [];
                const isCurrent = m.month === currentMonthKey;

                return (
                  <View key={m.month} style={[styles.monthCard, isCurrent && styles.monthCardCurrent]}>
                    <TouchableOpacity
                      style={styles.monthHeader}
                      onPress={() => toggleMonth(m.month)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.monthHeaderLeft}>
                        {isCurrent && <View style={styles.currentDot} />}
                        <Text style={[styles.monthName, isCurrent && styles.monthNameCurrent]}>
                          {formatMonthLabel(m.month)}
                        </Text>
                      </View>
                      <View style={styles.monthHeaderRight}>
                        <View style={styles.monthBadge}>
                          <Text style={styles.monthBadgeText}>{m.count}</Text>
                        </View>
                        <Text style={styles.monthTotal}>{formatPrice(m.total)}</Text>
                        {isExpanded ? (
                          <ChevronUp size={16} color={Colors.textMuted} />
                        ) : (
                          <ChevronDown size={16} color={Colors.textMuted} />
                        )}
                      </View>
                    </TouchableOpacity>

                    {isExpanded && days.length > 0 && (
                      <View style={styles.monthDays}>
                        {days.map((day) => (
                          <View key={day.day} style={styles.dayRowCompact}>
                            <Text style={styles.dayDateCompact}>{formatDay(day.day)}</Text>
                            <Text style={styles.dayCountCompact}>{day.count} шт</Text>
                            <Text style={styles.dayTotalCompact}>{formatPrice(day.total)}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}

        {activeTab === 'yearly' && (
          <View style={styles.section}>
            {(!data || data.yearly.length === 0) ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>Нет данных</Text>
              </View>
            ) : (
              data.yearly.map((y) => {
                const isCurrent = y.year === currentYearKey;
                const yearMonths = data.monthly.filter((m) => m.month.startsWith(y.year));

                return (
                  <View key={y.year} style={[styles.yearCard, isCurrent && styles.yearCardCurrent]}>
                    <View style={styles.yearHeader}>
                      <View style={styles.yearHeaderLeft}>
                        {isCurrent && <View style={styles.currentDot} />}
                        <Text style={[styles.yearName, isCurrent && styles.yearNameCurrent]}>{y.year} год</Text>
                      </View>
                      <View style={styles.yearHeaderRight}>
                        <Text style={styles.yearCount}>{y.count} заявок</Text>
                        <Text style={styles.yearTotal}>{formatPrice(y.total)}</Text>
                      </View>
                    </View>

                    {yearMonths.length > 0 && (
                      <View style={styles.yearMonths}>
                        {yearMonths.map((m) => (
                          <View key={m.month} style={styles.yearMonthRow}>
                            <Text style={styles.yearMonthName}>
                              {MONTH_NAMES[m.month.split('-')[1] ?? ''] ?? m.month}
                            </Text>
                            <Text style={styles.yearMonthCount}>{m.count}</Text>
                            <Text style={styles.yearMonthTotal}>{formatPrice(m.total)}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </Animated.View>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  heroCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 24,
    padding: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  heroDecor1: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.03)',
    top: -50,
    right: -30,
  },
  heroDecor2: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(110,231,163,0.04)',
    bottom: -20,
    left: -10,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  heroStatBlock: {
    flex: 1,
    alignItems: 'center',
  },
  heroIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  heroStatValue: {
    fontSize: 16,
    fontWeight: '800' as const,
    color: Colors.white,
    marginBottom: 2,
    textAlign: 'center',
  },
  heroStatLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
  heroDivider: {
    width: 1,
    height: 50,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginTop: 8,
  },
  heroOrdersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  heroOrdersText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  tabsContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textMuted,
  },
  tabTextActive: {
    color: Colors.white,
  },
  section: {
    marginHorizontal: 16,
    marginTop: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  emptyCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  dayDateWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dayDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  dayDate: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  dayStats: {
    alignItems: 'flex-end',
  },
  dayCount: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  dayTotal: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.success,
  },
  recentSection: {
    marginTop: 16,
  },
  recentTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 10,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  recentLeft: {
    flex: 1,
    marginRight: 12,
  },
  recentCategory: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
    marginBottom: 3,
  },
  recentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  recentDate: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  recentPrice: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.success,
  },
  monthCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    overflow: 'hidden',
  },
  monthCardCurrent: {
    borderColor: Colors.primary + '60',
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  monthHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  currentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  monthName: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  monthNameCurrent: {
    color: Colors.success,
  },
  monthHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  monthBadge: {
    backgroundColor: Colors.primaryDark,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  monthBadgeText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.success,
  },
  monthTotal: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  monthDays: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    paddingTop: 10,
  },
  dayRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  dayDateCompact: {
    fontSize: 13,
    color: Colors.textSecondary,
    flex: 1,
  },
  dayCountCompact: {
    fontSize: 12,
    color: Colors.textMuted,
    marginRight: 12,
  },
  dayTotalCompact: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.success,
    minWidth: 80,
    textAlign: 'right',
  },
  yearCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    overflow: 'hidden',
  },
  yearCardCurrent: {
    borderColor: Colors.primary + '60',
  },
  yearHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  yearHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  yearName: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  yearNameCurrent: {
    color: Colors.success,
  },
  yearHeaderRight: {
    alignItems: 'flex-end',
  },
  yearCount: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  yearTotal: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: Colors.success,
  },
  yearMonths: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    paddingTop: 10,
  },
  yearMonthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
  },
  yearMonthName: {
    fontSize: 14,
    color: Colors.textSecondary,
    flex: 1,
  },
  yearMonthCount: {
    fontSize: 12,
    color: Colors.textMuted,
    marginRight: 16,
    minWidth: 24,
    textAlign: 'right',
  },
  yearMonthTotal: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.success,
    minWidth: 90,
    textAlign: 'right',
  },
});
