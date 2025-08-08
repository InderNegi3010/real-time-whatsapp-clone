// Enhanced script to process sample payloads
// Usage: node scripts/process_payloads.js ./sample_payloads [--clean] [--verbose]

import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import Message from "../models/Message.js";
import dotenv from "dotenv";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

// Command line arguments
const args = process.argv.slice(2);
const folder = args[0];
const shouldClean = args.includes('--clean');
const verbose = args.includes('--verbose');

// Statistics tracking
const stats = {
  totalFiles: 0,
  processedFiles: 0,
  skippedFiles: 0,
  insertedMessages: 0,
  updatedMessages: 0,
  errors: 0,
  duplicates: 0
};

// Logging utility
const log = (message, level = 'info') => {
  const timestamp = new Date().toISOString();
  const prefix = {
    'info': '📝',
    'success': '✅',
    'error': '❌',
    'warning': '⚠️',
    'debug': '🔍'
  }[level] || '📝';
  
  console.log(`${prefix} [${timestamp}] ${message}`);
  
  if (level === 'debug' && !verbose) return;
};

// Enhanced payload processing function
async function processPayload(payload, filename) {
  const results = { inserted: 0, updated: 0, errors: 0, duplicates: 0 };
  
  try {
    // Handle different payload types
    if (payload.messages || payload.type === "message" || payload.message) {
      await processMessages(payload, filename, results);
    } 
    else if (payload.type === "status" || payload.status_update || payload.statuses) {
      await processStatusUpdates(payload, filename, results);
    }
    else if (payload.contacts) {
      await processContacts(payload, filename, results);
    }
    else if (Array.isArray(payload)) {
      // Handle array of payloads
      for (const item of payload) {
        await processPayload(item, filename);
      }
    }
    else {
      // Try to process as a single message
      await processSingleMessage(payload, filename, results);
    }
  } catch (error) {
    log(`Error processing payload from ${filename}: ${error.message}`, 'error');
    results.errors++;
  }
  
  return results;
}

// Process messages
async function processMessages(payload, filename, results) {
  const messages = payload.messages || [payload.message || payload];
  
  for (const msg of messages) {
    try {
      // Check for duplicates first
      const existingMessage = await findExistingMessage(msg);
      if (existingMessage) {
        if (verbose) log(`Duplicate message found, skipping: ${msg.id || msg.msg_id}`, 'debug');
        results.duplicates++;
        continue;
      }
      
      const doc = createMessageDocument(msg, payload, filename);
      const newMessage = await Message.create(doc);
      
      results.inserted++;
      if (verbose) {
        log(`Inserted message: ${filename} -> ${newMessage.wa_id} (${newMessage.msg_id || newMessage._id})`, 'debug');
      }
      
    } catch (error) {
      log(`Error inserting message from ${filename}: ${error.message}`, 'error');
      results.errors++;
    }
  }
}

// Process status updates
async function processStatusUpdates(payload, filename, results) {
  try {
    const statuses = payload.statuses || [payload];
    
    for (const statusUpdate of statuses) {
      const idToFind = statusUpdate.id || statusUpdate.msg_id || statusUpdate.meta_msg_id || payload.id;
      const status = statusUpdate.status || statusUpdate.status_update || payload.status || "delivered";
      
      if (!idToFind) {
        log(`No message ID found in status update from ${filename}`, 'warning');
        continue;
      }
      
      const query = { 
        $or: [
          { msg_id: idToFind }, 
          { meta_msg_id: idToFind },
          { _id: mongoose.Types.ObjectId.isValid(idToFind) ? idToFind : null }
        ].filter(q => q._id !== null)
      };
      
      const updateResult = await Message.updateMany(query, { 
        status,
        ...(status === 'read' && { read_at: new Date() }),
        ...(status === 'delivered' && { delivered_at: new Date() })
      });
      
      results.updated += updateResult.modifiedCount;
      
      if (verbose) {
        log(`Status update ${filename}: ${idToFind} -> ${status} (modified: ${updateResult.modifiedCount})`, 'debug');
      }
    }
  } catch (error) {
    log(`Error processing status update from ${filename}: ${error.message}`, 'error');
    results.errors++;
  }
}

