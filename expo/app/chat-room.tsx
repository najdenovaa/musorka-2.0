import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  Dimensions,
  RefreshControl,
  Animated,
  ActivityIndicator,
  ScrollView,
  Pressable,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import {
  Send, Headphones, Check, CheckCheck, Paperclip, ImageIcon, X, FileText,
  Mic, Play, Pause, Camera,
} from 'lucide-react-native';
import { Image as ExpoImage } from '@/components/MImage';
import { BlurView } from 'expo-blur';

const USE_BLUR = Platform.OS === 'ios';
import * as DocumentPicker from 'expo-document-picker';
import { pickPhotos } from '@/lib/pick-photo';
import { uploadFileToS3 } from '@/lib/upload-to-s3';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { METALLIC_BORDER_COLOR_STRONG, METALLIC_SHADOW_COLOR } from '@/constants/metallic';
import MLoader from '@/components/MLoader';
import FloatingHeader from '@/components/FloatingHeader';
import { useFloatingHeaderHeight } from '@/components/FloatingHeader';
import { useChats } from '@/providers/ChatProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useOnlineStatus } from '@/hooks/useOnlinePresence';
import { ChatMessage, MessageReaction } from '@/types';
import { trpc } from '@/lib/trpc';
import { chatComposerProps } from '@/lib/text-input-autofill';
import { isSafeImageUri } from '@/lib/is-safe-image-uri';
import ZoomableImage from '@/components/ZoomableImage';


const USE_BACKEND = true;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAX_AUDIO_DURATION_MS = 60000;


const QUICK_EMOJIS = ['М', '👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '🙏', '💯'];

const EMOJI_CATEGORIES: { title: string; emojis: string[] }[] = [
  {
    title: 'Популярные',
    emojis: ['М', '👍', '👎', '❤️', '😂', '😮', '😢', '😡', '🔥', '👏', '🙏', '💯', '🎉', '💪', '✅', '❌', '⭐', '💎', '🤝', '🫡'],
  },
  {
    title: 'Смайлы',
    emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🫢', '🤐', '🤨', '😐', '😑', '😶', '🫥', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥸', '😎', '🤓', '🧐'],
  },
  {
    title: 'Жесты',
    emojis: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '🫵', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '🫶', '👐', '🤲', '🤝', '🙏', '💪'],
  },
  {
    title: 'Сердца',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '❤️‍🩹', '💕', '💞', '💓', '💗', '💖', '💘', '💝'],
  },
  {
    title: 'Природа',
    emojis: ['🌞', '🌙', '⭐', '🌟', '✨', '⚡', '🔥', '🌈', '☀️', '🌤️', '🌧️', '❄️', '💧', '🌊', '🌸', '🌺', '🌻', '🍀', '🌿', '🍃'],
  },
  {
    title: 'Предметы',
    emojis: ['🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '🥈', '🥉', '🎯', '💎', '💰', '💵', '🔑', '🔒', '📱', '💻', '🔔', '📌', '📎', '✏️'],
  },
];

