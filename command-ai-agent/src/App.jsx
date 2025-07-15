import React, { useState, useEffect, useRef } from 'react';
import './index.css';

function Navbar() {
  return (
    <nav className="w-full bg-white shadow-md p-4 flex items-center justify-between fixed top-0 left-0 z-10">
      <div className="text-xl font-semibold text-blue-600">Event Ease</div>
      <div className="space-x-4">
        <a href="/" className="text-gray-700 hover:text-blue-500 font-medium">Login</a>
        <a href="" rel="noreferrer" className="text-gray-700 hover:text-blue-500 font-medium">Signup</a>
      </div>
    </nav>
  );
}

//main app
function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [showChatbot, setShowChatbot] = useState(false);
  const messagesEndRef = useRef(null);

  const BACKEND_BASE_URL = 'http://localhost:5000';
  const WEBHOOK_URL = '';

  useEffect(() => {
    if (showChatbot) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, showChatbot]);

  const handleSendMessage = async () => {
    if (input.trim()) {
      const userMessage = input.trim();
      setMessages((prevMessages) => [...prevMessages, { text: userMessage, sender: 'user' }]);
      setInput('');

      try {
        const response = await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: userMessage }),
        });

        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

        const data = await response.json();
        const botReply = data.reply || "I couldn't get a response from assistant.";
        setMessages((prevMessages) => [...prevMessages, { text: botReply, sender: 'bot' }]);

        if (botReply.includes('Please visit this link to authorize me:')) {
          const authLink = `${BACKEND_BASE_URL}/auth/google`;
          setMessages((prevMessages) => [
            ...prevMessages,
            {
              text: (
                <>
                  It looks like your Google Calendar isn't linked.{' '}
                  <a href={authLink} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">
                    Click here to authorize.
                  </a>
                </>
              ),
              sender: 'bot',
            },
          ]);
        }
      } catch (error) {
        console.error('Error sending message:', error);
        setMessages((prevMessages) => [...prevMessages, { text: 'Something went wrong', sender: 'bot' }]);
      }
    }
  };

  const handleInputChange = (e) => setInput(e.target.value);
  const handleKeyPress = (e) => e.key === 'Enter' && handleSendMessage();

  return (
    <>
      <Navbar />

      {/* Landing or Chatbot */}
      <div className="pt-20 min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-100 to-purple-200 p-8 font-sans">

        {/* Landing Page */}
        {!showChatbot && (
          <div className="text-center max-w-2xl">
            <h1 className="text-4xl font-bold text-gray-800 mb-4">Meet Your AI Calendar Assistant EventEase</h1>
            <p className="text-lg text-gray-600 mb-8">
              Organize meetings, manage events, and save time — all with just one click.
              <br></br>
              With your Google Calendar.
            </p>
            <button
              className="px-6 py-3 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 transform hover:scale-105 transition-all duration-200"
              onClick={() => setShowChatbot(true)}
            >
              Start Chat
            </button>
          </div>
        )}

        {/* Chatbot UI */}
        {showChatbot && (
          <div className="mt-10 bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col h-[80vh] overflow-hidden">
            
            {/* Header with Back Button */}
            <div className="bg-blue-600 text-white p-4 rounded-t-xl shadow-md flex items-center justify-between">
              <h1 className="text-xl font-semibold">Calendar AI Assistant</h1>

              <div className="flex items-center space-x-3">
                <button
                  onClick={() => {
                    setShowChatbot(false);
                    setMessages([]); // Optional: clear chat history on exit
                  }}
                  className="bg-white text-blue-600 px-3 py-1 rounded-md text-sm font-medium shadow hover:bg-gray-100 transition"
                >
                  ← Back
                </button>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 p-4 overflow-y-auto space-y-4">
              {messages.length === 0 && (
                <div className="text-center text-gray-500 mt-10">
                  Type a message to start the conversation!
                </div>
              )}
              {messages.map((message, index) => (
                <div key={index} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] p-3 rounded-lg shadow-sm ${
                    message.sender === 'user'
                      ? 'bg-blue-500 text-white rounded-br-none'
                      : 'bg-gray-200 text-gray-800 rounded-bl-none'
                  }`}>
                    {message.text}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Section */}
            <div className="p-4 bg-gray-100 border-t border-gray-200 flex items-center rounded-b-xl">
              <input
                type="text"
                className="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200"
                placeholder="Type your message..."
                value={input}
                onChange={handleInputChange}
                onKeyUp={handleKeyPress}
              />
              <button
                className="ml-3 px-5 py-3 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 transform hover:scale-105"
                onClick={handleSendMessage}
              >
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default App;
