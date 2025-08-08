import React from "react";

export default function MessageBubble({ message }) {
  const isMine = message.from === "me"; // Adjust according to your backend logic
  return (
    <div className={`flex mb-2 ${isMine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-xs px-3 py-2 rounded-lg ${
          isMine
            ? "bg-green-500 text-white rounded-br-none"
            : "bg-white text-black rounded-bl-none"
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}