function EmojiPickerModal({ visible, onClose, onSelect }: {
  visible: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
}) {
  const [activeCategory, setActiveCategory] = useState<number>(0);
  const scaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(scaleAnim, { toValue: 1, tension: 100, friction: 8, useNativeDriver: Platform.OS !== 'web' }).start();
    } else {
      scaleAnim.setValue(0);
    }
  }, [visible, scaleAnim]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={emojiPickerStyles.overlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <Animated.View style={[emojiPickerStyles.container, { transform: [{ scale: scaleAnim }] }]}>
              <View style={emojiPickerStyles.quickRow}>
                {QUICK_EMOJIS.map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    style={emojiPickerStyles.quickEmoji}
                    onPress={() => { onSelect(emoji); onClose(); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                    activeOpacity={0.6}
                  >
                    {emoji === 'М' ? (
                      <View style={emojiPickerStyles.mBadge}>
                        <Text style={emojiPickerStyles.mText}>М</Text>
                      </View>
                    ) : (
                      <Text style={emojiPickerStyles.quickEmojiText}>{emoji}</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              <View style={emojiPickerStyles.divider} />

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={emojiPickerStyles.categoryTabs}>
                {EMOJI_CATEGORIES.map((cat, idx) => (
                  <TouchableOpacity
                    key={cat.title}
                    style={[emojiPickerStyles.categoryTab, idx === activeCategory && emojiPickerStyles.categoryTabActive]}
                    onPress={() => setActiveCategory(idx)}
                    activeOpacity={0.7}
                  >
                    <Text style={[emojiPickerStyles.categoryTabText, idx === activeCategory && emojiPickerStyles.categoryTabTextActive]}>
                      {cat.title}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <ScrollView style={emojiPickerStyles.gridScroll} showsVerticalScrollIndicator={false}>
                <View style={emojiPickerStyles.grid}>
                  {EMOJI_CATEGORIES[activeCategory].emojis.map((emoji, idx) => (
                    <TouchableOpacity
                      key={`${emoji}_${idx}`}
                      style={emojiPickerStyles.gridItem}
                      onPress={() => { onSelect(emoji); onClose(); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                      activeOpacity={0.6}
                    >
                      {emoji === 'М' ? (
                        <View style={emojiPickerStyles.mBadgeGrid}>
                          <Text style={emojiPickerStyles.mTextGrid}>М</Text>
                        </View>
                      ) : (
                        <Text style={emojiPickerStyles.gridItemText}>{emoji}</Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const emojiPickerStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center',
  },
  container: {
    width: SCREEN_WIDTH - 40, maxHeight: 420, backgroundColor: Colors.card,
    borderRadius: 20, overflow: 'hidden' as const,
    borderWidth: 1.5, borderColor: METALLIC_BORDER_COLOR_STRONG,
    ...Platform.select({
      ios: { shadowColor: METALLIC_SHADOW_COLOR, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 12 },
      android: { elevation: 10 }, default: {},
    }),
  },
  quickRow: {
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 8,
  },
  quickEmoji: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
  },
  quickEmojiText: { fontSize: 24 },
  mBadge: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: METALLIC_BORDER_COLOR_STRONG,
  },
  mText: { fontSize: 16, fontWeight: '900' as const, color: Colors.white },
  divider: { height: 1, backgroundColor: Colors.border, marginHorizontal: 12 },
  categoryTabs: { maxHeight: 40, paddingHorizontal: 8, marginTop: 6 },
  categoryTab: {
    paddingHorizontal: 12, paddingVertical: 6, marginRight: 4, borderRadius: 14,
    backgroundColor: 'transparent',
  },
  categoryTabActive: { backgroundColor: Colors.primaryDark },
  categoryTabText: { fontSize: 12, color: Colors.textMuted, fontWeight: '500' as const },
  categoryTabTextActive: { color: Colors.success },
  gridScroll: { maxHeight: 260, paddingHorizontal: 8, paddingBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 8 },
  gridItem: {
    width: (SCREEN_WIDTH - 56) / 8, height: 42, alignItems: 'center', justifyContent: 'center',
  },
  gridItemText: { fontSize: 26 },
  mBadgeGrid: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: METALLIC_BORDER_COLOR_STRONG,
  },
  mTextGrid: { fontSize: 14, fontWeight: '900' as const, color: Colors.white },
});

function SingleReactionAnim({ emoji, onTap }: { emoji: string; onTap: () => void }) {
  const scaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 4,
      tension: 160,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, []);

  return (
    <Pressable onPress={onTap}>
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        {emoji === 'М' ? (
          <View style={reactionDisplayStyles.mMini}>
            <Text style={reactionDisplayStyles.mMiniText}>М</Text>
          </View>
        ) : (
          <Text style={reactionDisplayStyles.emoji}>{emoji}</Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

function ReactionsDisplay({ reactions, onTap, isOwn }: {
  reactions: MessageReaction[];
  onTap: (emoji: string) => void;
  isOwn: boolean;
}) {
  if (!reactions || reactions.length === 0) return null;

  return (
    <View style={[reactionDisplayStyles.container, isOwn && reactionDisplayStyles.containerOwn]}>
      {reactions.map((r) => (
        <View key={r.emoji} style={reactionDisplayStyles.reactionItem}>
          <SingleReactionAnim emoji={r.emoji} onTap={() => onTap(r.emoji)} />
          {r.userIds.length > 1 && (
            <Text style={reactionDisplayStyles.count}>{r.userIds.length}</Text>
          )}
        </View>
      ))}
    </View>
  );
}

const reactionDisplayStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    position: 'absolute',
    bottom: -10,
    gap: 2,
    zIndex: 10,
  },
  containerOwn: {
    right: 8,
  },
  reactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  },
  emoji: { fontSize: 18 },
  mMini: {
    width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  mMiniText: { fontSize: 10, fontWeight: '900' as const, color: Colors.white },
  count: { fontSize: 10, fontWeight: '700' as const, color: Colors.textSecondary, marginLeft: 1 },
});

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

async function fileToDataUri(uri: string, mimeType?: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      const response = await fetch(uri);
      const blob = await response.blob();
      return await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    }
    const FS = await import('expo-file-system/legacy');
    const base64 = await FS.readAsStringAsync(uri, { encoding: FS.EncodingType.Base64 });
    const mt = mimeType && mimeType.length > 0 ? mimeType : 'application/octet-stream';
    return `data:${mt};base64,${base64}`;
  } catch (e) {
    console.log('[ChatRoom] fileToDataUri error:', e);
    return null;
  }
}

function AudioPlayerBubble({ audioUrl, durationMs, isOwn }: { audioUrl: string; durationMs?: number | null; isOwn: boolean }) {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const soundRef = useRef<any>(null);
  const displayDuration = durationMs ? formatDuration(durationMs) : '0:00';

  const handleTogglePlay = useCallback(async () => {
    try {
      const { Audio } = await import('expo-av');
      if (isPlaying && soundRef.current) {
        await soundRef.current.pauseAsync();
        setIsPlaying(false);
        return;
      }

      if (soundRef.current) {
        await soundRef.current.playAsync();
        setIsPlaying(true);
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
        staysActiveInBackground: false,
      });
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { shouldPlay: true, progressUpdateIntervalMillis: 200 },
        (status: any) => {
          if (status.isLoaded) {
            if (status.durationMillis && status.durationMillis > 0) {
              setProgress(status.positionMillis / status.durationMillis);
            }
            if (status.didJustFinish) {
              setIsPlaying(false);
              setProgress(0);
              soundRef.current = null;
            }
          }
        }
      );
      soundRef.current = sound;
      setIsPlaying(true);
    } catch (err) {
      console.log('[AudioPlayer] Play error:', err);
      setIsPlaying(false);
    }
  }, [audioUrl, isPlaying]);

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    };
  }, []);

  const barColor = isOwn ? 'rgba(255,255,255,0.5)' : Colors.primary;
  const barFillColor = isOwn ? 'rgba(255,255,255,0.9)' : Colors.success;
  const textColor = isOwn ? 'rgba(255,255,255,0.8)' : Colors.text;

  return (
    <View style={audioStyles.container}>
      <TouchableOpacity onPress={handleTogglePlay} style={audioStyles.playBtn} activeOpacity={0.7}>
        {isPlaying ? (
          <Pause size={16} color={isOwn ? Colors.white : Colors.primary} fill={isOwn ? Colors.white : Colors.primary} />
        ) : (
          <Play size={16} color={isOwn ? Colors.white : Colors.primary} fill={isOwn ? Colors.white : Colors.primary} />
        )}
      </TouchableOpacity>
      <View style={audioStyles.barWrap}>
        <View style={[audioStyles.barBg, { backgroundColor: barColor }]}>
          <View style={[audioStyles.barFill, { backgroundColor: barFillColor, width: `${Math.max(2, progress * 100)}%` }]} />
        </View>
      </View>
      <Text style={[audioStyles.duration, { color: textColor }]}>{displayDuration}</Text>
    </View>
  );
}

const audioStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 160, paddingVertical: 2 },
  playBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.1)', alignItems: 'center', justifyContent: 'center' },
  barWrap: { flex: 1, height: 20, justifyContent: 'center' },
  barBg: { height: 4, borderRadius: 2, overflow: 'hidden' as const },
  barFill: { height: 4, borderRadius: 2 },
  duration: { fontSize: 12, fontWeight: '500' as const, minWidth: 32 },
});

