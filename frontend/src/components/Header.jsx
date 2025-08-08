import React from "react";
import { useState } from "react";

// WhatsApp SVG logo component
const WhatsAppIcon = ({ className = "w-8 h-8" }) => (
  <svg 
    className={className} 
    viewBox="0 0 24 24" 
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.465 3.488"/>
  </svg>
);
import TestPanel from './TestPanel';

export default function Header() {
  const [showTestPanel, setShowTestPanel] = useState(false);

  return (
    <>
      <header className="bg-green-600 text-white shadow-md">
      <div className="flex items-center justify-between p-4">
        {/* Left side - Logo and title */}
        <div className="flex items-center space-x-3">
          <WhatsAppIcon className="w-8 h-8" />
          <div>
            <h1 className="text-xl font-semibold">WhatsApp Clone</h1>
            <p className="text-sm text-green-200 hidden sm:block">
              Real-time messaging application
            </p>
          </div>
        </div>

        {/* Right side - Actions */}
        <div className="flex items-center space-x-4">
          {/* Status indicator */}
          <div className="hidden md:flex items-center space-x-2 text-sm">
            <div className="w-2 h-2 bg-green-300 rounded-full animate-pulse"></div>
            <span className="text-green-200">Connected</span>
          </div>

          {/* Settings menu */}
          <div className="relative">
            <button 
              onClick={() => setShowTestPanel(true)}
              className="mr-2 px-3 py-1 bg-green-700 hover:bg-green-800 rounded text-sm transition-colors"
              title="Test webhook"
            >
              Test
            </button>
            <button 
              className="p-2 hover:bg-green-700 rounded-full transition-colors"
              title="Menu"
            >
              <svg 
                className="w-5 h-5" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" 
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
      </header>
      
      {showTestPanel && (
        <TestPanel onClose={() => setShowTestPanel(false)} />
      )}
    </>
  );
}