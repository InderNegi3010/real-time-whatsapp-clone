import React, { useEffect, useState, useRef, useCallback } from "react";
import { getMessages, sendMessage, markMessagesAsRead } from "../api";

// Helper function to format timestamp
function formatMessageTime(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

// Helper function to group messages by date
function groupMessagesByDate(messages) {
  const groups = {};
  
  messages.forEach(message => {
    const date = new Date(message.timestamp).toDateString();
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(message);
  });
  
  return groups;
}

// Helper function to format date headers
function formatDateHeader(dateString) {
  const date = new Date(dateString);
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  
  if (dateString === today) return "Today";
  if (dateString === yesterday) return "Yesterday";
  
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

export default function ChatWindow({ wa_id, socket, onBack, conversations }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [typingUser, setTypingUser] = useState("");
  const bottomRef = useRef();
  const inputRef = useRef();
  const typingTimeoutRef = useRef();

  // Get current conversation info
  const currentChat = conversations.find(c => c.wa_id === wa_id);

  // Load messages when wa_id changes
  useEffect(() => {
    if (!wa_id) return;
    loadMessages();
  }, [wa_id]);

  // Setup socket listeners
  useEffect(() => {
    if (!socket || !wa_id) return;

    const handleNewMessage = (msg) => {
      if (msg.wa_id === wa_id) {
        setMessages((prev) => {
          // Avoid duplicates
          if (prev.find(m => m._id === msg._id)) return prev;
          return [...prev, msg];
        });
        scrollToBottom();
      }
    };

    const handleStatusUpdate = (update) => {
      if (update.wa_id === wa_id) {
        setMessages((prev) => prev.map(msg => 
          (msg._id === update.messageId || msg.msg_id === update.msg_id) 
            ? { ...msg, status: update.status }
            : msg
        ));
      }
    };

    const handleUserTyping = (data) => {
      if (data.wa_id === wa_id && data.userId !== socket.id) {
        setIsTyping(data.isTyping);
        setTypingUser(data.userName);
        
        if (data.isTyping) {
          // Clear typing indicator after 3 seconds
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => {
            setIsTyping(false);
            setTypingUser("");
          }, 3000);
        }
      }
    };

    socket.on("message:new", handleNewMessage);
    socket.on("message:status_update", handleStatusUpdate);
    socket.on("user_typing", handleUserTyping);

    return () => {
      socket.off("message:new", handleNewMessage);
      socket.off("message:status_update", handleStatusUpdate);
      socket.off("user_typing", handleUserTyping);
      clearTimeout(typingTimeoutRef.current);
    };
  }, [wa_id, socket]);

  // Mark messages as read when chat is opened
  useEffect(() => {
    if (!wa_id) return;
    markMessagesAsRead(wa_id).catch(console.error);
  }, [wa_id]);

  const loadMessages = useCallback(async () => {
    if (!wa_id) return;
    
    setLoading(true);
    try {
      const data = await getMessages(wa_id);
      console.log('Messages loaded for', wa_id, ':', data);
      setMessages(Array.isArray(data) ? data : []);
      setTimeout(scrollToBottom, 100);
    } catch (error) {
      console.error('Failed to load messages:', error);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [wa_id]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim() || sending) return;

    const messageText = text.trim();
    setText("");
    setSending(true);

    // Stop typing indicator
    if (socket) {
      socket.emit("typing_stop", { 
        wa_id, 
        userName: "You" 
      });
    }

    try {
      const response = await sendMessage({
        wa_id,
        name: currentChat?.name || "You",
        number: currentChat?.number || "unknown",
        content: messageText,
      });

      // Message will be added via socket event, but add optimistically for better UX
      const optimisticMessage = {
        _id: `temp_${Date.now()}`,
        wa_id,
        from: "me",
        content: messageText,
        timestamp: new Date().toISOString(),
        status: "pending"
      };
      
      setMessages(prev => [...prev, optimisticMessage]);
      scrollToBottom();

    } catch (error) {
      console.error('Failed to send message:', error);
      setText(messageText); // Restore text on error
      alert('Failed to send message. Please try again.');
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleInputChange = (e) => {
    setText(e.target.value);
    
    // Emit typing indicator
    if (socket && e.target.value.trim()) {
      socket.emit("typing_start", { 
        wa_id, 
        userName: "You" 
      });
      
      // Clear existing timeout
      clearTimeout(typingTimeoutRef.current);
      
      // Stop typing after 1 second of no input
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit("typing_stop", { 
          wa_id, 
          userName: "You" 
        });
      }, 1000);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  };

  // Group messages by date
  const groupedMessages = groupMessagesByDate(messages);

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Chat Header */}
      <div className="bg-green-600 text-white p-4 flex items-center shadow-md">
        {/* Back button for mobile */}
        <button 
          onClick={onBack}
          className="md:hidden mr-3 hover:bg-green-700 p-1 rounded"
        >
          ←
        </button>
        
        <img
          src={currentChat?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentChat?.name || wa_id)}&background=ffffff&color=25d366`}
          alt={currentChat?.name || wa_id}
          className="w-10 h-10 rounded-full mr-3 object-cover"
        />
        
        <div className="flex-1">
          <h3 className="font-semibold">
            {currentChat?.name || currentChat?.number || wa_id}
          </h3>
          {isTyping && (
            <p className="text-sm text-green-200">
              {typingUser} is typing...
            </p>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          <button className="hover:bg-green-700 p-2 rounded">📞</button>
          <button className="hover:bg-green-700 p-2 rounded">📹</button>
          <button className="hover:bg-green-700 p-2 rounded">⋮</button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
          </div>
        ) : (
          <>
            {Object.entries(groupedMessages).map(([dateString, dateMessages]) => (
              <div key={dateString}>
                {/* Date Header */}
                <div className="flex justify-center mb-4">
                  <div className="bg-white px-3 py-1 rounded-full shadow-sm text-sm text-gray-600">
                    {formatDateHeader(dateString)}
                  </div>
                </div>
                
                {/* Messages for this date */}
                {dateMessages.map((msg, index) => {
                  const isMine = msg.from === "me";
                  const isLast = index === dateMessages.length - 1;
                  
                  return (
                    <div
                      key={msg._id || index}
                      className={`flex mb-2 ${isMine ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg relative ${
                          isMine
                            ? "bg-green-500 text-white rounded-br-sm"
                            : "bg-white text-gray-800 rounded-bl-sm shadow-sm"
                        }`}
                        style={{
                          wordWrap: 'break-word',
                          overflowWrap: 'break-word'
                        }}
                      >
                        {/* Message Content */}
                        <div className="mb-1">
                          {msg.content}
                        </div>
                        
                        {/* Time and Status */}
                        <div className={`flex items-center justify-end space-x-1 text-xs ${
                          isMine ? "text-green-100" : "text-gray-500"
                        }`}>
                          <span>{formatMessageTime(msg.timestamp)}</span>
                          
                          {/* Status indicators for sent messages */}
                          {isMine && (
                            <span className="ml-1">
                              {msg.status === 'pending' && "⏳"}
                              {msg.status === 'sent' && "✓"}
                              {msg.status === 'delivered' && "✓✓"}
                              {msg.status === 'read' && <span className="text-blue-200">✓✓</span>}
                              {msg.status === 'failed' && <span className="text-red-300">⚠️</span>}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            
            {/* Empty state */}
            {messages.length === 0 && !loading && (
              <div className="flex items-center justify-center h-full text-gray-500">
                <div className="text-center">
                  <div className="text-4xl mb-4">💬</div>
                  <p className="mb-2">No messages yet with {currentChat?.name || wa_id}</p>
                  <p className="text-sm text-gray-400">Start the conversation by typing a message below</p>
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-600">
                    💡 Tip: You can also send webhook payloads to simulate incoming messages
                  </div>
                </div>
              </div>
            )}
            
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Typing Indicator */}
      {isTyping && (
        <div className="px-4 py-2">
          <div className="flex items-center">
            <div className="bg-white rounded-full px-4 py-2 shadow-sm">
              <div className="flex items-center space-x-1">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Message Input */}
      <form
        onSubmit={handleSend}
        className="bg-white p-4 border-t flex items-center space-x-3"
      >
        <button
          type="button"
          className="text-gray-500 hover:text-gray-700 p-2"
          title="Attach file"
        >
          📎
        </button>
        
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message"
            className="w-full py-3 px-4 rounded-full border border-gray-300 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
            disabled={sending}
          />
          
          <button
            type="button"
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
            title="Emoji"
          >
            😊
          </button>
        </div>
        
        <button
          type="submit"
          disabled={!text.trim() || sending}
          className={`p-3 rounded-full transition-all ${
            text.trim() && !sending
              ? "bg-green-600 text-white hover:bg-green-700"
              : "bg-gray-300 text-gray-500 cursor-not-allowed"
          }`}
          title="Send message"
        >
          {sending ? (
            <div className="w-5 h-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
          ) : (
            "➤"
          )}
        </button>
      </form>
    </div>
  );
}