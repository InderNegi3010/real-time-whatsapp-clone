import React, { useState } from 'react';
import { sendWebhookPayload } from '../api';

export default function TestPanel({ onClose }) {
  const [payload, setPayload] = useState({
    wa_id: '1234567890',
    name: 'Test User',
    content: 'Hello! This is a test message from the webhook.',
    from: 'remote'
  });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const handleSendTest = async () => {
    setSending(true);
    setResult(null);
    
    try {
      const response = await sendWebhookPayload({
        type: 'message',
        messages: [{
          ...payload,
          id: `test_${Date.now()}`,
          timestamp: new Date().toISOString()
        }]
      });
      
      setResult({ success: true, data: response });
    } catch (error) {
      setResult({ success: false, error: error.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Test Webhook</h3>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">WhatsApp ID</label>
            <input
              type="text"
              value={payload.wa_id}
              onChange={(e) => setPayload({...payload, wa_id: e.target.value})}
              className="w-full p-2 border rounded-lg"
              placeholder="1234567890"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={payload.name}
              onChange={(e) => setPayload({...payload, name: e.target.value})}
              className="w-full p-2 border rounded-lg"
              placeholder="Test User"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Message</label>
            <textarea
              value={payload.content}
              onChange={(e) => setPayload({...payload, content: e.target.value})}
              className="w-full p-2 border rounded-lg h-20"
              placeholder="Enter test message..."
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">From</label>
            <select
              value={payload.from}
              onChange={(e) => setPayload({...payload, from: e.target.value})}
              className="w-full p-2 border rounded-lg"
            >
              <option value="remote">Remote (Incoming)</option>
              <option value="me">Me (Outgoing)</option>
            </select>
          </div>
          
          {result && (
            <div className={`p-3 rounded-lg text-sm ${
              result.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {result.success ? '✅ Message sent successfully!' : `❌ Error: ${result.error}`}
            </div>
          )}
          
          <div className="flex space-x-3">
            <button
              onClick={handleSendTest}
              disabled={sending}
              className="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {sending ? 'Sending...' : 'Send Test Message'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}