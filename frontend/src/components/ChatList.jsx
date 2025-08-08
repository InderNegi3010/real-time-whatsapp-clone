import React from "react";

// Helper function to format time
function formatTime(timestamp) {
  if (!timestamp) return "";
  
  const now = new Date();
  const messageDate = new Date(timestamp);
  const diffInHours = Math.abs(now - messageDate) / 36e5;
  
  if (diffInHours < 24) {
    // Show time for messages from today
    return messageDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  } else if (diffInHours < 48) {
    // Show "Yesterday" for messages from yesterday
    return "Yesterday";
  } else {
    // Show date for older messages
    return messageDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  }
}

// Helper function to get message preview
function getMessagePreview(message, contentType, from) {
  if (!message) return "No messages yet";
  
  if (contentType && contentType !== 'text') {
    const mediaIcons = {
      'image': '📷 Photo',
      'video': '🎥 Video',
      'audio': '🎵 Audio',
      'document': '📄 Document',
      'location': '📍 Location',
      'contact': '👤 Contact',
      'sticker': '😄 Sticker'
    };
    return mediaIcons[contentType] || '📎 Media';
  }
  
  const prefix = from === 'me' ? 'You: ' : '';
  return `${prefix}${message}`;
}

export default function ChatList({ conversations, onSelect, active }) {
  return (
    <div className="overflow-y-auto">
      {conversations.map(chat => {
        const isActive = active === chat.wa_id;
        const hasUnread = chat.unreadCount > 0;
        
        return (
          <div
            key={chat.wa_id}
            onClick={() => onSelect(chat.wa_id)}
            className={`p-3 cursor-pointer flex items-center hover:bg-gray-100 transition-colors border-b border-gray-100 ${
              isActive ? "bg-green-100" : ""
            }`}
          >
            {/* Avatar */}
            <div className="relative flex-shrink-0 mr-3">
              <img
                src={chat.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(chat.name || chat.wa_id)}&background=25d366&color=fff`}
                alt={chat.name || chat.wa_id}
                className="w-12 h-12 rounded-full object-cover"
                onError={(e) => {
                  e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(chat.name || chat.wa_id)}&background=25d366&color=fff`;
                }}
              />
              
              {/* Online indicator (for future use) */}
              {/* <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div> */}
            </div>

            {/* Chat Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <h3 className={`font-medium truncate ${
                  hasUnread ? "text-gray-900" : "text-gray-800"
                }`}>
                  {chat.name || chat.number || chat.wa_id}
                </h3>
                
                <div className="flex items-center ml-2 flex-shrink-0">
                  <span className={`text-xs ${
                    hasUnread ? "text-green-600 font-medium" : "text-gray-500"
                  }`}>
                    {formatTime(chat.lastTimestamp)}
                  </span>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <p className={`text-sm truncate mr-2 ${
                  hasUnread ? "text-gray-900 font-medium" : "text-gray-600"
                }`}>
                  {getMessagePreview(chat.lastMessage, chat.lastMessageType, chat.lastFrom)}
                </p>
                
                <div className="flex items-center ml-2 flex-shrink-0">
                  {/* Message status indicator for sent messages */}
                  {chat.lastFrom === 'me' && (
                    <div className="mr-2">
                      {chat.lastStatus === 'sent' && (
                        <span className="text-gray-400">✓</span>
                      )}
                      {chat.lastStatus === 'delivered' && (
                        <span className="text-gray-400">✓✓</span>
                      )}
                      {chat.lastStatus === 'read' && (
                        <span className="text-blue-500">✓✓</span>
                      )}
                    </div>
                  )}
                  
                  {/* Unread count badge */}
                  {hasUnread && (
                    <div className="bg-green-600 text-white text-xs rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5">
                      {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      
      {/* Empty state */}
      {conversations.length === 0 && (
        <div className="p-8 text-center text-gray-500">
          <div className="text-4xl mb-4">💬</div>
          <p>No conversations yet</p>
          <p className="text-sm mt-2 mb-4">Messages will appear here when you start chatting</p>
          <div className="text-xs text-gray-400 bg-gray-50 p-3 rounded-lg">
            <p className="font-medium mb-2">To test the app:</p>
            <p>1. Send a message to any contact</p>
            <p>2. Or use the webhook endpoint to simulate incoming messages</p>
          </div>
        </div>
      )}
    </div>
  );
}