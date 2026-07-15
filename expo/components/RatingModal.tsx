import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Animated,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Image } from '@/components/MImage';
import { Star, X, Send, User } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import MLoader from '@/components/MLoader';
import { chatComposerProps } from '@/lib/text-input-autofill';

interface RatingModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (rating: number, review: string) => void;
  title: string;
  subtitle: string;
  personAvatar?: string | null;
  personName?: string;
  personRating?: number | null;
  serviceName?: string;
  isSubmitting?: boolean;
}

export default React.memo(function RatingModal({
  visible,
  onClose,
  onSubmit,
  title,
  subtitle,
  personAvatar,
  personName,
  personRating,
  serviceName,
  isSubmitting,
}: RatingModalProps) {
  const [rating, setRating] = useState<number>(0);
  const [review, setReview] = useState<string>('');
  const scaleAnims = useRef([1, 2, 3, 4, 5].map(() => new Animated.Value(1))).current;

  const handleStarPress = useCallback((value: number) => {
    setRating(value);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.sequence([
      Animated.timing(scaleAnims[value - 1], {
        toValue: 1.4,
        duration: 120,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.spring(scaleAnims[value - 1], {
        toValue: 1,
        useNativeDriver: Platform.OS !== 'web',
        speed: 18,
        bounciness: 10,
      }),
    ]).start();
  }, [scaleAnims]);

  const handleSubmit = useCallback(() => {
    onSubmit(rating, review.trim());
    setRating(0);
    setReview('');
  }, [onSubmit, rating, review]);

  const handleSkip = useCallback(() => {
    onClose();
    setRating(0);
    setReview('');
  }, [onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleSkip}
    >
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={styles.overlayInner} onPress={handleSkip}>
          <Pressable style={styles.container} onPress={() => {}}>
            <TouchableOpacity style={styles.closeButton} onPress={handleSkip} testID="rating-modal-close">
              <X size={20} color={Colors.textMuted} />
            </TouchableOpacity>

            {personName ? (
              <View style={styles.personBlock}>
                {personAvatar ? (
                  <Image source={{ uri: personAvatar }} style={styles.personAvatar} />
                ) : (
                  <View style={styles.personAvatarPlaceholder}>
                    <User size={28} color={Colors.primary} />
                  </View>
                )}
                <Text style={styles.personName}>{personName}</Text>
                {personRating != null && personRating > 0 ? (
                  <View style={styles.personRatingRow}>
                    <Star size={14} color="#FBBF24" fill="#FBBF24" />
                    <Text style={styles.personRatingText}>{Number(personRating).toFixed(1)}</Text>
                  </View>
                ) : (
                  <Text style={styles.personNewLabel}>Новый пользователь</Text>
                )}
                {serviceName ? (
                  <View style={styles.serviceChip}>
                    <Text style={styles.serviceChipText}>{serviceName}</Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.subtitle}>{subtitle}</Text>
              </>
            )}

            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((value) => (
                <TouchableOpacity
                  key={value}
                  onPress={() => handleStarPress(value)}
                  activeOpacity={0.7}
                  testID={`rating-star-${value}`}
                >
                  <Animated.View style={{ transform: [{ scale: scaleAnims[value - 1] }] }}>
                    <Star
                      size={40}
                      color={value <= rating ? '#F59E0B' : Colors.textMuted}
                      fill={value <= rating ? '#F59E0B' : 'transparent'}
                    />
                  </Animated.View>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              {...chatComposerProps}
              style={styles.reviewInput}
              value={review}
              onChangeText={setReview}
              placeholder="Напишите отзыв (необязательно)"
              placeholderTextColor={Colors.textMuted}
              multiline
              textAlignVertical="top"
              testID="rating-review-input"
            />

            {isSubmitting ? (
              <View style={styles.submittingOverlay}>
                <MLoader size="large" />
                <Text style={styles.submittingText}>Отправляем оценку...</Text>
              </View>
            ) : (
              <View style={styles.actions}>
                <TouchableOpacity style={styles.skipButton} onPress={handleSkip} testID="rating-skip">
                  <Text style={styles.skipText}>Пропустить</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.submitButton, rating === 0 && styles.submitDisabled]}
                  onPress={handleSubmit}
                  disabled={rating === 0}
                  testID="rating-submit"
                >
                  <Send size={16} color={Colors.white} />
                  <Text style={styles.submitText}>Отправить</Text>
                </TouchableOpacity>
              </View>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
  },
  overlayInner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    width: '100%',
    backgroundColor: Colors.card,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    top: 16,
    zIndex: 1,
    padding: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 20,
  },
  reviewInput: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: Colors.text,
    fontSize: 14,
    minHeight: 80,
    marginBottom: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  skipButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.cardSecondary,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
  },
  submitButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitDisabled: {
    opacity: 0.5,
  },
  submitText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.white,
  },
  submittingOverlay: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 20,
    gap: 12,
  },
  submittingText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
  },
  personBlock: {
    alignItems: 'center',
    marginBottom: 16,
    gap: 6,
  },
  personAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: 'rgba(22,163,74,0.3)',
    marginBottom: 4,
  },
  personAvatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(22,163,74,0.1)',
    borderWidth: 3,
    borderColor: 'rgba(22,163,74,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  personName: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: Colors.text,
    textAlign: 'center',
  },
  personRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  personRatingText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: '#FBBF24',
  },
  personNewLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
  },
  serviceChip: {
    backgroundColor: 'rgba(22,163,74,0.1)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: 2,
  },
  serviceChipText: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
});