function AttachmentPreview({ message, isOwn }: { message: ChatMessage; isOwn: boolean }) {
  const [viewerVisible, setViewerVisible] = useState<boolean>(false);

  if (!message.attachmentUrl) return null;

  if (message.attachmentType === 'audio') {
    return <AudioPlayerBubble audioUrl={message.attachmentUrl} durationMs={message.audioDurationMs} isOwn={isOwn} />;
  }

  if (message.attachmentType === 'video') {
    return (
      <View style={[styles.attachmentFileWrap, isOwn && styles.attachmentFileWrapOwn]}>
        <FileText size={18} color={isOwn ? 'rgba(255,255,255,0.8)' : Colors.info} />
        <Text style={[styles.attachmentFileName, isOwn && styles.attachmentFileNameOwn]} numberOfLines={1}>
          Видео
        </Text>
      </View>
    );
  }

  if (message.attachmentType === 'image') {
    return (
      <>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setViewerVisible(true)}
          style={styles.attachmentImageWrap}
        >
          <ExpoImage
            source={{ uri: message.attachmentUrl }}
            style={styles.attachmentImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
          />
        </TouchableOpacity>
        <Modal visible={viewerVisible} transparent animationType="fade" onRequestClose={() => setViewerVisible(false)}>
          <View style={styles.imageViewerOverlay}>
            <TouchableOpacity style={styles.imageViewerClose} onPress={() => setViewerVisible(false)}>
              <X size={24} color={Colors.white} />
            </TouchableOpacity>
            <ZoomableImage
              uri={message.attachmentUrl}
              style={styles.imageViewerImage}
              contentFit="contain"
            />
          </View>
        </Modal>
      </>
    );
  }

  return (
    <View style={[styles.attachmentFileWrap, isOwn && styles.attachmentFileWrapOwn]}>
      <FileText size={18} color={isOwn ? 'rgba(255,255,255,0.8)' : Colors.info} />
      <Text style={[styles.attachmentFileName, isOwn && styles.attachmentFileNameOwn]} numberOfLines={1}>
        {message.attachmentName || 'Файл'}
      </Text>
    </View>
  );
}