// Process contacts (for future use)
async function processContacts(payload, filename, results) {
  // This could be used to update user names/info
  log(`Contact processing not implemented yet for ${filename}`, 'warning');
}

// Process single message (fallback)
async function processSingleMessage(payload, filename, results) {
  try {
    // Check if it looks like a message
    if (payload.id || payload.message_id || payload.content || payload.text) {
      const existingMessage = await findExistingMessage(payload);
      if (existingMessage) {
        results.duplicates++;
        return;
      }
      
      const doc = createMessageDocument(payload, payload, filename);
      await Message.create(doc);
      results.inserted++;
      
      if (verbose) {
        log(`Inserted single message from ${filename}`, 'debug');
      }
    } else {
      log(`Unknown payload format in ${filename}, skipping`, 'warning');
      results.errors++;
    }
  } catch (error) {
    log(`Error processing single message from ${filename}: ${error.message}`, 'error');
    results.errors++;
  }
}

// Create message document with enhanced field mapping
function createMessageDocument(msg, payload, filename) {
  const now = new Date();
  
  return {
    // Core identifiers
    wa_id: msg.wa_id || msg.from || payload.wa_id || payload.from || "unknown",
    name: msg.name || payload.name || msg.profile?.name || `User ${msg.wa_id || msg.from || 'unknown'}`,
    number: msg.number || payload.number || msg.profile?.phone,
    
    // Message IDs
    msg_id: msg.id || msg.msg_id || msg.message_id,
    meta_msg_id: msg.meta_msg_id || msg.wamid,
    
    // Direction and participants
    from: determineMessageDirection(msg, payload),
    to: msg.to || payload.to || "me",
    
    // Content
    content: extractMessageContent(msg),
    content_type: msg.type || msg.content_type || determineContentType(msg),
    
    // Media information
    ...(msg.image && { 
      media_url: msg.image.link || msg.image.url,
      media_mime_type: msg.image.mime_type,
      content_type: 'image'
    }),
    ...(msg.audio && { 
      media_url: msg.audio.link || msg.audio.url,
      media_mime_type: msg.audio.mime_type,
      content_type: 'audio'
    }),
    ...(msg.video && { 
      media_url: msg.video.link || msg.video.url,
      media_mime_type: msg.video.mime_type,
      content_type: 'video'
    }),
    ...(msg.document && { 
      media_url: msg.document.link || msg.document.url,
      media_mime_type: msg.document.mime_type,
      content_type: 'document'
    }),
    
    // Timing
    timestamp: parseTimestamp(msg.timestamp || payload.timestamp) || now,
    
    // Status
    status: msg.status || payload.status || "sent",
    
    // Additional fields
    is_forwarded: msg.forwarded || false,
    
    // Reply information
    ...(msg.context?.quoted_message && {
      reply_to_content: msg.context.quoted_message.body?.substring(0, 100)
    }),
    
    // Raw payload for debugging
    raw_payload: {
      original: msg,
      filename: filename,
      processed_at: now
    }
  };
}

// Helper functions
function determineMessageDirection(msg, payload) {
  if (msg.from === "me" || payload.from === "me") return "me";
  if (msg.direction === "outbound" || payload.direction === "outbound") return "me";
  if (msg.sender === "me" || payload.sender === "me") return "me";
  return "remote";
}

function extractMessageContent(msg) {
  // Try different content fields
  return msg.text?.body || 
         msg.body?.text || 
         msg.content || 
         msg.text || 
         msg.caption ||
         (msg.type && msg.type !== 'text' ? `📎 ${msg.type}` : '') ||
         JSON.stringify(msg).substring(0, 1000);
}

function determineContentType(msg) {
  if (msg.image) return 'image';
  if (msg.audio) return 'audio';
  if (msg.video) return 'video';
  if (msg.document) return 'document';
  if (msg.location) return 'location';
  if (msg.contacts) return 'contact';
  if (msg.sticker) return 'sticker';
  return 'text';
}

function parseTimestamp(timestamp) {
  if (!timestamp) return null;
  
  // Handle different timestamp formats
  if (typeof timestamp === 'number') {
    // Unix timestamp (seconds or milliseconds)
    return new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp);
  }
  
  if (typeof timestamp === 'string') {
    return new Date(timestamp);
  }
  
  return new Date(timestamp);
}

