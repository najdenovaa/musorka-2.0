export interface ServiceCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  bgColor: string;
  description: string;
}

export type RequestStatus = 'new' | 'in_progress' | 'completed' | 'cancelled';
export type UserRole = 'client' | 'executor' | 'admin' | 'support';
export type OfferStatus = 'none' | 'pending' | 'accepted' | 'declined';
export type ChatSenderRole = UserRole | 'support';

export interface RequestProposal {
  id: string;
  executorId: string;
  executorName: string;
  executorAvatar?: string | null;
  executorRating?: number | null;
  executorRatingCount?: number;
  executorCompletedCount?: number;
  executorIsFullyVerified?: boolean;
  price: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  conditions: string | null;
  createdAt: string;
  status: 'pending' | 'accepted' | 'declined';
}

export interface ServiceRequest {
  id: string;
  categoryId: string;
  categoryName: string;
  title: string;
  description: string;
  address: string;
  city?: string;
  acceptablePrice?: string;
  paymentMethod?: PaymentMethod;
  latitude?: number;
  longitude?: number;
  date: string | null;
  time: string | null;
  isUrgent?: boolean;
  isPaid?: boolean;
  status: RequestStatus;
  createdAt: string;
  masterName?: string;
  clientName?: string;
  executorId?: string;
  executorAvatar?: string | null;
  executorRating?: number | null;
  executorRatingCount?: number;
  executorCompletedCount?: number;
  executorIsFullyVerified?: boolean;
  clientId?: string;
  clientAvatar?: string | null;
  clientRating?: number | null;
  clientRatingCount?: number;
  clientRequestsCount?: number;
  proposalCount?: number;
  proposals: RequestProposal[];
  selectedProposalId?: string;
  proposedConditions?: string;
  proposedPrice?: string;
  proposedDate?: string;
  proposedTime?: string;
  proposedByExecutorId?: string;
  proposedByExecutorName?: string;
  proposedAt?: string;
  acceptedAt?: string;
  completedAt?: string;
  offerStatus?: OfferStatus;
  clientRatingByExecutor?: number;
  executorRatingByClient?: number;
  clientReviewByExecutor?: string;
  executorReviewByClient?: string;
  clientPhone?: string | null;
  executorPhone?: string | null;
  ignoredByExecutorIds?: string[];
  attachments?: string[];
  completionPhotos?: string[];
}

export type PaymentMethod = 'cash' | 'transfer' | 'online';

export interface UserAddress {
  id: string;
  label: string;
  address: string;
  city?: string;
  street?: string;
  house?: string;
  building?: string;
  apartment?: string;
  entrance?: string;
  floor?: string;
  intercom?: string;
}

export interface UserProfile {
  id: string;
  userNumber?: number | null;
  name: string;
  lastName?: string;
  firstName?: string;
  phone: string;
  email: string;
  emailVerified?: boolean;
  password?: string;
  avatar?: string;
  about?: string;
  portfolioCount?: number;
  isFullyVerified?: boolean;
  statusText?: string;
  role: UserRole;
  city: string;
  region?: string;
  requestsCount: number;
  completedCount: number;
  inProgressCount?: number;
  ratingCount?: number;
  rating?: number;
  subscribedServiceIds: string[];
  addresses: UserAddress[];
  isBlocked?: boolean;
  isDemo?: boolean;
  createdAt?: string;
  /** Present when loaded from backend `auth.me` — whether the account has a password (OAuth-only users may be false). */
  hasPassword?: boolean;
}

export interface PortfolioPhoto {
  id: string;
  photoUrl: string;
  sortOrder: number;
}

export interface MessageReaction {
  emoji: string;
  userIds: string[];
}

export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string | null;
  senderRole: ChatSenderRole;
  text: string;
  timestamp: string;
  read: boolean;
  attachmentUrl?: string | null;
  attachmentType?: 'image' | 'file' | 'audio' | 'video' | null;
  attachmentName?: string | null;
  audioDurationMs?: number | null;
  reactions?: MessageReaction[];
}

export interface Chat {
  id: string;
  type: 'support' | 'request';
  requestId?: string;
  participants: string[];
  participantNames: string[];
  participantAvatars?: (string | null)[];
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount: number;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: 'request_update' | 'new_message' | 'new_request' | 'system' | 'broadcast';
  data?: Record<string, string>;
  read: boolean;
  createdAt: string;
  recipientUserIds?: string[];
}

export interface TyumenAddress {
  id: string;
  address: string;
  district: string;
  latitude: number;
  longitude: number;
}
