import mongoose from "mongoose";

const MessageSchema = new mongoose.Schema({
  // WhatsApp user identifier
  wa_id: { 
    type: String, 
    required: true,
    index: true
  },
  
  // User display information
  name: { 
    type: String,
    default: function() {
      return `User ${this.wa_id}`;
    }
  },
  number: { 
    type: String,
    sparse: true // Allow multiple null values
  },
  
  // Message identifiers
  msg_id: { 
    type: String, 
    index: true,
    sparse: true // Allow multiple null values but index non-null ones
  },
  meta_msg_id: { 
    type: String, 
    index: true,
    sparse: true
  },
  
  // Message direction and participants
  from: { 
    type: String,
    required: true,
    enum: ["me", "remote"],
    default: "remote"
  },
  to: { 
    type: String,
    default: "me"
  },
  
  // Message content
  content: { 
    type: String,
    required: true,
    maxLength: 4096 // Reasonable limit for message content
  },
  content_type: { 
    type: String, 
    default: "text",
    enum: ["text", "image", "audio", "video", "document", "location", "contact", "sticker"]
  },
  
  // Media information (for non-text messages)
  media_url: {
    type: String,
    sparse: true
  },
  media_mime_type: {
    type: String,
    sparse: true
  },
  media_size: {
    type: Number,
    min: 0
  },
  thumbnail_url: {
    type: String,
    sparse: true
  },
  
  // Timing information
  timestamp: { 
    type: Date, 
    default: Date.now, 
    index: true 
  },
  edited_at: {
    type: Date,
    sparse: true
  },
  
  // Message status
  status: { 
    type: String, 
    enum: ["sent", "delivered", "read", "pending", "failed"], 
    default: "sent",
    index: true
  },
  
  // Message flags
  is_deleted: {
    type: Boolean,
    default: false,
    index: true
  },
  is_forwarded: {
    type: Boolean,
    default: false
  },
  is_starred: {
    type: Boolean,
    default: false,
    index: true
  },
  
  // Reply information
  reply_to: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    sparse: true
  },
  reply_to_content: {
    type: String,
    maxLength: 100 // Short preview of original message
  },
  
  // Raw payload for debugging and extensibility
  raw_payload: { 
    type: mongoose.Schema.Types.Mixed,
    select: false // Don't include by default in queries
  },
  
  // Additional metadata
  delivery_attempts: {
    type: Number,
    default: 0,
    min: 0
  },
  error_message: {
    type: String,
    sparse: true
  }
}, { 
  collection: "processed_messages",
  timestamps: true, // Adds createdAt and updatedAt automatically
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      // Clean up the JSON output
      delete ret.__v;
      delete ret.raw_payload;
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// Compound indexes for better query performance
MessageSchema.index({ wa_id: 1, timestamp: -1 }); // For conversation messages
MessageSchema.index({ from: 1, status: 1 }); // For status queries
MessageSchema.index({ wa_id: 1, is_deleted: 1 }); // For active messages
MessageSchema.index({ wa_id: 1, is_starred: 1 }); // For starred messages
MessageSchema.index({ msg_id: 1, meta_msg_id: 1 }); // For webhook updates

// Virtual for formatted timestamp
MessageSchema.virtual('formatted_time').get(function() {
  return this.timestamp.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
});

// Virtual for formatted date
MessageSchema.virtual('formatted_date').get(function() {
  return this.timestamp.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
});

// Virtual for message preview (truncated content)
MessageSchema.virtual('preview').get(function() {
  if (this.content_type !== 'text') {
    return `📎 ${this.content_type}`;
  }
  return this.content.length > 50 ? 
    this.content.substring(0, 50) + '...' : 
    this.content;
});

// Virtual for sender avatar
MessageSchema.virtual('avatar').get(function() {
  if (this.from === 'me') return null;
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(this.name || this.wa_id)}&background=25d366&color=fff`;
});

// Pre-save middleware
MessageSchema.pre('save', function(next) {
  // Generate message ID if not provided
  if (!this.msg_id && !this.meta_msg_id) {
    this.msg_id = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // Set default name if not provided
  if (!this.name && this.wa_id) {
    this.name = `User ${this.wa_id}`;
  }
  
  // Validate content based on type
  if (this.content_type === 'text' && !this.content.trim()) {
    return next(new Error('Text messages cannot be empty'));
  }
  
  next();
});

// Static methods
MessageSchema.statics.getConversations = async function() {
  return this.aggregate([
    { $match: { is_deleted: false } },
    { $sort: { timestamp: -1 } },
    { 
      $group: {
        _id: "$wa_id",
        lastMessage: { $first: "$content" },
        lastMessageType: { $first: "$content_type" },
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
        },
        totalMessages: { $sum: 1 }
      }
    },
    { $sort: { lastTimestamp: -1 } }
  ]);
};

MessageSchema.statics.markAsRead = async function(wa_id) {
  return this.updateMany(
    { 
      wa_id, 
      from: "remote", 
      status: { $in: ["sent", "delivered"] },
      is_deleted: false
    },
    { status: "read" }
  );
};

MessageSchema.statics.getMessagesByConversation = async function(wa_id, options = {}) {
  const {
    page = 1,
    limit = 50,
    before = null, // Message ID to get messages before
    includeDeleted = false
  } = options;
  
  const query = { 
    wa_id,
    ...(includeDeleted ? {} : { is_deleted: false })
  };
  
  // If before is specified, get messages before that timestamp
  if (before) {
    const beforeMessage = await this.findById(before);
    if (beforeMessage) {
      query.timestamp = { $lt: beforeMessage.timestamp };
    }
  }
  
  const skip = (page - 1) * limit;
  
  return this.find(query)
    .populate('reply_to', 'content from name timestamp')
    .sort({ timestamp: -1 })
    .limit(parseInt(limit))
    .skip(skip)
    .lean();
};

// Instance methods
MessageSchema.methods.markAsRead = async function() {
  if (this.from === 'remote' && this.status !== 'read') {
    this.status = 'read';
    return this.save();
  }
  return this;
};

MessageSchema.methods.softDelete = async function() {
  this.is_deleted = true;
  return this.save();
};

MessageSchema.methods.star = async function() {
  this.is_starred = !this.is_starred;
  return this.save();
};

// Add text search index for message content
MessageSchema.index({ 
  content: 'text', 
  name: 'text' 
}, {
  weights: {
    content: 10,
    name: 5
  },
  name: 'message_text_search'
});

export default mongoose.model("Message", MessageSchema);