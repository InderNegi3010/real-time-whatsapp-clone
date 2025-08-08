import express from "express";
import http from "http";
import { Server as IOServer } from "socket.io";
import cors from "cors";
import bodyParser from "body-parser";
import apiRoutes from "./routes/api.js";
import connectDB from "./config/db.js";
import dotenv from "dotenv";

dotenv.config();
connectDB(); // ✅ Single DB connection

const app = express();
const server = http.createServer(app);

// Enhanced Socket.io configuration
const io = new IOServer(server, {
  cors: { 
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// Enhanced CORS middleware
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5173",
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Body parser middleware with enhanced limits
app.use(bodyParser.json({ 
  limit: "10mb",
  extended: true 
}));
app.use(bodyParser.urlencoded({ 
  limit: "10mb", 
  extended: true 
}));

// Request logging middleware (for development)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// Attach io to req so controllers can emit events
app.use((req, res, next) => { 
  req.io = io; 
  next(); 
});

// Routes
app.use("/api", apiRoutes);

// Health check route
app.get("/", (req, res) => {
  res.json({
    status: "success",
    message: "WhatsApp clone backend running",
    timestamp: new Date().toISOString(),
    version: "1.0.0"
  });
});

// Socket connection handling
io.on("connection", (socket) => {
  console.log(`✅ Socket connected: ${socket.id} at ${new Date().toISOString()}`);
  
  // Handle user joining specific chat rooms
  socket.on("join_chat", (wa_id) => {
    const roomName = `chat_${wa_id}`;
    socket.join(roomName);
    console.log(`👤 Socket ${socket.id} joined room: ${roomName}`);
    
    // Notify other users in the room about the join
    socket.to(roomName).emit("user_joined", {
      userId: socket.id,
      wa_id: wa_id,
      timestamp: new Date()
    });
  });

  // Handle user leaving chat rooms
  socket.on("leave_chat", (wa_id) => {
    const roomName = `chat_${wa_id}`;
    socket.leave(roomName);
    console.log(`👋 Socket ${socket.id} left room: ${roomName}`);
    
    // Notify other users in the room about the leave
    socket.to(roomName).emit("user_left", {
      userId: socket.id,
      wa_id: wa_id,
      timestamp: new Date()
    });
  });

  // Handle typing indicators
  socket.on("typing_start", (data) => {
    const { wa_id, userName } = data;
    const roomName = `chat_${wa_id}`;
    socket.to(roomName).emit("user_typing", {
      userId: socket.id,
      wa_id: wa_id,
      userName: userName || "Someone",
      isTyping: true,
      timestamp: new Date()
    });
  });

  socket.on("typing_stop", (data) => {
    const { wa_id, userName } = data;
    const roomName = `chat_${wa_id}`;
    socket.to(roomName).emit("user_typing", {
      userId: socket.id,
      wa_id: wa_id,
      userName: userName || "Someone",
      isTyping: false,
      timestamp: new Date()
    });
  });

  // Handle online/offline status
  socket.on("user_online", (wa_id) => {
    socket.broadcast.emit("user_status_change", {
      wa_id: wa_id,
      status: "online",
      lastSeen: new Date()
    });
  });

  socket.on("user_offline", (wa_id) => {
    socket.broadcast.emit("user_status_change", {
      wa_id: wa_id,
      status: "offline",
      lastSeen: new Date()
    });
  });

  // Handle message read receipts
  socket.on("message_read", (data) => {
    const { wa_id, messageIds } = data;
    const roomName = `chat_${wa_id}`;
    
    // Emit read receipt to the sender
    socket.to(roomName).emit("messages_read", {
      wa_id: wa_id,
      messageIds: messageIds,
      readBy: socket.id,
      timestamp: new Date()
    });
  });

  // Handle connection errors
  socket.on("connect_error", (error) => {
    console.error(`❌ Socket connection error for ${socket.id}:`, error);
  });

  // Handle socket disconnection
  socket.on("disconnect", (reason) => {
    console.log(`❌ Socket disconnected: ${socket.id} - Reason: ${reason} at ${new Date().toISOString()}`);
    
    // Notify all rooms that this user has gone offline
    socket.broadcast.emit("user_disconnected", {
      userId: socket.id,
      timestamp: new Date(),
      reason: reason
    });
  });

  // Handle ping-pong for connection health
  socket.on("ping", () => {
    socket.emit("pong");
  });

  // Error handling for socket events
  socket.on("error", (error) => {
    console.error(`❌ Socket error for ${socket.id}:`, error);
  });
});

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error(`❌ Global error handler:`, err);
  
  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(err.status || 500).json({
    success: false,
    message: isDevelopment ? err.message : 'Internal server error',
    ...(isDevelopment && { stack: err.stack })
  });
});

// Handle 404 routes
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  
  server.close((err) => {
    if (err) {
      console.error('❌ Error during server close:', err);
      process.exit(1);
    }
    
    console.log('✅ Server closed successfully');
    process.exit(0);
  });
  
  // Force close after 10 seconds
  setTimeout(() => {
    console.error('❌ Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Uncaught exception handling
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

// Start server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/`);
  console.log(`📡 Socket.io ready for connections`);
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
});