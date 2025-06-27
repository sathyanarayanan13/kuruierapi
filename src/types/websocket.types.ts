export interface WebSocketUser {
  userId: string;
  socketId: string;
  username: string;
  currentRole: string;
  isOnline: boolean;
  lastSeen: Date;
}

export interface ChatRoom {
  matchId: string;
  participants: WebSocketUser[];
  createdAt: Date;
}

export interface TypingIndicator {
  matchId: string;
  userId: string;
  username: string;
  isTyping: boolean;
  timestamp: Date;
}

export interface MessageDelivery {
  messageId: string;
  matchId: string;
  senderId: string;
  deliveredTo: string[];
  readBy: string[];
  timestamp: Date;
}

export interface WebSocketEvents {
  // Connection events
  user_connected: (data: {
    userId: string;
    username: string;
    currentRole: string;
  }) => void;
  user_disconnected: (data: { userId: string }) => void;
  user_online: (data: { userId: string; isOnline: boolean }) => void;

  // Chat room events
  join_chat: (data: { matchId: string }) => void;
  leave_chat: (data: { matchId: string }) => void;
  user_joined_chat: (data: { matchId: string; user: WebSocketUser }) => void;
  user_left_chat: (data: { matchId: string; userId: string }) => void;

  // Message events
  new_message: (message: any) => void;
  message_delivered: (data: {
    messageId: string;
    matchId: string;
    deliveredAt: Date;
  }) => void;
  message_read: (data: {
    messageId: string;
    matchId: string;
    readAt: Date;
    readBy: string;
  }) => void;

  // Typing events
  typing_start: (data: {
    matchId: string;
    userId: string;
    username: string;
  }) => void;
  typing_stop: (data: { matchId: string; userId: string }) => void;
  user_typing: (data: TypingIndicator) => void;

  // Chat unlock events
  chat_unlocked: (data: { matchId: string; unlockedAt: Date }) => void;
  payment_confirmed: (data: { matchId: string; paymentId: string }) => void;

  // Invitation events
  chat_invitation: (data: any) => void;
  invitation_accepted: (data: { matchId: string; userId: string }) => void;
  invitation_declined: (data: { matchId: string; userId: string }) => void;

  // Error events
  error: (data: { message: string; code?: string }) => void;
  unauthorized: (data: { message: string }) => void;
}

export interface ClientToServerEvents extends WebSocketEvents {
  // Client sends these events to server
  authenticate: (data: { token: string }) => void;
  join_chat: (data: { matchId: string }) => void;
  leave_chat: (data: { matchId: string }) => void;
  send_message: (data: any) => void;
  start_typing: (data: { matchId: string }) => void;
  stop_typing: (data: { matchId: string }) => void;
  mark_message_read: (data: { messageId: string; matchId: string }) => void;
}

export interface ServerToClientEvents extends WebSocketEvents {
  // Server sends these events to clients
}

export interface InterServerEvents {
  // Events between server instances (for scaling)
}

export interface SocketData {
  userId?: string;
  username?: string;
  currentRole?: string;
  authenticatedAt?: Date;
}
