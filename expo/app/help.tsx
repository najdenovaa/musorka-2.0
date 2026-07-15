import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import {
  Mail,
  Phone,
  Clock,
  ChevronDown,
  ChevronUp,
  Shield,
  FileText,
  Trash2,
  LifeBuoy,
  Copy,
  MessageCircle,
  HelpCircle,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { METALLIC_BORDER_COLOR_STRONG, METALLIC_SHADOW_COLOR } from '@/constants/metallic';
import FloatingHeader, { useFloatingHeaderHeight } from '@/components/FloatingHeader';

const SUPPORT_EMAIL = 'najdenovaa@gmail.com';
const SUPPORT_PHONE = '+7 (922) 774-07-75';
const SUPPORT_PHONE_TEL = '+79227740775';


interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

const FAQ: FaqItem[] = [
  {
    id: 'create-order',
    question: 'Как создать заказ?',
    answer:
      'После входа в приложение нажмите кнопку «Создать заказ», выберите категорию и опишите задачу. Укажите адрес, желаемое время и бюджет — исполнители откликнутся в течение короткого времени.',
  },
  {
    id: 'become-executor',
    question: 'Как стать исполнителем?',
    answer:
      'В личном кабинете перейдите в раздел «Стать исполнителем» и заполните необходимые данные. После проверки профиля вы сможете откликаться на заказы и получать оплату напрямую от заказчиков.',
  },
  {
    id: 'payments-safe',
    question: 'Безопасны ли платежи?',
    answer:
      'Да, все оплаты проходят через защищённый шлюз Robokassa. Мы не храним данные ваших банковских карт — все транзакции защищены по стандартам платёжной индустрии.',
  },
  {
    id: 'no-response',
    question: 'Исполнитель не выходит на связь — что делать?',
    answer:
      'Напишите нам на najdenovaa@gmail.com или позвоните по телефону поддержки — мы поможем решить ситуацию и при необходимости предложим других исполнителей.',
  },
];

export default function SupportScreen() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const floatingHeaderHeight = useFloatingHeaderHeight();
  const router = useRouter();

  const openLegal = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/legal');
  }, [router]);

  const toggleFaq = useCallback((id: string) => {
    void Haptics.selectionAsync();
    setExpanded((prev) => (prev === id ? null : id));
  }, []);

  const handleOpen = useCallback((url: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void Linking.openURL(url).catch((e) => {
      console.error('[Support] Failed to open URL:', url, e);
      Alert.alert('Не удалось открыть', url);
    });
  }, []);

  const handleCopy = useCallback(async (value: string, label: string) => {
    try {
      await Clipboard.setStringAsync(value);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Скопировано', `${label} скопирован в буфер обмена`);
    } catch (e) {
      console.error('[Support] Clipboard error:', e);
    }
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <FloatingHeader showBack title="Поддержка" />
      <ScrollView
        style={s.container}
        contentContainerStyle={[s.content, { paddingTop: floatingHeaderHeight }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.hero}>
          <View style={s.heroIconWrap}>
            <LifeBuoy size={28} color={Colors.primary} />
          </View>
          <Text style={s.heroTitle}>Служба поддержки</Text>
          <Text style={s.heroSubtitle}>
            Мы всегда готовы помочь вам с вопросами по работе приложения, поиску исполнителей или оплате заказов.
          </Text>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Как с нами связаться</Text>
          <View style={s.card}>
            <TouchableOpacity
              style={s.contactRow}
              activeOpacity={0.7}
              onPress={() => handleOpen(`mailto:${SUPPORT_EMAIL}`)}
              onLongPress={() => void handleCopy(SUPPORT_EMAIL, 'Email')}
              testID="support-email"
            >
              <View style={[s.iconWrap, { backgroundColor: 'rgba(168,85,247,0.14)' }]}>
                <Mail size={18} color="#A855F7" />
              </View>
              <View style={s.contactInfo}>
                <Text style={s.contactLabel}>Email</Text>
                <Text style={s.contactValue}>{SUPPORT_EMAIL}</Text>
              </View>
              <TouchableOpacity
                onPress={() => void handleCopy(SUPPORT_EMAIL, 'Email')}
                hitSlop={10}
                style={s.copyBtn}
              >
                <Copy size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            </TouchableOpacity>

            <View style={s.divider} />

            <TouchableOpacity
              style={s.contactRow}
              activeOpacity={0.7}
              onPress={() => handleOpen(`tel:${SUPPORT_PHONE_TEL}`)}
              onLongPress={() => void handleCopy(SUPPORT_PHONE, 'Номер')}
              testID="support-phone"
            >
              <View style={[s.iconWrap, { backgroundColor: 'rgba(34,197,94,0.14)' }]}>
                <Phone size={18} color={Colors.primary} />
              </View>
              <View style={s.contactInfo}>
                <Text style={s.contactLabel}>Телефон</Text>
                <Text style={s.contactValue}>{SUPPORT_PHONE}</Text>
              </View>
              <TouchableOpacity
                onPress={() => void handleCopy(SUPPORT_PHONE, 'Номер')}
                hitSlop={10}
                style={s.copyBtn}
              >
                <Copy size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            </TouchableOpacity>

            <View style={s.divider} />

            <View style={s.contactRow}>
              <View style={[s.iconWrap, { backgroundColor: 'rgba(56,189,248,0.14)' }]}>
                <Clock size={18} color={Colors.info} />
              </View>
              <View style={s.contactInfo}>
                <Text style={s.contactLabel}>Время ответа</Text>
                <Text style={s.contactValue}>В течение 24 часов в рабочие дни</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={s.section}>
          <View style={s.sectionHeaderRow}>
            <HelpCircle size={14} color={Colors.textMuted} />
            <Text style={[s.sectionTitle, { marginLeft: 6, marginBottom: 0 }]}>
              Частые вопросы
            </Text>
          </View>
          <View style={s.card}>
            {FAQ.map((item, idx) => {
              const isOpen = expanded === item.id;
              return (
                <React.Fragment key={item.id}>
                  {idx > 0 ? <View style={s.divider} /> : null}
                  <TouchableOpacity
                    style={s.faqRow}
                    activeOpacity={0.7}
                    onPress={() => toggleFaq(item.id)}
                    testID={`faq-${item.id}`}
                  >
                    <Text style={s.faqQuestion}>{item.question}</Text>
                    {isOpen ? (
                      <ChevronUp size={18} color={Colors.textMuted} />
                    ) : (
                      <ChevronDown size={18} color={Colors.textMuted} />
                    )}
                  </TouchableOpacity>
                  {isOpen ? (
                    <View style={s.faqAnswerWrap}>
                      <Text style={s.faqAnswer}>{item.answer}</Text>
                    </View>
                  ) : null}
                </React.Fragment>
              );
            })}
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Управление аккаунтом</Text>
          <View style={s.card}>
            <View style={s.infoRow}>
              <View style={[s.iconWrap, { backgroundColor: 'rgba(248,113,113,0.14)' }]}>
                <Trash2 size={18} color={Colors.danger} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.infoTitle}>Как удалить аккаунт и данные</Text>
                <Text style={s.infoText}>
                  Вы можете удалить аккаунт прямо в приложении: «Профиль» → «Настройки» → «Удалить аккаунт».
                </Text>
                <Text style={[s.infoText, { marginTop: 8 }]}>
                  Также можно отправить запрос на удаление данных на {SUPPORT_EMAIL} — мы удалим вашу учётную запись в течение 30 дней.
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Юридическая информация</Text>
          <View style={s.card}>
            <TouchableOpacity
              style={s.linkRow}
              activeOpacity={0.7}
              onPress={openLegal}
              testID="support-terms"
            >
              <View style={[s.iconWrap, { backgroundColor: 'rgba(167,139,250,0.14)' }]}>
                <FileText size={18} color="#A78BFA" />
              </View>
              <Text style={s.linkText}>Пользовательское соглашение</Text>
            </TouchableOpacity>
            <View style={s.divider} />
            <TouchableOpacity
              style={s.linkRow}
              activeOpacity={0.7}
              onPress={openLegal}
              testID="support-privacy"
            >
              <View style={[s.iconWrap, { backgroundColor: 'rgba(56,189,248,0.14)' }]}>
                <Shield size={18} color={Colors.info} />
              </View>
              <Text style={s.linkText}>Политика конфиденциальности</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={s.ctaButton}
          activeOpacity={0.85}
          onPress={() => handleOpen(`mailto:${SUPPORT_EMAIL}`)}
          testID="support-cta"
        >
          <MessageCircle size={18} color={Colors.white} />
          <Text style={s.ctaText}>Написать в поддержку</Text>
        </TouchableOpacity>

        <View style={s.footer}>
          <Text style={s.footerText}>ИП Найденов Антон Анатольевич</Text>
          <Text style={s.footerTextMuted}>ИНН 702203346134 · ОГРНИП 324861700061841</Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 36,
  },
  hero: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 22,
    paddingHorizontal: 8,
  },
  heroIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: 'rgba(22,163,74,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(22,163,74,0.35)',
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800' as const,
    color: Colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  section: {
    marginBottom: 22,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 10,
    marginLeft: 4,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    marginLeft: 4,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: METALLIC_SHADOW_COLOR, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 4 },
      android: { elevation: 2 },
      default: {},
    }),
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  contactInfo: {
    flex: 1,
  },
  contactLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  contactValue: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  copyBtn: {
    padding: 6,
    borderRadius: 8,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: 60,
  },
  faqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 12,
  },
  faqQuestion: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
    lineHeight: 20,
  },
  faqAnswerWrap: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 2,
  },
  faqAnswer: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  infoRow: {
    flexDirection: 'row',
    padding: 14,
    gap: 12,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 6,
  },
  infoText: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  linkText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: 4,
    ...Platform.select({
      ios: { shadowColor: Colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12 },
      android: { elevation: 4 },
      default: {},
    }),
  },
  ctaText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700' as const,
    letterSpacing: 0.3,
  },
  footer: {
    alignItems: 'center',
    marginTop: 24,
    paddingHorizontal: 12,
  },
  footerText: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 4,
  },
  footerTextMuted: {
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
