import React, { useEffect, useState } from "react";
import { getConversations } from "./api";
import ChatList from "./components/ChatList";
import ChatWindow from "./components/ChatWindow";
import Header from "./components/Header";
import { io } from "socket.io-client";

export default function App() {
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null);
  const [socket, setSocket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [isMobile, setIsMobile] = useState(false);
  const [showChatList, setShowChatList] = useState(true);

  useEffect(() => {
    initializeApp();
    handleResize();
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const handleResize = () => {
    const mobile = window.innerWidth < 768;
    setIsMobile(mobile);
    
    // On mobile, show chat list by default if no active chat
    if (mobile && !active) {
      setShowChatList(true);
    }
  };

  // Separate effect for socket listeners to avoid re-creating them
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (msg) => {
      console.log('New message received:', msg);
      
      // Update conversations list
      loadConversations();
      
      // Show notification for new messages (if not in active chat)
      if (msg.wa_id !== active && msg.from !== 'me') {
        showNotification(msg);
      }
    };

    const handleStatusUpdate = (update) => {
      console.log('Status update received:', update);
      loadConversations();
    };

    const handleConnect = () => {
      console.log('✅ Socket connected');
      setConnectionStatus('connected');
    };

    const handleDisconnect = (reason) => {
      console.log('❌ Socket disconnected:', reason);
      setConnectionStatus('disconnected');
    };

    const handleConnectError = (error) => {
      console.error('Socket connection error:', error);
      setConnectionStatus('error');
    };

    const handleUserOnline = (data) => {
      console.log('User came online:', data);
      // Update user online status
      setConversations(prev => prev.map(conv => 
        conv.wa_id === data.wa_id 
          ? { ...conv, isOnline: true, lastSeen: new Date().toISOString() }
          : conv
      ));
    };

    const handleUserOffline = (data) => {
      console.log('User went offline:', data);
      setConversations(prev => prev.map(conv => 
        conv.wa_id === data.wa_id 
          ? { ...conv, isOnline: false, lastSeen: data.lastSeen }
          : conv
      ));
    };

    // Add event listeners
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('message:new', handleNewMessage);
    socket.on('message:status_update', handleStatusUpdate);
    socket.on('user:online', handleUserOnline);
    socket.on('user:offline', handleUserOffline);

    // Cleanup listeners
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('message:new', handleNewMessage);
      socket.off('message:status_update', handleStatusUpdate);
      socket.off('user:online', handleUserOnline);
      socket.off('user:offline', handleUserOffline);
    };
  }, [socket, active]);

  const showNotification = (message) => {
    if (Notification.permission === 'granted') {
      const conv = conversations.find(c => c.wa_id === message.wa_id);
      new Notification(`${conv?.name || message.wa_id}`, {
        body: message.content,
        icon: conv?.avatar || '/whatsapp-icon.png',
        tag: message.wa_id
      });
    }
  };

  // Request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  async function initializeApp() {
    try {
      setLoading(true);
      setError(null);

      // Initialize socket connection
      const socketUrl = import.meta.env.VITE_SOCKET_URL || "http://localhost:4000";
      const socketInstance = io(socketUrl, {
        transports: ['websocket', 'polling'],
        timeout: 20000,
        forceNew: true,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
        maxReconnectionAttempts: 5
      });

      setSocket(socketInstance);

      // Load initial conversations
      await loadConversations();
    } catch (err) {
      console.error('Failed to initialize app:', err);
      setError('Failed to connect to server. Please try refreshing the page.');
    } finally {
      setLoading(false);
    }
  }

  async function loadConversations() {
    try {
      const data = await getConversations();
      console.log('Conversations loaded:', data);
      setConversations(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load conversations:', err);
      // Don't show error for empty conversations, just log it
      setConversations([]);
    }
  }

  function handleSelectChat(wa_id) {
    // Leave previous chat room
    if (active && socket) {
      socket.emit('leave_chat', active);
    }
    
    // Set new active chat
    setActive(wa_id);
    
    // Join new chat room
    if (socket) {
      socket.emit('join_chat', wa_id);
    }

    // On mobile, hide chat list when chat is selected
    if (isMobile) {
      setShowChatList(false);
    }
  }

  function handleBackToList() {
    if (active && socket) {
      socket.emit('leave_chat', active);
    }
    setActive(null);
    
    // On mobile, show chat list when going back
    if (isMobile) {
      setShowChatList(true);
    }
  }

  // Cleanup socket on unmount
  useEffect(() => {
    return () => {
      if (socket) {
        if (active) {
          socket.emit('leave_chat', active);
        }
        socket.disconnect();
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading WhatsApp Clone...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center bg-white p-8 rounded-lg shadow-md max-w-md mx-4">
          <div className="text-red-500 text-xl mb-4">⚠️ Connection Error</div>
          <p className="text-gray-600 mb-4">{error}</p>
          <button 
            onClick={initializeApp}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden">
      {/* Header */}
      <Header connectionStatus={connectionStatus} />
      
      {/* Connection Status Indicator */}
      {connectionStatus !== 'connected' && (
        <div className={`px-4 py-2 text-sm text-center transition-all ${
          connectionStatus === 'error' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
        }`}>
          {connectionStatus === 'error' ? '❌ Connection failed' : '🔄 Connecting...'}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar - Chat List */}
        <div className={`${
          isMobile 
            ? `absolute inset-0 z-10 transform transition-transform duration-300 ${
                showChatList ? 'translate-x-0' : '-translate-x-full'
              }`
            : 'w-80 border-r'
        } bg-white flex-shrink-0 flex flex-col`}>
          
          {/* Chat List Header */}
          <div className="p-4 border-b bg-gray-50 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-800">Chats</h2>
                <p className="text-sm text-gray-500">
                  {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
                </p>
              </div>
              
              {/* Search and New Chat buttons */}
              <div className="flex items-center space-x-2">
                <button 
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-full transition-colors"
                  title="Search"
                >
                  🔍
                </button>
                <button 
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-full transition-colors"
                  title="New chat"
                >
                  💬
                </button>
                <button 
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-full transition-colors"
                  title="Menu"
                >
                  ⋮
                </button>
              </div>
            </div>
          </div>
          
          {/* Chat List Content */}
          <div className="flex-1 overflow-hidden">
            {conversations.length === 0 ? (
              <div className="p-8 text-center text-gray-500 h-full flex items-center justify-center">
                <div>
                  <div className="text-4xl mb-4">💬</div>
                  <p className="mb-2">No conversations yet</p>
                  <p className="text-sm mt-2 mb-4">Messages will appear here when you start chatting</p>
                  <div className="text-xs text-gray-400 bg-gray-50 p-3 rounded-lg max-w-xs">
                    <p className="font-medium mb-2">To test the app:</p>
                    <p>1. Send a message to any contact</p>
                    <p>2. Or use the webhook endpoint to simulate incoming messages</p>
                  </div>
                </div>
              </div>
            ) : (
              <ChatList
                conversations={conversations}
                onSelect={handleSelectChat}
                active={active}
              />
            )}
          </div>
        </div>

        {/* Main Chat Area */}
        <div className={`flex-1 flex flex-col ${
          isMobile && showChatList ? 'hidden' : 'flex'
        }`}>
          {active ? (
            <ChatWindow 
              wa_id={active} 
              socket={socket}
              onBack={handleBackToList}
              conversations={conversations}
              isMobile={isMobile}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center bg-gray-50 p-8">
              <div className="text-center max-w-md">
                <div className="text-6xl mb-6">💬</div>
                <h3 className="text-xl font-semibold text-gray-700 mb-3">
                  WhatsApp Clone
                </h3>
                <p className="text-gray-500 mb-6 leading-relaxed">
                  Send and receive messages without keeping your phone connected.
                  Use WhatsApp on up to 4 linked devices and 1 phone at the same time.
                </p>
                
                {/* Feature highlights */}
                <div className="bg-white rounded-lg p-4 shadow-sm mb-6">
                  <div className="text-sm text-gray-600 space-y-2">
                    <div className="flex items-center justify-center space-x-2">
                      <span>🔒</span>
                      <span>End-to-end encrypted</span>
                    </div>
                    <div className="flex items-center justify-center space-x-2">
                      <span>⚡</span>
                      <span>Real-time messaging</span>
                    </div>
                    <div className="flex items-center justify-center space-x-2">
                      <span>📱</span>
                      <span>Mobile responsive</span>
                    </div>
                  </div>
                </div>
                
                <div className="text-sm text-gray-400">
                  {isMobile ? 'Tap a chat to start messaging' : 'Select a chat to start messaging'}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}