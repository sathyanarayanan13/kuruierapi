import { Request, Response, RequestHandler } from 'express';
import { PrismaClient } from '@prisma/client';
import { ApiResponse } from '../utils/response';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const prisma = new PrismaClient();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (_req, file, cb) => {
    let uploadDir = 'uploads/chat';
    
    // Create specific directories based on file type
    if (file.mimetype?.startsWith('image/')) {
      uploadDir = 'uploads/chat/images';
    } else if (file.mimetype?.startsWith('audio/')) {
      uploadDir = 'uploads/chat/voice';
    } else {
      uploadDir = 'uploads/chat/files';
    }
    
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname || '');
    cb(null, `chat-${uniqueSuffix}${extension}`);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Allow images, documents, and audio files
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/webm'
    ];
    
    if (allowedTypes.includes(file.mimetype || '')) {
      cb(null, true);
    } else {
      cb(null, true); // Accept for React Native compatibility
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

const uploadMiddleware = upload.single('file');

export class ChatController {
  // Get predefined messages for chat
  static getPredefinedMessages: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const user = await prisma.user.findUnique({ where: { id: userId } });
      
      if (!user) {
        res.status(404).json(ApiResponse.notFound('User not found'));
        return;
      }

      const predefinedMessages = {
        SHIPMENT_OWNER: [
          "Hi! I've document.",
          "Hi! I've snacks.",
          "Hi! I've snacks.",
          "Hi! I've cloths.",
          "Hi! I've cloths.",
          "<200g",
          "<250g",
          "<500g",
          "<1kg",
        ],
        TRAVELLER: [
          "I am ready to accept.",
          "Available!",
          "I accept only snacks.",
          "I accept only document.",
          "I accept only cloths.",
          "<200g",
          "<500g",
          "<1kg"
        ]
      };

      res.json(ApiResponse.success({
        messages: predefinedMessages[user.currentRole] || []
      }));
    } catch (error) {
      res.status(500).json(ApiResponse.serverError());
    }
  }

  // Initiate chat between shipment owner and traveller
  static initiateChat: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { shipmentId, tripId } = req.body;

      if (!shipmentId || !tripId) {
        res.status(400).json(ApiResponse.error('Shipment ID and Trip ID are required'));
        return;
      }

      // Check if match already exists
      let match = await prisma.shipmentTravelMatch.findFirst({
        where: { shipmentId, tripId }
      });

      if (!match) {
        // Create new match
        match = await prisma.shipmentTravelMatch.create({
          data: { shipmentId, tripId }
        });
      }

      // Check if chat access already exists
      let chatAccess = await prisma.shipmentChatAccess.findFirst({
        where: { matchId: match.id }
      });

      if (!chatAccess) {
        // Create chat access
        chatAccess = await prisma.shipmentChatAccess.create({
          data: {
            shipmentId,
            tripId,
            matchId: match.id
          }
        });

        // Add participants
        const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
        const trip = await prisma.trip.findUnique({ where: { id: tripId } });

        if (shipment && trip) {
          await prisma.chatParticipant.createMany({
            data: [
              {
                matchId: match.id,
                userId: shipment.userId,
                roleInChat: 'SHIPMENT_OWNER'
              },
              {
                matchId: match.id,
                userId: trip.userId,
                roleInChat: 'SENDER'
              }
            ]
          });
        }
      }

      res.json(ApiResponse.success({
        matchId: match.id,
        chatAccess,
        canSendFreeText: chatAccess.unlockedByPayment
      }));
    } catch (error) {
      res.status(500).json(ApiResponse.serverError());
    }
  }

  // Send message in chat
  static sendMessage: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    uploadMiddleware(req, res, async (err) => {
      if (err) {
        res.status(400).json(ApiResponse.error(err.message));
        return;
      }

      try {
        const userId = (req as any).user?.userId;
        const { matchId, messageContent, messageType = 'TEXT', isPredefined = false } = req.body;

        if (!matchId || !messageContent) {
          res.status(400).json(ApiResponse.error('Match ID and message content are required'));
          return;
        }

        // Check if user is participant in this chat
        const participant = await prisma.chatParticipant.findFirst({
          where: { matchId, userId }
        });

        if (!participant) {
          res.status(403).json(ApiResponse.forbidden('You are not a participant in this chat'));
          return;
        }

        // Check chat access permissions
        const chatAccess = await prisma.shipmentChatAccess.findFirst({
          where: { matchId }
        });

        if (!chatAccess) {
          res.status(404).json(ApiResponse.notFound('Chat access not found'));
          return;
        }

        // If chat is not unlocked and message is not predefined, restrict access
        if (!chatAccess.unlockedByPayment && !isPredefined) {
          res.status(403).json(ApiResponse.forbidden('Chat is locked. Use predefined messages or unlock with payment.'));
          return;
        }

        let fileUrl = null;
        let fileName = null;
        let fileSize = null;

        if (req.file) {
          // Use the full path from multer which includes the correct subdirectory
          // Convert absolute path to relative URL path
          const relativePath = req.file.path.replace(/\\/g, '/'); // Handle Windows paths
          fileUrl = `/${relativePath}`;
          fileName = req.file.originalname;
          fileSize = req.file.size;
        }

        const message = await prisma.chat.create({
          data: {
            matchId,
            senderId: userId,
            messageType: messageType as any,
            messageContent,
            fileUrl,
            fileName,
            fileSize,
            isPredefined: Boolean(isPredefined)
          },
          include: {
            sender: {
              select: {
                id: true,
                username: true,
                currentRole: true
              }
            }
          }
        });

        res.json(ApiResponse.success(message));
      } catch (error) {
        res.status(500).json(ApiResponse.serverError());
      }
    });
  }

  // Get chat messages
  static getChatMessages: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { matchId } = req.params;
      const { page = 1, limit = 50 } = req.query;

      // Check if user is participant
      const participant = await prisma.chatParticipant.findFirst({
        where: { matchId, userId }
      });

      if (!participant) {
        res.status(403).json(ApiResponse.forbidden('You are not a participant in this chat'));
        return;
      }

      const skip = (Number(page) - 1) * Number(limit);

      const messages = await prisma.chat.findMany({
        where: { matchId },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              currentRole: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit)
      });

      // Process messages to ensure correct file URLs based on message type
      const processedMessages = messages.map(message => {
        if (message.fileUrl && message.messageType !== 'TEXT') {
          // Ensure the fileUrl has the correct path structure
          let correctedFileUrl = message.fileUrl;
          
          // If the fileUrl doesn't already have the correct subdirectory, fix it
          if (message.messageType === 'VOICE_NOTE' && !message.fileUrl.includes('/uploads/chat/voice/')) {
            const filename = path.basename(message.fileUrl);
            correctedFileUrl = `/uploads/chat/voice/${filename}`;
          } else if (message.messageType === 'IMAGE' && !message.fileUrl.includes('/uploads/chat/images/')) {
            const filename = path.basename(message.fileUrl);
            correctedFileUrl = `/uploads/chat/images/${filename}`;
          } else if (message.messageType === 'FILE' && !message.fileUrl.includes('/uploads/chat/files/')) {
            const filename = path.basename(message.fileUrl);
            correctedFileUrl = `/uploads/chat/files/${filename}`;
          }
          
          return {
            ...message,
            fileUrl: correctedFileUrl
          };
        }
        return message;
      });

      const chatAccess = await prisma.shipmentChatAccess.findFirst({
        where: { matchId }
      });

      res.json(ApiResponse.success({
        messages: processedMessages.reverse(),
        chatAccess,
        canSendFreeText: chatAccess?.unlockedByPayment || false
      }));
    } catch (error) {
      res.status(500).json(ApiResponse.serverError());
    }
  }

  // Process payment to unlock chat
  static unlockChat: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { matchId, amount } = req.body;

      if (!matchId || !amount) {
        res.status(400).json(ApiResponse.error('Match ID and amount are required'));
        return;
      }

      // Get match details
      const match = await prisma.shipmentTravelMatch.findUnique({
        where: { id: matchId },
        include: { shipment: true }
      });

      if (!match) {
        res.status(404).json(ApiResponse.notFound('Match not found'));
        return;
      }

      // Check if user is the shipment owner
      if (match.shipment.userId !== userId) {
        res.status(403).json(ApiResponse.forbidden('Only shipment owner can unlock chat'));
        return;
      }

      // Create payment record
      const payment = await prisma.chatPayment.create({
        data: {
          userId,
          shipmentId: match.shipmentId,
          matchId,
          amount: Number(amount),
          paymentStatus: 'PAID' // In real app, integrate with payment gateway
        }
      });

      // Update chat access
      await prisma.shipmentChatAccess.update({
        where: { matchId },
        data: {
          unlockedByPayment: true,
          unlockedAt: new Date()
        }
      });

      res.json(ApiResponse.success({
        payment,
        message: 'Chat unlocked successfully'
      }));
    } catch (error) {
      res.status(500).json(ApiResponse.serverError());
    }
  }

  // Get user's chat list
  static getUserChats: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;

      const chats = await prisma.chatParticipant.findMany({
        where: { userId },
        include: {
          match: {
            include: {
              shipment: {
                include: {
                  user: {
                    select: {
                      id: true,
                      username: true,
                      currentRole: true
                    }
                  }
                }
              },
              trip: {
                include: {
                  user: {
                    select: {
                      id: true,
                      username: true,
                      currentRole: true
                    }
                  }
                }
              },
              chatAccess: true,
              chats: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                include: {
                  sender: {
                    select: {
                      id: true,
                      username: true
                    }
                  }
                }
              }
            }
          }
        },
        orderBy: { joinedAt: 'desc' }
      });

      // Process the last message in each chat to ensure correct file URLs
      const processedChats = chats.map(chat => {
        if (chat.match.chats.length > 0) {
          const lastMessage = chat.match.chats[0];
          if (lastMessage.fileUrl && lastMessage.messageType !== 'TEXT') {
            let correctedFileUrl = lastMessage.fileUrl;
            
            if (lastMessage.messageType === 'VOICE_NOTE' && !lastMessage.fileUrl.includes('/uploads/chat/voice/')) {
              const filename = path.basename(lastMessage.fileUrl);
              correctedFileUrl = `/uploads/chat/voice/${filename}`;
            } else if (lastMessage.messageType === 'IMAGE' && !lastMessage.fileUrl.includes('/uploads/chat/images/')) {
              const filename = path.basename(lastMessage.fileUrl);
              correctedFileUrl = `/uploads/chat/images/${filename}`;
            } else if (lastMessage.messageType === 'FILE' && !lastMessage.fileUrl.includes('/uploads/chat/files/')) {
              const filename = path.basename(lastMessage.fileUrl);
              correctedFileUrl = `/uploads/chat/files/${filename}`;
            }
            
            return {
              ...chat,
              match: {
                ...chat.match,
                chats: [{
                  ...lastMessage,
                  fileUrl: correctedFileUrl
                }]
              }
            };
          }
        }
        return chat;
      });

      res.json(ApiResponse.success(processedChats));
    } catch (error) {
      res.status(500).json(ApiResponse.serverError());
    }
  }

  // Invite user to group chat
  static inviteToChat: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { matchId, inviteeId } = req.body;

      if (!matchId || !inviteeId) {
        res.status(400).json(ApiResponse.error('Match ID and invitee ID are required'));
        return;
      }

      // Check if user is participant
      const participant = await prisma.chatParticipant.findFirst({
        where: { matchId, userId }
      });

      if (!participant) {
        res.status(403).json(ApiResponse.forbidden('You are not a participant in this chat'));
        return;
      }

      // Check if invitation already exists
      const existingInvitation = await prisma.chatInvitation.findFirst({
        where: { matchId, inviteeId }
      });

      if (existingInvitation) {
        res.status(400).json(ApiResponse.error('User already invited'));
        return;
      }

      const invitation = await prisma.chatInvitation.create({
        data: {
          matchId,
          inviterId: userId,
          inviteeId
        },
        include: {
          inviter: {
            select: {
              id: true,
              username: true
            }
          },
          invitee: {
            select: {
              id: true,
              username: true
            }
          }
        }
      });

      res.json(ApiResponse.success(invitation));
    } catch (error) {
      res.status(500).json(ApiResponse.serverError());
    }
  }

  // Respond to chat invitation
  static respondToInvitation: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { invitationId, status } = req.body;

      if (!invitationId || !status) {
        res.status(400).json(ApiResponse.error('Invitation ID and status are required'));
        return;
      }

      const invitation = await prisma.chatInvitation.findFirst({
        where: { id: invitationId, inviteeId: userId }
      });

      if (!invitation) {
        res.status(404).json(ApiResponse.notFound('Invitation not found'));
        return;
      }

      const updatedInvitation = await prisma.chatInvitation.update({
        where: { id: invitationId },
        data: {
          status: status as any,
          respondedAt: new Date()
        }
      });

      // If accepted, add user as participant
      if (status === 'ACCEPTED') {
        await prisma.chatParticipant.create({
          data: {
            matchId: invitation.matchId,
            userId,
            roleInChat: 'RECEIVER'
          }
        });
      }

      res.json(ApiResponse.success(updatedInvitation));
    } catch (error) {
      res.status(500).json(ApiResponse.serverError());
    }
  }

  // Get user's invitations
  static getUserInvitations: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;

      const invitations = await prisma.chatInvitation.findMany({
        where: { inviteeId: userId },
        include: {
          inviter: {
            select: {
              id: true,
              username: true
            }
          },
          match: {
            include: {
              shipment: {
                select: {
                  id: true,
                  packageType: true,
                  destinationCountry: true
                }
              },
              trip: {
                select: {
                  id: true,
                  fromCountry: true,
                  toCountry: true,
                  departureDate: true
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json(ApiResponse.success(invitations));
    } catch (error) {
      res.status(500).json(ApiResponse.serverError());
    }
  }
}