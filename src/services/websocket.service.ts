import { Server, Socket } from "socket.io";
import { PrismaClient } from "@prisma/client";
import { JwtService } from "../utils/jwt";
import {
  WebSocketUser,
  ChatRoom,
  TypingIndicator,
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "../types/websocket.types";

const prisma = new PrismaClient();

export class WebSocketService {
  private static io: Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >;
  private static connectedUsers = new Map<string, WebSocketUser>();
  private static chatRooms = new Map<string, ChatRoom>();
  private static typingUsers = new Map<string, TypingIndicator[]>();

  static initialize(
    io: Server<
      ClientToServerEvents,
      ServerToClientEvents,
      InterServerEvents,
      SocketData
    >
  ) {
    this.io = io;
    this.setupEventHandlers();
    console.log("WebSocket service initialized");
  }

  private static setupEventHandlers() {
    this.io.on(
      "connection",
      (
        socket: Socket<
          ClientToServerEvents,
          ServerToClientEvents,
          InterServerEvents,
          SocketData
        >
      ) => {
        console.log(`Socket connected: ${socket.id}`);

        // Handle authentication
        socket.on("authenticate", async (data) => {
          try {
            const { token } = data;
            const decoded = JwtService.verifyAccessToken(token) as {
              userId: string;
            };

            // Get user details from database
            const user = await prisma.user.findUnique({
              where: { id: decoded.userId },
              select: {
                id: true,
                username: true,
                currentRole: true,
                isVerified: true,
              },
            });

            if (!user || !user.isVerified) {
              socket.emit("unauthorized", {
                message: "Invalid or unverified user",
              });
              socket.disconnect();
              return;
            }

            // Store user data in socket
            socket.data.userId = user.id;
            socket.data.username = user.username;
            socket.data.currentRole = user.currentRole;
            socket.data.authenticatedAt = new Date();

            // Add to connected users
            const webSocketUser: WebSocketUser = {
              userId: user.id,
              socketId: socket.id,
              username: user.username,
              currentRole: user.currentRole,
              isOnline: true,
              lastSeen: new Date(),
            };

            this.connectedUsers.set(socket.id, webSocketUser);

            // Notify others about user coming online
            socket.broadcast.emit("user_online", {
              userId: user.id,
              isOnline: true,
            });

            console.log(`User authenticated: ${user.username} (${user.id})`);
          } catch (error) {
            console.error("Authentication error:", error);
            socket.emit("unauthorized", { message: "Invalid token" });
            socket.disconnect();
          }
        });

        // Handle joining chat rooms
        socket.on("join_chat", async (data) => {
          try {
            const { matchId } = data;
            const userId = socket.data.userId;

            if (!userId) {
              socket.emit("error", { message: "Not authenticated" });
              return;
            }

            // Verify user is participant in this chat
            const participant = await prisma.chatParticipant.findFirst({
              where: { matchId, userId },
            });

            if (!participant) {
              socket.emit("error", {
                message: "Not authorized to join this chat",
              });
              return;
            }

            // Join the socket room
            socket.join(matchId);

            // Add to chat room tracking
            const user = this.connectedUsers.get(socket.id);
            if (user) {
              let chatRoom = this.chatRooms.get(matchId);
              if (!chatRoom) {
                chatRoom = {
                  matchId,
                  participants: [],
                  createdAt: new Date(),
                };
                this.chatRooms.set(matchId, chatRoom);
              }

              // Add user to room if not already present
              const existingParticipant = chatRoom.participants.find(
                (p) => p.userId === userId
              );
              if (!existingParticipant) {
                chatRoom.participants.push(user);
              }

              // Notify others in the room
              socket.to(matchId).emit("user_joined_chat", { matchId, user });
            }

            console.log(`User ${userId} joined chat ${matchId}`);
          } catch (error) {
            console.error("Error joining chat:", error);
            socket.emit("error", { message: "Failed to join chat" });
          }
        });

        // Handle leaving chat rooms
        socket.on("leave_chat", (data) => {
          const { matchId } = data;
          const userId = socket.data.userId;

          if (!userId) return;

          socket.leave(matchId);

          // Remove from chat room tracking
          const chatRoom = this.chatRooms.get(matchId);
          if (chatRoom) {
            chatRoom.participants = chatRoom.participants.filter(
              (p) => p.userId !== userId
            );

            // Notify others in the room
            socket.to(matchId).emit("user_left_chat", { matchId, userId });

            // Clean up empty rooms
            if (chatRoom.participants.length === 0) {
              this.chatRooms.delete(matchId);
            }
          }

          console.log(`User ${userId} left chat ${matchId}`);
        });

        // Handle typing indicators
        socket.on("start_typing", (data) => {
          const { matchId } = data;
          const userId = socket.data.userId;
          const username = socket.data.username;

          if (!userId || !username) return;

          const typingIndicator: TypingIndicator = {
            matchId,
            userId,
            username,
            isTyping: true,
            timestamp: new Date(),
          };

          // Add to typing users
          let typingInRoom = this.typingUsers.get(matchId) || [];
          typingInRoom = typingInRoom.filter((t) => t.userId !== userId);
          typingInRoom.push(typingIndicator);
          this.typingUsers.set(matchId, typingInRoom);

          // Broadcast to others in the room
          socket.to(matchId).emit("user_typing", typingIndicator);

          // Auto-stop typing after 3 seconds
          setTimeout(() => {
            this.stopTyping(socket, matchId, userId);
          }, 3000);
        });

        socket.on("stop_typing", (data) => {
          const { matchId } = data;
          const userId = socket.data.userId;

          if (!userId) return;

          this.stopTyping(socket, matchId, userId);
        });

        // Handle message read receipts
        socket.on("mark_message_read", async (data) => {
          try {
            const { messageId, matchId } = data;
            const userId = socket.data.userId;

            if (!userId) return;

            // Update message read status in database (you might want to add a MessageRead table)
            // For now, just broadcast the read receipt
            socket.to(matchId).emit("message_read", {
              messageId,
              matchId,
              readAt: new Date(),
              readBy: userId,
            });
          } catch (error) {
            console.error("Error marking message as read:", error);
          }
        });

        // Handle disconnection
        socket.on("disconnect", () => {
          const user = this.connectedUsers.get(socket.id);

          if (user) {
            // Remove from connected users
            this.connectedUsers.delete(socket.id);

            // Remove from all chat rooms
            this.chatRooms.forEach((room, matchId) => {
              room.participants = room.participants.filter(
                (p) => p.socketId !== socket.id
              );

              // Notify others in the room
              socket.to(matchId).emit("user_left_chat", {
                matchId,
                userId: user.userId,
              });

              // Clean up empty rooms
              if (room.participants.length === 0) {
                this.chatRooms.delete(matchId);
              }
            });

            // Remove from typing indicators
            this.typingUsers.forEach((typingList, matchId) => {
              const filtered = typingList.filter(
                (t) => t.userId !== user.userId
              );
              if (filtered.length !== typingList.length) {
                this.typingUsers.set(matchId, filtered);
                // Notify that user stopped typing
                socket.to(matchId).emit("typing_stop", {
                  matchId,
                  userId: user.userId,
                });
              }
            });

            // Notify others about user going offline
            socket.broadcast.emit("user_online", {
              userId: user.userId,
              isOnline: false,
            });

            console.log(`User disconnected: ${user.username} (${user.userId})`);
          }
        });
      }
    );
  }

  private static stopTyping(socket: Socket, matchId: string, userId: string) {
    // Remove from typing users
    let typingInRoom = this.typingUsers.get(matchId) || [];
    const wasTyping = typingInRoom.some((t) => t.userId === userId);

    if (wasTyping) {
      typingInRoom = typingInRoom.filter((t) => t.userId !== userId);
      this.typingUsers.set(matchId, typingInRoom);

      // Broadcast stop typing
      socket.to(matchId).emit("typing_stop", { matchId, userId });
    }
  }

  // Public methods for other services to use
  static broadcastNewMessage(matchId: string, message: any) {
    if (this.io) {
      this.io.to(matchId).emit("new_message", message);

      // Send delivery confirmation to sender
      const senderSocket = Array.from(this.connectedUsers.values()).find(
        (user) => user.userId === message.senderId
      );

      if (senderSocket) {
        this.io.to(senderSocket.socketId).emit("message_delivered", {
          messageId: message.id,
          matchId,
          deliveredAt: new Date(),
        });
      }
    }
  }

  static broadcastChatUnlocked(matchId: string, unlockedAt: Date) {
    if (this.io) {
      this.io.to(matchId).emit("chat_unlocked", { matchId, unlockedAt });
    }
  }

  static broadcastChatInvitation(userId: string, invitation: any) {
    if (this.io) {
      const userSocket = Array.from(this.connectedUsers.values()).find(
        (user) => user.userId === userId
      );

      if (userSocket) {
        this.io.to(userSocket.socketId).emit("chat_invitation", invitation);
      }
    }
  }

  static getConnectedUsers(): WebSocketUser[] {
    return Array.from(this.connectedUsers.values());
  }

  static getChatRooms(): ChatRoom[] {
    return Array.from(this.chatRooms.values());
  }

  static isUserOnline(userId: string): boolean {
    return Array.from(this.connectedUsers.values()).some(
      (user) => user.userId === userId
    );
  }

  static getUsersInChat(matchId: string): WebSocketUser[] {
    const chatRoom = this.chatRooms.get(matchId);
    return chatRoom ? chatRoom.participants : [];
  }

  static getUserIdsInChat(matchId: string): string[] {
    return this.getUsersInChat(matchId).map(user => user.userId);
  }
}