const MessageBubble = React.memo(function MessageBubble({ message, isOwn, showAvatar, reactions, onLongPress, onReactionTap }: {
  message: ChatMessage; isOwn: boolean; showAvatar: boolean;
  reactions: MessageReaction[];
  onLongPress: () => void;
  onReactionTap: (emoji: string) => void;
}) {
  const time = new Date(message.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const hasAvatar = message.senderAvatar && isSafeImageUri(message.senderAvatar);
  const hasAttachment = !!message.attachmentUrl;
  const isImageOnly = hasAttachment && message.attachmentType === 'image' && (!message.text || message.text === '📷 Фото');
  const isAudioOnly = hasAttachment && message.attachmentType === 'audio' && (!message.text || message.text === '🎤 Аудио');
  const isOptimistic = message.id.startsWith('optimistic_');

  return (
    <View style={[styles.messageRow, isOwn && styles.messageRowOwn, isOptimistic && { opacity: 0.7 }]}>
      {!isOwn && (
        <View style={styles.avatarSlot}>
          {showAvatar ? (
            hasAvatar ? (
              <ExpoImage source={{ uri: message.senderAvatar! }} style={styles.messageAvatar} contentFit="cover" cachePolicy="memory-disk" transition={100} />
            ) : (
              <View style={styles.messageAvatarFallback}>
                <Text style={styles.messageAvatarInitials}>{getInitials(message.senderName)}</Text>
              </View>
            )
          ) : <View style={styles.avatarSpacer} />}
        </View>
      )}

      <View style={[styles.bubbleWrapper, isOwn && styles.bubbleWrapperOwn]}>
        {!isOwn && showAvatar && <Text style={styles.senderName}>{message.senderName}</Text>}
        <TouchableOpacity
          activeOpacity={0.85}
          onLongPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onLongPress(); }}
          delayLongPress={300}
        >
          <View style={{ position: 'relative', marginBottom: reactions && reactions.length > 0 ? 12 : 0 }}>
            <View style={[
              styles.bubble,
              isOwn ? styles.bubbleOwn : styles.bubbleOther,
              isImageOnly && styles.bubbleImageOnly,
            ]}>
              <AttachmentPreview message={message} isOwn={isOwn} />
              {!isImageOnly && !isAudioOnly && (
                <Text style={[styles.messageText, isOwn && styles.messageTextOwn]}>{message.text}</Text>
              )}
              <View style={styles.messageMeta}>
                <Text style={[styles.messageTime, isOwn && styles.messageTimeOwn]}>{time}</Text>
                {isOwn && (
                  <View style={styles.checkContainer}>
                    {isOptimistic ? (
                      <ActivityIndicator size={10} color="rgba(255,255,255,0.5)" />
                    ) : message.read ? (
                      <CheckCheck size={14} color="rgba(255,255,255,0.8)" />
                    ) : (
                      <Check size={14} color="rgba(255,255,255,0.5)" />
                    )}
                  </View>
                )}
              </View>
            </View>
            <ReactionsDisplay reactions={reactions} onTap={onReactionTap} isOwn={isOwn} />
          </View>
        </TouchableOpacity>
      </View>

      {isOwn && (
        <View style={styles.avatarSlot}>
          {showAvatar ? (
            hasAvatar ? (
              <ExpoImage source={{ uri: message.senderAvatar! }} style={styles.messageAvatar} contentFit="cover" cachePolicy="memory-disk" transition={100} />
            ) : (
              <View style={[styles.messageAvatarFallback, styles.messageAvatarFallbackOwn]}>
                <Text style={styles.messageAvatarInitials}>{getInitials(message.senderName)}</Text>
              </View>
            )
          ) : <View style={styles.avatarSpacer} />}
        </View>
      )}
    </View>
  );
});

function RecordingOverlay({ durationMs, onCancel, onSend }: { durationMs: number; onCancel: () => void; onSend: () => void }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  return (
    <View style={recStyles.overlay}>
      <TouchableOpacity onPress={onCancel} style={recStyles.cancelBtn} activeOpacity={0.7}>
        <X size={20} color={Colors.danger} />
      </TouchableOpacity>
      <View style={recStyles.center}>
        <Animated.View style={[recStyles.redDot, { transform: [{ scale: pulseAnim }] }]} />
        <Text style={recStyles.timer}>{formatDuration(durationMs)}</Text>
      </View>
      <TouchableOpacity onPress={onSend} style={recStyles.sendRecBtn} activeOpacity={0.7}>
        <Send size={20} color={Colors.white} />
      </TouchableOpacity>
    </View>
  );
}

const recStyles = StyleSheet.create({
  overlay: {
    flexDirection: 'row', alignItems: 'center', padding: 12, paddingBottom: 12,
    backgroundColor: 'rgba(8,26,16,0.97)', borderTopWidth: 1.5,
    borderTopColor: METALLIC_BORDER_COLOR_STRONG, gap: 12,
  },
  cancelBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(220,38,38,0.15)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: METALLIC_BORDER_COLOR_STRONG,
  },
  center: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  redDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#EF4444' },
  timer: { fontSize: 18, fontWeight: '600' as const, color: Colors.text },
  sendRecBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: METALLIC_BORDER_COLOR_STRONG,
    ...Platform.select({
      ios: { shadowColor: METALLIC_SHADOW_COLOR, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 4 },
      android: { elevation: 2 }, default: {},
    }),
  },
});





