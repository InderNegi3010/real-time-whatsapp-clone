import express from "express";
import Message from "../models/Message.js";

const router = express.Router();

/**
 * Webhook endpoint — accept incoming payloads exactly as the sample (or normalized).
 * This will handle new messages and status updates.
 */
router.post("/webhook", async (req, res) => {
  const payload = req.body;
  
  try {
    // Handle new messages
    if (payload.type === "message" || payload.messages) {
      const msgs = payload.messages || [payload];
      const saved = [];
      
      for (const m of msgs) {
        const doc = {
          wa_id: m.wa_id || payload.wa_id || m.from,
          name: m.name || payload.name || `User ${m.wa_id || m.from}`,
          number: m.number || payload.number,
          msg_id: m.id || m.msg_id || m.message_id,
          meta_msg_id: m.meta_msg_id,
          from: m.from || m.sender || "remote",
          to: m.to || "me",
          content: m.text || (m.body && m.body.text) || m.content || "",
          content_type: m.content_type || "text",
          timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
          status: m.status || "sent",
          raw_payload: m
        };
        
        const newMsg = await Message.create(doc);
        saved.push(newMsg);
        
        // Emit to all clients and specific room
        req.io.emit("message:new", newMsg);
        req.io.to(`chat_${newMsg.wa_id}`).emit("message:new", newMsg);
      }
      
      return res.json({ success: true, inserted: saved.length });
    }

    // Handle status updates
    if (payload.type === "status" || payload.status_update) {
      const idToFind = payload.id || payload.msg_id || payload.meta_msg_id;
      const status = payload.status || payload.status_update || "delivered";
      
      if (idToFind) {
        const query = { $or: [{ msg_id: idToFind }, { meta_msg_id: idToFind }] };
        const update = { status };
        const result = await Message.updateMany(query, update);
        
        // Get the updated messages to emit with full data
        const updatedMessages = await Message.find(query);
        updatedMessages.forEach(msg => {
          req.io.emit("message:status_update", { 
            messageId: msg._id, 
            msg_id: msg.msg_id,
            meta_msg_id: msg.meta_msg_id,
            status: status,
            wa_id: msg.wa_id 
          });
          req.io.to(`chat_${msg.wa_id}`).emit("message:status_update", { 
            messageId: msg._id, 
            status: status 
          });
        });
        
        return res.json({ 
          success: true, 
          matched: result.matchedCount, 
          modified: result.modifiedCount 
        });
      }
    }

    // Fallback for unknown payloads
    if (payload.id || payload.message_id) {
      const doc = {
        wa_id: payload.wa_id || payload.from || "unknown",
        name: payload.name || "Unknown User",
        content: JSON.stringify(payload).slice(0, 2000),
        timestamp: new Date(),
        raw_payload: payload
      };
      
      const m = await Message.create(doc);
      req.io.emit("message:new", m);
      return res.json({ success: true });
    }

    return res.status(400).json({ 
      success: false, 
      message: "Unrecognized payload format" 
    });
    
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

/**
 * Get conversations list (grouped by wa_id) with last message preview
 */
router.get("/conversations", async (req, res) => {
  try {
    const agg = await Message.aggregate([
      { $sort: { timestamp: -1 } },
      { 
        $group: {
          _id: "$wa_id",
          lastMessage: { $first: "$content" },
          lastTimestamp: { $first: "$timestamp" },
          lastStatus: { $first: "$status" },
          lastFrom: { $first: "$from" },
          name: { $first: "$name" },
          number: { $first: "$number" },
          unreadCount: {
            $sum: {
              $cond: [
                { $and: [
                  { $eq: ["$from", "remote"] },
                  { $ne: ["$status", "read"] }
                ]},
                1,
                0
              ]
            }
          }
        }
      },
      { $sort: { lastTimestamp: -1 } }
    ]);

    const conversations = agg.map(c => ({
      wa_id: c._id,
      name: c.name || `User ${c._id}`,
      number: c.number,
      lastMessage: c.lastMessage || "",
      lastTimestamp: c.lastTimestamp,
      lastStatus: c.lastStatus,
      lastFrom: c.lastFrom,
      unreadCount: c.unreadCount || 0,
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(c.name || c._id)}&background=25d366&color=fff`
    }));

    res.json(conversations);
  } catch (err) {
    console.error("Error fetching conversations:", err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

/**
 * Get messages for a specific conversation
 */
router.get("/messages/:wa_id", async (req, res) => {
  try {
    const { wa_id } = req.params;
    const { page = 1, limit = 50 } = req.query;
    
    const skip = (page - 1) * limit;
    
    const messages = await Message.find({ wa_id })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .lean();
    
    // Reverse to get chronological order (oldest first)
    const chronologicalMessages = messages.reverse().map(msg => ({
      ...msg,
      avatar: msg.from === "me" ? null : `https://ui-avatars.com/api/?name=${encodeURIComponent(msg.name || msg.wa_id)}&background=25d366&color=fff`
    }));
    
    // Mark messages as read when fetched
    await Message.updateMany(
      { wa_id, from: "remote", status: { $ne: "read" } },
      { status: "read" }
    );
    
    res.json(chronologicalMessages);
  } catch (err) {
    console.error("Error fetching messages:", err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

/**
 * Send a new message - Fixed endpoint name to match frontend expectation
 */
router.post("/messages", async (req, res) => {
  try {
    const { wa_id, name, number, content, content_type = "text" } = req.body;
    
    if (!wa_id || !content) {
      return res.status(400).json({ 
        success: false, 
        message: "wa_id and content are required" 
      });
    }

    const doc = {
      wa_id,
      name: name || `User ${wa_id}`,
      number,
      from: "me",
      to: wa_id,
      content: content.trim(),
      content_type,
      timestamp: new Date(),
      status: "sent",
      msg_id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      raw_payload: req.body
    };

    const newMessage = await Message.create(doc);
    
    // Emit to all clients and specific room
    req.io.emit("message:new", newMessage);
    req.io.to(`chat_${wa_id}`).emit("message:new", newMessage);
    
    // Simulate message delivery after a short delay
    setTimeout(async () => {
      try {
        await Message.findByIdAndUpdate(newMessage._id, { status: "delivered" });
        const deliveredMessage = { 
          messageId: newMessage._id, 
          msg_id: newMessage.msg_id,
          status: "delivered",
          wa_id: newMessage.wa_id
        };
        req.io.emit("message:status_update", deliveredMessage);
        req.io.to(`chat_${wa_id}`).emit("message:status_update", deliveredMessage);
      } catch (err) {
        console.error("Error updating message status:", err);
      }
    }, 1000);

    res.json({ 
      success: true, 
      message: newMessage 
    });
    
  } catch (err) {
    console.error("Send message error:", err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

/**
 * Mark messages as read
 */
router.patch("/messages/:wa_id/read", async (req, res) => {
  try {
    const { wa_id } = req.params;
    
    const result = await Message.updateMany(
      { wa_id, from: "remote", status: { $in: ["sent", "delivered"] } },
      { status: "read" }
    );
    
    // Emit read status update
    const updatedMessages = await Message.find({ 
      wa_id, 
      from: "remote", 
      status: "read" 
    });
    
    updatedMessages.forEach(msg => {
      req.io.emit("message:status_update", { 
        messageId: msg._id, 
        msg_id: msg.msg_id,
        status: "read",
        wa_id: msg.wa_id
      });
    });
    
    res.json({ 
      success: true, 
      updated: result.modifiedCount 
    });
    
  } catch (err) {
    console.error("Error marking messages as read:", err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

/**
 * Delete a message
 */
router.delete("/messages/:messageId", async (req, res) => {
  try {
    const { messageId } = req.params;
    
    const deletedMessage = await Message.findByIdAndDelete(messageId);
    
    if (!deletedMessage) {
      return res.status(404).json({ 
        success: false, 
        message: "Message not found" 
      });
    }
    
    // Emit deletion event
    req.io.emit("message:deleted", { 
      messageId: deletedMessage._id,
      wa_id: deletedMessage.wa_id 
    });
    
    res.json({ 
      success: true, 
      message: "Message deleted successfully" 
    });
    
  } catch (err) {
    console.error("Error deleting message:", err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

/**
 * Get conversation info
 */
router.get("/conversations/:wa_id/info", async (req, res) => {
  try {
    const { wa_id } = req.params;
    
    const conversation = await Message.findOne({ wa_id })
      .sort({ timestamp: -1 })
      .select('name number wa_id')
      .lean();
    
    if (!conversation) {
      return res.status(404).json({ 
        success: false, 
        message: "Conversation not found" 
      });
    }
    
    const messageCount = await Message.countDocuments({ wa_id });
    
    res.json({
      success: true,
      conversation: {
        wa_id: conversation.wa_id,
        name: conversation.name || `User ${conversation.wa_id}`,
        number: conversation.number,
        messageCount,
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(conversation.name || conversation.wa_id)}&background=25d366&color=fff`
      }
    });
    
  } catch (err) {
    console.error("Error fetching conversation info:", err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

export default router;