async function findExistingMessage(msg) {
  const conditions = [];
  
  if (msg.id) conditions.push({ msg_id: msg.id });
  if (msg.msg_id) conditions.push({ msg_id: msg.msg_id });
  if (msg.meta_msg_id) conditions.push({ meta_msg_id: msg.meta_msg_id });
  if (msg.wamid) conditions.push({ meta_msg_id: msg.wamid });
  
  if (conditions.length === 0) return null;
  
  return await Message.findOne({ $or: conditions });
}

// Main execution function
async function main() {
  log("🚀 Starting payload processing script", 'info');
  
  // Validate arguments
  if (!folder) {
    log("Usage: node process_payloads.js <folder> [--clean] [--verbose]", 'error');
    log("  --clean: Clean existing messages before processing", 'info');
    log("  --verbose: Enable detailed logging", 'info');
    process.exit(1);
  }
  
  if (!fs.existsSync(folder)) {
    log(`Folder does not exist: ${folder}`, 'error');
    process.exit(1);
  }
  
  // Get all JSON files
  const files = fs.readdirSync(folder).filter(f => f.endsWith(".json"));
  stats.totalFiles = files.length;
  
  if (files.length === 0) {
    log(`No JSON files found in ${folder}`, 'warning');
    process.exit(0);
  }
  
  log(`Found ${files.length} JSON files to process`, 'info');
  
  // Connect to MongoDB
  try {
    await mongoose.connect(MONGODB_URI);
    log("Connected to MongoDB", 'success');
  } catch (error) {
    log(`Failed to connect to MongoDB: ${error.message}`, 'error');
    process.exit(1);
  }
  
  // Clean existing data if requested
  if (shouldClean) {
    log("Cleaning existing messages...", 'info');
    const deleteResult = await Message.deleteMany({});
    log(`Deleted ${deleteResult.deletedCount} existing messages`, 'success');
  }
  
  // Process each file
  for (const file of files) {
    const filePath = path.join(folder, file);
    log(`Processing file: ${file}`, 'info');
    
    try {
      const rawData = fs.readFileSync(filePath, "utf8");
      const payload = JSON.parse(rawData);
      
      const results = await processPayload(payload, file);
      
      // Update statistics
      stats.processedFiles++;
      stats.insertedMessages += results.inserted;
      stats.updatedMessages += results.updated;
      stats.errors += results.errors;
      stats.duplicates += results.duplicates;
      
      log(`Completed ${file}: inserted=${results.inserted}, updated=${results.updated}, errors=${results.errors}, duplicates=${results.duplicates}`, 'success');
      
    } catch (error) {
      log(`Failed to process ${file}: ${error.message}`, 'error');
      stats.skippedFiles++;
      stats.errors++;
    }
  }
  
  // Final statistics
  log("\n📊 Processing Complete - Statistics:", 'success');
  log(`📁 Total files: ${stats.totalFiles}`, 'info');
  log(`✅ Processed files: ${stats.processedFiles}`, 'info');
  log(`⏭️  Skipped files: ${stats.skippedFiles}`, 'info');
  log(`💾 Inserted messages: ${stats.insertedMessages}`, 'info');
  log(`🔄 Updated messages: ${stats.updatedMessages}`, 'info');
  log(`🔄 Duplicate messages: ${stats.duplicates}`, 'info');
  log(`❌ Errors: ${stats.errors}`, 'info');
  
  // Close MongoDB connection
  await mongoose.connection.close();
  log("MongoDB connection closed", 'info');
  
  process.exit(stats.errors > 0 ? 1 : 0);
}

// Handle process termination
process.on('SIGINT', async () => {
  log("\n🛑 Process interrupted by user", 'warning');
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
    log("MongoDB connection closed", 'info');
  }
  process.exit(0);
});

process.on('uncaughtException', async (error) => {
  log(`💥 Uncaught exception: ${error.message}`, 'error');
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
  }
  process.exit(1);
});

// Run the main function
main().catch(async (error) => {
  log(`💥 Fatal error: ${error.message}`, 'error');
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
  }
  process.exit(1);
});