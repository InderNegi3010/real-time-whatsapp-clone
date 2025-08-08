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

  useEffect(() => {
    initializeApp();
  }, []);

  // Separate effect for socket listeners to avoid re-creating them
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (msg) => {
      console.log('New message received:', msg);
      
      // Update conversations list
      loadConversations();
      
      // If message is for active chat, it will be handled by ChatWindow
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

    // Add event listeners
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('message:new', handleNewMessage);
    socket.on('message:status_update', handleStatusUpdate);

    // Cleanup listeners
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('message:new', handleNewMessage);
      socket.off('message:status_update', handleStatusUpdate);
    };
  }, [socket]);

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
  }

  function handleBackToList() {
    if (active && socket) {
      socket.emit('leave_chat', active);
    }
    setActive(null);
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
        <div className="text-center bg-white p-8 rounded-lg shadow-md max-w-md">
          <div className="text-red-500 text-xl mb-4">⚠️ Connection Error</div>
          <p className="text-gray-600 mb-4">{error}</p>
          <button 
            onClick={initializeApp}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <Header />
      
      {/* Connection Status Indicator */}
      {connectionStatus !== 'connected' && (
        <div className={`px-4 py-2 text-sm text-center ${
          connectionStatus === 'error' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
        }`}>
          {connectionStatus === 'error' ? '❌ Connection failed' : '🔄 Connecting...'}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Chat List */}
        <div className={`w-80 border-r bg-white flex-shrink-0 ${
          active ? 'hidden md:block' : 'block'
        }`}>
          <div className="p-4 border-b bg-gray-50">
            <h2 className="font-semibold text-gray-800">Chats</h2>
            <p className="text-sm text-gray-500">
              {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
            </p>
          </div>
          
          {conversations.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <div className="text-4xl mb-4">💬</div>
              <p>No conversations yet</p>
              <p className="text-sm mt-2">Start by sending a message!</p>
            </div>
          ) : (
            <ChatList
              conversations={conversations}
              onSelect={handleSelectChat}
              active={active}
            />
          )}
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          {active ? (
            <ChatWindow 
              wa_id={active} 
              socket={socket}
              onBack={handleBackToList}
              conversations={conversations}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center bg-gray-50">
              <div className="text-center">
                <div className="text-6xl mb-4">💬</div>
                <h3 className="text-xl font-semibold text-gray-700 mb-2">
                  WhatsApp Clone
                </h3>
                <p className="text-gray-500 max-w-md">
                  Send and receive messages without keeping your phone connected.
                  Use WhatsApp on up to 4 linked devices and 1 phone at the same time.
                </p>
                <div className="mt-8 text-sm text-gray-400">
                  Select a chat to start messaging
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}