import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import io from 'socket.io-client';

const ChatContext = createContext();

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

export const ChatProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);
    const [messages, setMessages] = useState([]);
    const [chats, setChats] = useState([]);
    const [activeChat, setActiveChat] = useState(null);
    const [currentUser, setCurrentUser] = useState('user1');
    const [isConnected, setIsConnected] = useState(false);
    const [typingUsers, setTypingUsers] = useState(new Set());
    const [onlineUsers, setOnlineUsers] = useState(new Set());
    const [isDarkMode, setIsDarkMode] = useState(false);

    // Initialize socket connection
    useEffect(() => {
        const newSocket = io(BACKEND_URL);
        setSocket(newSocket);

        newSocket.on('connect', () => {
            setIsConnected(true);
            newSocket.emit('join', currentUser);
        });

        newSocket.on('disconnect', () => {
            setIsConnected(false);
        });

        // ✅ FIXED: Only listen for messages from OTHER users
        newSocket.on('receive_message', (messageData) => {
            console.log('Received message from another user:', messageData);
            setMessages(prev => {
                // Prevent duplicates by checking if message already exists
                const existingMessage = prev.find(msg => msg.id === messageData.id);
                if (existingMessage) {
                    return prev;
                }
                return [...prev, messageData];
            });
            updateChatLastMessage(messageData);
            
            // Auto-mark as delivered if chat is active
            if (activeChat && messageData.chatId === getChatId(currentUser, messageData.sender)) {
                markAsDelivered(messageData.id);
                // Also mark as read after a short delay (simulating user reading)
                setTimeout(() => {
                    markAsRead(messageData.id);
                }, 2000);
            }
        });

        // ✅ FIXED: Handle message status updates properly
        newSocket.on('message_status_update', ({ messageId, status }) => {
            console.log(`Message ${messageId} status updated to ${status}`);
            setMessages(prev => prev.map(msg => 
                msg.id === messageId ? { ...msg, status } : msg
            ));
        });

        newSocket.on('user_typing', ({ userId, chatId }) => {
            if (activeChat && getChatId(currentUser, userId) === chatId && userId !== currentUser) {
                setTypingUsers(prev => new Set(prev).add(userId));
            }
        });

        newSocket.on('user_stopped_typing', ({ userId }) => {
            setTypingUsers(prev => {
                const newSet = new Set(prev);
                newSet.delete(userId);
                return newSet;
            });
        });

        newSocket.on('user_online', (userId) => {
            setOnlineUsers(prev => new Set(prev).add(userId));
        });

        newSocket.on('user_offline', (userId) => {
            setOnlineUsers(prev => {
                const newSet = new Set(prev);
                newSet.delete(userId);
                return newSet;
            });
        });

        return () => {
            newSocket.close();
        };
    }, [currentUser, activeChat]);

    // Helper function to generate consistent chat IDs
    const getChatId = (user1, user2) => {
        return [user1, user2].sort().join('_');
    };

    // Fetch chats and messages
    useEffect(() => {
        fetchChats();
    }, [currentUser]);

    useEffect(() => {
        if (activeChat) {
            fetchMessages(activeChat.id);
        }
    }, [activeChat]);

    const fetchChats = async () => {
        try {
            const response = await fetch(`${BACKEND_URL}/api/chats?userId=${currentUser}`);
            const data = await response.json();
            setChats(data);
        } catch (error) {
            console.error('Error fetching chats:', error);
        }
    };

    const fetchMessages = async (chatId, page = 1) => {
        try {
            const response = await fetch(`${BACKEND_URL}/api/messages?chatId=${chatId}&page=${page}&limit=50`);
            const data = await response.json();
            
            if (page === 1) {
                setMessages(data.messages);
            } else {
                setMessages(prev => [...data.messages, ...prev]);
            }
            
            return data.hasMore;
        } catch (error) {
            console.error('Error fetching messages:', error);
            return false;
        }
    };

    // ✅ FIXED: Proper sendMessage implementation
    const sendMessage = useCallback(async (content, recipient = 'bot') => {
        if (!socket || !content.trim()) return;

        const chatId = getChatId(currentUser, recipient);
        const messageId = `${Date.now()}_${currentUser}`;
        
        const messageData = {
            id: messageId,
            sender: currentUser,
            recipient,
            content: content.trim(),
            chatId,
            timestamp: new Date(),
            status: 'sent'
        };

        console.log('Sending message:', messageData);

        // ✅ FIXED: Add to local state immediately (optimistic update)
        setMessages(prev => [...prev, messageData]);
        updateChatLastMessage(messageData);

        try {
            // Save to database first
            const response = await fetch(`${BACKEND_URL}/api/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(messageData),
            });

            if (response.ok) {
                // ✅ FIXED: Only emit via socket AFTER successful DB save
                // This prevents the 'receive_message' event from firing for our own message
                socket.emit('send_message', messageData);
                
                // Update status to delivered after a short delay
                setTimeout(() => {
                    updateMessageStatus(messageId, 'delivered');
                }, 1000);
            } else {
                console.error('Failed to save message to database');
                // Remove from local state if DB save failed
                setMessages(prev => prev.filter(msg => msg.id !== messageId));
            }
        } catch (error) {
            console.error('Error saving message:', error);
            // Remove from local state if request failed
            setMessages(prev => prev.filter(msg => msg.id !== messageId));
        }

    }, [socket, currentUser]);

    // ✅ FIXED: Proper status update functions
    const updateMessageStatus = useCallback(async (messageId, status) => {
        try {
            const response = await fetch(`${BACKEND_URL}/api/messages/${messageId}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ status }),
            });

            if (response.ok) {
                // Update local state
                setMessages(prev => prev.map(msg => 
                    msg.id === messageId ? { ...msg, status } : msg
                ));
                
                // Emit status update via socket
                if (socket) {
                    socket.emit('message_status_update', { messageId, status });
                }
            }
        } catch (error) {
            console.error(`Error updating message status to ${status}:`, error);
        }
    }, [socket]);

    const markAsDelivered = useCallback((messageId) => {
        updateMessageStatus(messageId, 'delivered');
    }, [updateMessageStatus]);

    const markAsRead = useCallback((messageId) => {
        updateMessageStatus(messageId, 'read');
    }, [updateMessageStatus]);

    // ✅ FIXED: Mark messages as read when viewing chat
    useEffect(() => {
        if (activeChat && messages.length > 0) {
            // Mark all unread messages as read after a short delay
            setTimeout(() => {
                const unreadMessages = messages.filter(
                    msg => msg.recipient === currentUser && msg.status !== 'read'
                );
                unreadMessages.forEach(msg => {
                    markAsRead(msg.id);
                });
            }, 1000);
        }
    }, [activeChat, messages, currentUser, markAsRead]);

    const startTyping = useCallback((chatId) => {
        if (socket && activeChat) {
            socket.emit('typing_start', { chatId, userId: currentUser });
        }
    }, [socket, activeChat, currentUser]);

    const stopTyping = useCallback((chatId) => {
        if (socket && activeChat) {
            socket.emit('typing_stop', { chatId, userId: currentUser });
        }
    }, [socket, activeChat, currentUser]);

    const updateChatLastMessage = (messageData) => {
        setChats(prev => prev.map(chat => {
            if (chat._id === messageData.chatId || 
                (chat.participants && chat.participants.includes(messageData.sender) && 
                 chat.participants.includes(messageData.recipient))) {
                return {
                    ...chat,
                    lastMessage: {
                        content: messageData.content,
                        sender: messageData.sender,
                        timestamp: messageData.timestamp
                    }
                };
            }
            return chat;
        }));
    };

    const createChat = async (participants) => {
        try {
            const response = await fetch(`${BACKEND_URL}/api/chats`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ participants }),
            });
            const newChat = await response.json();
            setChats(prev => [newChat, ...prev]);
            return newChat;
        } catch (error) {
            console.error('Error creating chat:', error);
            return null;
        }
    };

    const toggleDarkMode = () => {
        setIsDarkMode(prev => !prev);
        document.documentElement.classList.toggle('dark');
    };

    const value = {
        socket,
        messages,
        chats,
        activeChat,
        setActiveChat,
        currentUser,
        setCurrentUser,
        isConnected,
        typingUsers,
        onlineUsers,
        isDarkMode,
        sendMessage,
        markAsDelivered,
        markAsRead,
        startTyping,
        stopTyping,
        fetchMessages,
        createChat,
        toggleDarkMode,
        BACKEND_URL
    };

    return (
        <ChatContext.Provider value={value}>
            {children}
        </ChatContext.Provider>
    );
};

export const useChat = () => {
    const context = useContext(ChatContext);
    if (!context) {
        throw new Error('useChat must be used within a ChatProvider');
    }
    return context;
};