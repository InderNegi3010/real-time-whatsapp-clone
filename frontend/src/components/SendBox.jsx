import React, { useState } from "react";
import { api } from "../api";

export default function SendBox({ wa_id, onSent }) {
  const [text, setText] = useState("");

  async function sendMessage() {
    if (!text.trim()) return;
    await api.post("/messages", {
      wa_id,
      from: "me",
      content: text
    });
    setText("");
    onSent();
  }

  return (
    <div className="p-3 flex items-center border-t bg-white">
      <input
        type="text"
        className="flex-1 p-2 border rounded-lg mr-2"
        placeholder="Type a message"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && sendMessage()}
      />
      <button
        onClick={sendMessage}
        className="bg-green-500 text-white px-4 py-2 rounded-lg"
      >
        Send
      </button>
    </div>
  );
}