export default function ChatRoomScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const { chats, getChatMessages, sendMessage, markChatAsRead, toggleReaction } = useChats();
  const { user } = useAuth();
  const [inputText, setInputText] = useState<string>('');
  const [isSendingAttachment, setIsSendingAttachment] = useState<boolean>(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState<boolean>(false);
  const [audioDurationMs, setAudioDurationMs] = useState<number>(0);

  const [showAttachMenu, setShowAttachMenu] = useState<boolean>(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState<boolean>(false);
  const [reactionTargetMessageId, setReactionTargetMessageId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const recordingRef = useRef<any>(null);
  const audioTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chat = chats.find(c => c.id === chatId);

  const otherParticipantId = useMemo(() => {
    if (!chat || !user) return '';
    return chat.participants.find(p => p !== user.id) ?? '';
  }, [chat, user]);

  const { isOnline } = useOnlineStatus(otherParticipantId ? [otherParticipantId] : []);
  const otherIsOnline = otherParticipantId ? isOnline(otherParticipantId) : false;

  // Android: реже опрашиваем сервер, чтобы снизить расход памяти/CPU и нагрузку на BlobModule.
  const messagesPollInterval = Platform.OS === 'android' ? 8_000 : 3_000;
  const messagesStaleTime = Platform.OS === 'android' ? 6_000 : 1_500;
  const backendMessagesQuery = trpc.chats.messages.useQuery(
    { chatId: chatId ?? '' },
    {
      enabled: USE_BACKEND && !!chatId,
      refetchInterval: messagesPollInterval,
      staleTime: messagesStaleTime,
      refetchOnMount: true,
    }
  );

  const messages: ChatMessage[] = USE_BACKEND
    ? (backendMessagesQuery.data as unknown as ChatMessage[] ?? [])
    : getChatMessages(chatId ?? '');

  const markedReadRef = useRef<string | null>(null);
  const lastMessageCountRef = useRef<number>(0);

  useEffect(() => {
    if (chatId && chatId !== markedReadRef.current) {
      markedReadRef.current = chatId;
      lastMessageCountRef.current = messages.length;
      markChatAsRead(chatId);
    }
  }, [chatId]);

  useEffect(() => {
    if (chatId && messages.length > 0 && messages.length !== lastMessageCountRef.current) {
      lastMessageCountRef.current = messages.length;
      markChatAsRead(chatId);
    }
  }, [chatId, messages.length]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => { flatListRef.current?.scrollToEnd({ animated: true }); }, 80);
  }, []);

  const handleSend = useCallback(() => {
    if (!inputText.trim() || !chatId || !user) return;
    sendMessage(chatId, user.id, user.name, user.role, inputText.trim());
    setInputText('');
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scrollToBottom();
  }, [inputText, chatId, user, sendMessage, scrollToBottom]);

  const handlePickImageSource = useCallback(async (src: 'camera' | 'gallery') => {
    if (!chatId || !user) return;
    setShowAttachMenu(false);
    setIsSendingAttachment(true);
    try {
      const isAndroid = Platform.OS === 'android';
      const uris = await pickPhotos(src, {
        multiple: false,
        maxEdge: isAndroid ? 720 : 1200,
        maxBytes: isAndroid ? 350 * 1024 : 1 * 1024 * 1024,
        quality: isAndroid ? 0.4 : 0.5,
      });
      if (!uris || uris.length === 0) return;
      const dataUri = uris[0];
      const fileName = `photo_${Date.now()}.jpg`;
      const uploaded = await uploadFileToS3(dataUri, { prefix: 'chat', fileName });
      sendMessage(chatId, user.id, user.name, user.role, '📷 Фото', { url: uploaded.url, type: 'image', name: fileName });
      setInputText('');
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      scrollToBottom();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ChatRoom] Image pick error:', err);
      Alert.alert('Ошибка отправки фото', msg || 'Не удалось отправить фото');
    } finally {
      setIsSendingAttachment(false);
    }
  }, [chatId, user, sendMessage, scrollToBottom]);

  const handlePickImage = useCallback(() => handlePickImageSource('gallery'), [handlePickImageSource]);

  const handlePickFile = useCallback(async () => {
    if (!chatId || !user) return;
    setShowAttachMenu(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if (!asset) return;

      const maxSize = 2 * 1024 * 1024;
      if (asset.size && asset.size > maxSize) {
        Alert.alert('Файл слишком большой', 'Максимальный размер файла — 2 МБ.');
        return;
      }

      setIsSendingAttachment(true);
      let uploadUri: string | null = null;
      if (Platform.OS === 'web') {
        uploadUri = asset.uri.startsWith('data:') ? asset.uri : await fileToDataUri(asset.uri, asset.mimeType);
      } else {
        uploadUri = asset.uri;
      }
      if (!uploadUri) {
        Alert.alert('Ошибка', 'Не удалось обработать файл.');
        setIsSendingAttachment(false);
        return;
      }
      const uploadedFile = await uploadFileToS3(uploadUri, { prefix: 'chat', fileName: asset.name, contentType: asset.mimeType });
      sendMessage(chatId, user.id, user.name, user.role, '📎 Файл', { url: uploadedFile.url, type: 'file', name: asset.name });
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      scrollToBottom();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ChatRoom] File pick error:', err);
      Alert.alert('Ошибка отправки файла', msg || 'Не удалось отправить файл');
    } finally {
      setIsSendingAttachment(false);
    }
  }, [chatId, user, sendMessage, scrollToBottom]);

  const handleStartAudioRecording = useCallback(async () => {
    if (!chatId || !user || isRecordingAudio) return;
    try {
      if (Platform.OS === 'web') {
        Alert.alert('Недоступно', 'Запись аудио недоступна в веб-версии.');
        return;
      }
      const { Audio } = await import('expo-av');
      const currentPerm = await Audio.getPermissionsAsync();
      console.log('[ChatRoom] Audio permission status:', currentPerm.status, 'granted:', currentPerm.granted);
      let granted = currentPerm.granted;
      if (!granted) {
        const permResult = await Audio.requestPermissionsAsync();
        console.log('[ChatRoom] Audio permission after request:', permResult.status, 'granted:', permResult.granted);
        granted = permResult.granted;
      }
      if (!granted) {
        Alert.alert(
          'Нет доступа к микрофону',
          'Разрешите доступ к микрофону в настройках устройства для записи аудиосообщений.'
        );
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
        staysActiveInBackground: false,
      });
      // Android: используем LOW_QUALITY (меньше размер файла → надёжнее загрузка через bridge).
      // iOS оставляем HIGH_QUALITY — там нет лимитов памяти как на Android.
      const recordingPreset = Platform.OS === 'android'
        ? Audio.RecordingOptionsPresets.LOW_QUALITY
        : Audio.RecordingOptionsPresets.HIGH_QUALITY;
      const { recording } = await Audio.Recording.createAsync(recordingPreset);
      recordingRef.current = recording;
      setIsRecordingAudio(true);
      setAudioDurationMs(0);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      audioTimerRef.current = setInterval(() => {
        setAudioDurationMs(prev => {
          if (prev >= MAX_AUDIO_DURATION_MS) {
            handleStopAndSendAudio();
            return prev;
          }
          return prev + 100;
        });
      }, 100);

      console.log('[ChatRoom] Audio recording started');
    } catch (err) {
      console.error('[ChatRoom] Audio recording start error:', err);
      Alert.alert('Ошибка', 'Не удалось начать запись');
      setIsRecordingAudio(false);
    }
  }, [chatId, user, isRecordingAudio]);

  const handleCancelAudioRecording = useCallback(async () => {
    if (audioTimerRef.current) clearInterval(audioTimerRef.current);
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
        const { Audio } = await import('expo-av');
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      } catch {}
      recordingRef.current = null;
    }
    setIsRecordingAudio(false);
    setAudioDurationMs(0);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    console.log('[ChatRoom] Audio recording cancelled');
  }, []);

  const handleStopAndSendAudio = useCallback(async () => {
    if (audioTimerRef.current) clearInterval(audioTimerRef.current);
    if (!recordingRef.current || !chatId || !user) {
      setIsRecordingAudio(false);
      return;
    }
    try {
      const recording = recordingRef.current;
      recordingRef.current = null;
      setIsRecordingAudio(false);

      await recording.stopAndUnloadAsync();
      const { Audio } = await import('expo-av');
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      const uri = recording.getURI();
      if (!uri) {
        Alert.alert('Ошибка', 'Не удалось сохранить аудио');
        return;
      }

      const finalDuration = audioDurationMs;
      setAudioDurationMs(0);

      if (finalDuration < 500) {
        console.log('[ChatRoom] Audio too short, discarding');
        return;
      }

      setIsSendingAttachment(true);
      const audioName = `audio_${Date.now()}.m4a`;
      const uploadedAudio = await uploadFileToS3(uri, { prefix: 'chat', contentType: 'audio/m4a', fileName: audioName });
      setIsSendingAttachment(false);

      sendMessage(chatId, user.id, user.name, user.role, '🎤 Аудио', {
        url: uploadedAudio.url, type: 'audio', name: audioName, audioDurationMs: finalDuration,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      scrollToBottom();
      console.log('[ChatRoom] Audio message sent, duration:', finalDuration);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ChatRoom] Audio send error:', err);
      setIsRecordingAudio(false);
      setIsSendingAttachment(false);
      Alert.alert('Ошибка отправки аудио', msg || 'Не удалось отправить аудио');
    }
  }, [chatId, user, sendMessage, audioDurationMs, scrollToBottom]);

  const handleTakePhoto = useCallback(async () => {
    await handlePickImageSource('camera');
  }, [handlePickImageSource]);

  const [showChatPhotoSheet, setShowChatPhotoSheet] = useState<boolean>(false);

  const isStaff = user?.role === 'admin' || user?.role === 'support';

  const chatTitle = useMemo(() => {
    if (!chat) return 'Чат';
    if (chat.type === 'support') {
      if (isStaff && user) {
        const clientIdx = chat.participants.findIndex(p => p !== user.id);
        if (clientIdx >= 0 && chat.participantNames[clientIdx]) return chat.participantNames[clientIdx];
        return chat.participantNames.filter(n => n !== user.name).join(', ') || 'Клиент';
      }
      return 'Поддержка MUSORKA';
    }
    if (!user) return chat.participantNames.join(', ');
    const otherIdx = chat.participants.findIndex(p => p !== user.id);
    if (otherIdx >= 0 && chat.participantNames[otherIdx]) return chat.participantNames[otherIdx];
    return chat.participantNames.filter(n => n !== user.name).join(', ') || 'Чат';
  }, [chat, user, isStaff]);

  const shouldShowAvatar = useCallback((index: number): boolean => {
    if (index === 0) return true;
    return messages[index].senderId !== messages[index - 1].senderId;
  }, [messages]);

  const [chatRefreshing, setChatRefreshing] = useState<boolean>(false);
  const handleChatRefresh = useCallback(() => {
    setChatRefreshing(true);
    if (USE_BACKEND) {
      void backendMessagesQuery.refetch().finally(() => { setTimeout(() => setChatRefreshing(false), 400); });
    } else {
      setTimeout(() => setChatRefreshing(false), 400);
    }
  }, [backendMessagesQuery]);

  const canSend = inputText.trim().length > 0;
  const floatingHeaderHeight = useFloatingHeaderHeight();

  useEffect(() => {
    return () => {
      if (audioTimerRef.current) clearInterval(audioTimerRef.current);
      if (recordingRef.current) {
        try { recordingRef.current.stopAndUnloadAsync(); } catch {}
        recordingRef.current = null;
      }
    };
  }, []);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <FloatingHeader showBack title={chatTitle} />

      {chat?.type === 'support' && (
        <View style={styles.supportBanner}>
          <Headphones size={14} color={Colors.success} />
          <Text style={styles.supportBannerText}>
            {isStaff ? 'Чат поддержки · Обращение пользователя' : 'Поддержка MUSORKA · 8:00–24:00'}
          </Text>
        </View>
      )}

      {USE_BACKEND && backendMessagesQuery.isLoading && (
        <View style={styles.loadingBar}><MLoader size="small" /></View>
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <MessageBubble
            message={item}
            isOwn={item.senderId === user?.id}
            showAvatar={shouldShowAvatar(index)}
            reactions={item.reactions ?? []}
            onLongPress={() => { setReactionTargetMessageId(item.id); setShowEmojiPicker(true); }}
            onReactionTap={(emoji) => { if (user) toggleReaction(item.id, emoji, user.id); }}
          />
        )}
        contentContainerStyle={[styles.messagesList, { paddingTop: floatingHeaderHeight + 4 }]}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => { flatListRef.current?.scrollToEnd({ animated: false }); }}
        refreshControl={
          <RefreshControl
            refreshing={chatRefreshing} onRefresh={handleChatRefresh}
            tintColor={Colors.primary} colors={[Colors.primary]} progressBackgroundColor={Colors.card}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyChat}><Text style={styles.emptyChatText}>Начните диалог</Text></View>
        }
      />

      {isRecordingAudio ? (
        <RecordingOverlay durationMs={audioDurationMs} onCancel={handleCancelAudioRecording} onSend={handleStopAndSendAudio} />
      ) : (
        <View style={styles.inputBarOuter}>
          <View style={styles.inputIslandRow}>
            <View style={styles.attachIsland}>
              {USE_BLUR ? (
                <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
              ) : (
                <View style={[StyleSheet.absoluteFill, styles.islandWebBg]} />
              )}
              <TouchableOpacity
                style={styles.attachIslandBtn}
                onPress={() => setShowAttachMenu(true)}
                activeOpacity={0.7}
                disabled={isSendingAttachment}
                testID="chat-attach"
              >
                {isSendingAttachment ? <MLoader size="small" /> : <Paperclip size={20} color={Colors.primary} />}
              </TouchableOpacity>
            </View>

            <View style={styles.inputIsland}>
              {USE_BLUR ? (
                <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
              ) : (
                <View style={[StyleSheet.absoluteFill, styles.islandWebBg]} />
              )}
              <TextInput
                {...chatComposerProps}
                style={styles.inputIslandField}
                placeholder="Сообщение..."
                placeholderTextColor={Colors.textMuted}
                value={inputText}
                onChangeText={setInputText}
                multiline
                maxLength={1000}
                testID="chat-input"
              />
            </View>

            {canSend ? (
              <View style={styles.sendIsland}>
                <TouchableOpacity
                  style={styles.sendIslandBtn}
                  onPress={handleSend}
                  activeOpacity={0.7}
                  testID="chat-send"
                >
                  <Send size={20} color={Colors.white} />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.mediaIslandRow}>
                <View style={styles.mediaIsland}>
                  {USE_BLUR ? (
                    <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
                  ) : (
                    <View style={[StyleSheet.absoluteFill, styles.islandWebBg]} />
                  )}
                  <TouchableOpacity
                    style={styles.mediaIslandBtn}
                    onPress={handleStartAudioRecording}
                    activeOpacity={0.7}
                    testID="chat-mic"
                  >
                    <Mic size={20} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
                {Platform.OS !== 'web' && (
                  <View style={styles.mediaIsland}>
                    {USE_BLUR ? (
                      <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
                    ) : (
                      <View style={[StyleSheet.absoluteFill, styles.islandWebBg]} />
                    )}
                    <TouchableOpacity
                      style={styles.mediaIslandBtn}
                      onPress={handleTakePhoto}
                      activeOpacity={0.7}
                      disabled={isSendingAttachment}
                      testID="chat-camera"
                    >
                      <Camera size={20} color={Colors.primary} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      )}

      <Modal visible={showAttachMenu} transparent animationType="fade" onRequestClose={() => setShowAttachMenu(false)}>
        <TouchableOpacity style={attachMenuStyles.overlay} activeOpacity={1} onPress={() => setShowAttachMenu(false)}>
          <View style={attachMenuStyles.menu}>
            {Platform.OS !== 'web' ? (
              <>
                <TouchableOpacity style={attachMenuStyles.option} onPress={() => { setShowAttachMenu(false); setTimeout(() => handlePickImageSource('camera'), 120); }} activeOpacity={0.7}>
                  <Camera size={22} color={Colors.primary} />
                  <Text style={attachMenuStyles.optionText}>Камера</Text>
                </TouchableOpacity>
                <View style={attachMenuStyles.divider} />
              </>
            ) : null}
            <TouchableOpacity style={attachMenuStyles.option} onPress={handlePickImage} activeOpacity={0.7}>
              <ImageIcon size={22} color={Colors.primary} />
              <Text style={attachMenuStyles.optionText}>Фото из галереи</Text>
            </TouchableOpacity>
            <View style={attachMenuStyles.divider} />
            <TouchableOpacity style={attachMenuStyles.option} onPress={handlePickFile} activeOpacity={0.7}>
              <FileText size={22} color={Colors.info} />
              <Text style={attachMenuStyles.optionText}>Файл</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <EmojiPickerModal
        visible={showEmojiPicker}
        onClose={() => { setShowEmojiPicker(false); setReactionTargetMessageId(null); }}
        onSelect={(emoji) => {
          if (reactionTargetMessageId && user) {
            toggleReaction(reactionTargetMessageId, emoji, user.id);
          }
        }}
      />
    </KeyboardAvoidingView>
  );
}

const attachMenuStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', paddingBottom: 90, paddingHorizontal: 20,
  },
  menu: {
    backgroundColor: Colors.card, borderRadius: 16, overflow: 'hidden' as const,
    borderWidth: 1.5, borderColor: METALLIC_BORDER_COLOR_STRONG,
    ...Platform.select({
      ios: { shadowColor: METALLIC_SHADOW_COLOR, shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.5, shadowRadius: 8 },
      android: { elevation: 8 }, default: {},
    }),
  },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 16,
  },
  optionText: { fontSize: 16, color: Colors.text, fontWeight: '500' as const },
  divider: { height: 1, backgroundColor: Colors.border, marginHorizontal: 16 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  supportBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 8, backgroundColor: Colors.cardSecondary,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  supportBannerText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' as const },
  loadingBar: { paddingVertical: 6, alignItems: 'center' },
  messagesList: { padding: 12, paddingBottom: 8, flexGrow: 1 },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 4 },
  messageRowOwn: { justifyContent: 'flex-end' },
  avatarSlot: { width: 32, marginBottom: 2 },
  avatarSpacer: { width: 32, height: 32 },
  messageAvatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: Colors.border },
  messageAvatarFallback: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.infoLight,
    borderWidth: 1.5, borderColor: Colors.info, alignItems: 'center', justifyContent: 'center',
  },
  messageAvatarFallbackOwn: { backgroundColor: Colors.primaryDark, borderColor: Colors.primary },
  messageAvatarInitials: { fontSize: 11, fontWeight: '700' as const, color: Colors.white },
  bubbleWrapper: { maxWidth: '72%', marginLeft: 6 },
  bubbleWrapperOwn: { marginLeft: 0, marginRight: 6, alignItems: 'flex-end' },
  senderName: { fontSize: 12, fontWeight: '600' as const, color: Colors.success, marginBottom: 2, marginLeft: 12 },
  bubble: { borderRadius: 18, padding: 10, paddingBottom: 6 },
  bubbleOwn: {
    backgroundColor: Colors.primary, borderBottomRightRadius: 4,
    borderWidth: 1, borderColor: 'rgba(180,210,195,0.25)',
  },
  bubbleOther: {
    backgroundColor: Colors.card, borderBottomLeftRadius: 4,
    borderWidth: 1.5, borderColor: 'rgba(170,205,190,0.3)',
  },
  bubbleImageOnly: { padding: 4, paddingBottom: 4, overflow: 'hidden' as const },
  messageText: { fontSize: 15, color: Colors.text, lineHeight: 20 },
  messageTextOwn: { color: Colors.white },
  messageMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 3, gap: 3 },
  messageTime: { fontSize: 11, color: Colors.textMuted },
  messageTimeOwn: { color: 'rgba(255,255,255,0.6)' },
  checkContainer: { marginLeft: 1 },
  attachmentImageWrap: { borderRadius: 14, overflow: 'hidden' as const, marginBottom: 4 },
  attachmentImage: { width: SCREEN_WIDTH * 0.52, height: SCREEN_WIDTH * 0.52 * 0.75, borderRadius: 14 },
  attachmentFileWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 4, marginBottom: 4 },
  attachmentFileWrapOwn: {},
  attachmentFileName: { fontSize: 13, color: Colors.info, fontWeight: '500' as const, flex: 1 },
  attachmentFileNameOwn: { color: 'rgba(255,255,255,0.85)' },
  imageViewerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' },
  imageViewerClose: {
    position: 'absolute' as const, top: 60, right: 20, zIndex: 10,
    width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  imageViewerImage: { width: SCREEN_WIDTH - 32, height: SCREEN_WIDTH - 32 },
  inputBarOuter: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: 'transparent',
  },
  inputIslandRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  attachIsland: {
    width: 42,
    height: 42,
    borderRadius: 21,
    overflow: 'hidden' as const,
    borderWidth: 1.5,
    borderColor: 'rgba(170,205,190,0.3)',
    ...Platform.select({
      ios: { shadowColor: METALLIC_SHADOW_COLOR, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 6 },
      android: { elevation: 3 }, default: {},
    }),
  },
  attachIslandBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputIsland: {
    flex: 1,
    minHeight: 42,
    borderRadius: 21,
    overflow: 'hidden' as const,
    borderWidth: 1.5,
    borderColor: 'rgba(170,205,190,0.3)',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: METALLIC_SHADOW_COLOR, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 6 },
      android: { elevation: 3 }, default: {},
    }),
  },
  inputIslandField: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.text,
    maxHeight: 100,
    backgroundColor: 'transparent',
  },
  islandWebBg: {
    backgroundColor: 'rgba(8,26,16,0.85)',
  },
  sendIsland: {
    width: 42,
    height: 42,
    borderRadius: 21,
    overflow: 'hidden' as const,
    backgroundColor: Colors.primary,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
    ...Platform.select({
      ios: { shadowColor: 'rgba(110,231,163,0.4)', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 8 },
      android: { elevation: 5 }, default: {},
    }),
  },
  sendIslandBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaIslandRow: {
    flexDirection: 'row',
    gap: 6,
  },
  mediaIsland: {
    width: 42,
    height: 42,
    borderRadius: 21,
    overflow: 'hidden' as const,
    borderWidth: 1.5,
    borderColor: 'rgba(170,205,190,0.3)',
    ...Platform.select({
      ios: { shadowColor: METALLIC_SHADOW_COLOR, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 6 },
      android: { elevation: 3 }, default: {},
    }),
  },
  mediaIslandBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyChatText: { fontSize: 14, color: Colors.textMuted },
});
