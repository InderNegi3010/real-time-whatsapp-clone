// src/api.js
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

// Create a reusable axios instance with better configuration
export const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor for logging (development only)
api.interceptors.request.use(
  (config) => {
    if (import.meta.env.DEV) {
      console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`, config.data);
    }
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    if (import.meta.env.DEV) {
      console.log(`API Response: ${response.status}`, response.data);
    }
    return response;
  },
  (error) => {
    console.error('API Response Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// API helper functions
export const getConversations = async () => {
  try {
    const res = await api.get("/conversations");
    return res.data;
  } catch (error) {
    console.error('Failed to fetch conversations:', error);
    throw error;
  }
};

export const getMessages = async (wa_id, options = {}) => {
  try {
    const { page = 1, limit = 50 } = options;
    const res = await api.get(`/messages/${encodeURIComponent(wa_id)}`, {
      params: { page, limit }
    });
    return res.data;
  } catch (error) {
    console.error('Failed to fetch messages:', error);
    throw error;
  }
};

// Fixed: Changed endpoint from /send to /messages to match backend
export const sendMessage = async ({ wa_id, name, number, content }) => {
  try {
    const res = await api.post("/messages", { 
      wa_id, 
      name, 
      number, 
      content: content.trim() 
    });
    return res.data;
  } catch (error) {
    console.error('Failed to send message:', error);
    throw error;
  }
};

// Mark messages as read
export const markMessagesAsRead = async (wa_id) => {
  try {
    const res = await api.patch(`/messages/${encodeURIComponent(wa_id)}/read`);
    return res.data;
  } catch (error) {
    console.error('Failed to mark messages as read:', error);
    throw error;
  }
};

// Get conversation info
export const getConversationInfo = async (wa_id) => {
  try {
    const res = await api.get(`/conversations/${encodeURIComponent(wa_id)}/info`);
    return res.data;
  } catch (error) {
    console.error('Failed to fetch conversation info:', error);
    throw error;
  }
};

// Delete a message
export const deleteMessage = async (messageId) => {
  try {
    const res = await api.delete(`/messages/${messageId}`);
    return res.data;
  } catch (error) {
    console.error('Failed to delete message:', error);
    throw error;
  }
};

// Send webhook payload (for testing)
export const sendWebhookPayload = async (payload) => {
  try {
    const res = await api.post("/webhook", payload);
    return res.data;
  } catch (error) {
    console.error('Failed to send webhook payload:', error);
    throw error;
  }
};