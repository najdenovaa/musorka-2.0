import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Colors from '@/constants/colors';
import FloatingHeader, { useFloatingHeaderHeight } from '@/components/FloatingHeader';
import { LEGAL_TITLE, LEGAL_SUBTITLE, LEGAL_SECTIONS } from '@/constants/legal';

export default function LegalScreen() {
  const floatingHeaderHeight = useFloatingHeaderHeight();

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <FloatingHeader showBack title="Соглашение и политика" />
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: floatingHeaderHeight }]}
        showsVerticalScrollIndicator={false}
        testID="legal-scroll"
      >
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>{LEGAL_TITLE}</Text>
          <Text style={styles.heroSubtitle}>{LEGAL_SUBTITLE}</Text>
        </View>

        {LEGAL_SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.paragraphs.map((p, idx) => (
              <Text key={idx} style={styles.paragraph}>
                {p}
              </Text>
            ))}
          </View>
        ))}

        <View style={styles.footer}>
          <Text style={styles.footerText}>ИП Найденов Антон Анатольевич</Text>
          <Text style={styles.footerMuted}>ИНН 702203346134 · ОГРНИП 324861700061841</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  hero: {
    paddingTop: 8,
    paddingBottom: 16,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800' as const,
    color: Colors.text,
    lineHeight: 28,
  },
  heroSubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  section: {
    marginTop: 18,
    backgroundColor: Colors.card ?? 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.12)',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 13.5,
    lineHeight: 20,
    color: Colors.textSecondary,
    marginTop: 6,
  },
  footer: {
    marginTop: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
  },
  footerMuted: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
