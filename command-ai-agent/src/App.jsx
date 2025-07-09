import React, { useState, useEffect, useRef } from 'react';
import './index.css';

// Main App component for the chatbot UI
function App() {
  // State to store the chat messages
  const [messages, setMessages] = useState([]);
  // State to store the current message being typed by the user
  const [input, setInput] = useState('');

  // Ref for the messages container to enable auto-scrolling
  const messagesEndRef = useRef(null);

  // Scroll to the bottom of the messages whenever messages state changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Function to handle sending a message
  const handleSendMessage = () => {
    if (input.trim()) {
      // Add user's message to the chat
      setMessages((prevMessages) => [...prevMessages, { text: input, sender: 'user' }]);
      setInput(''); // Clear the input field

      // TODO: In the next phase, this is where you'll call your Node.js backend
      // For now, let's simulate a bot response after a short delay
      setTimeout(() => {
        setMessages((prevMessages) => [...prevMessages, { text: "Hello! I'm your Calendar AI Assistant. How can I help you today?", sender: 'bot' }]);
      }, 1000);
    }
  };

  // Function to handle input change
  const handleInputChange = (e) => {
    setInput(e.target.value);
  };

  // Function to handle key presses (e.g., Enter to send)
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-200 flex items-center justify-center p-4 font-sans">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col h-[80vh] overflow-hidden">
        {/* Chat Header */}
        <div className="bg-blue-600 text-white p-4 rounded-t-xl shadow-md flex items-center justify-between">
          <h1 className="text-xl font-semibold">Calendar AI Assistant</h1>
          {/* Optional: Add an icon or status indicator here */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6 text-blue-200"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        </div>

        {/* Message Display Area */}
        <div className="flex-1 p-4 overflow-y-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 mt-10">
              Type a message to start the conversation!
            </div>
          )}
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${
                message.sender === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-[70%] p-3 rounded-lg shadow-sm ${
                  message.sender === 'user'
                    ? 'bg-blue-500 text-white rounded-br-none'
                    : 'bg-gray-200 text-gray-800 rounded-bl-none'
                }`}
              >
                {message.text}
              </div>
            </div>
          ))}
          {/* Ref for scrolling to the bottom */}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input and Send Button */}
        <div className="p-4 bg-gray-100 border-t border-gray-200 flex items-center rounded-b-xl">
          <input
            type="text"
            className="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200"
            placeholder="Type your message..."
            value={input}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
          />
          <button
            className="ml-3 px-5 py-3 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 transition-all duration-200 transform hover:scale-105"
            onClick={handleSendMessage}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
