import Head from "next/head";
import React from "react";
import { Geist, Geist_Mono } from "next/font/google";
import styles from "@/styles/Home.module.css";
import { useEffect, useState, FormEvent, useRef } from "react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Define types for messages and API responses (can be expanded)
interface Message {
  sender: "user" | "bot";
  text: string;
  type: "text" | "image" | "card" | "carousel" | "button" | "debug"; // Add debug type
  payload?: any; // For rich content like images, buttons, cards
  id?: string; // Add unique ID for better tracking
}

const VOICEFLOW_API_KEY = "VF.DM.6840bbad23abbbf9e0a2ca6f.YXpN4N1VGoj2pzra";
const USER_ID = "user_12345"; 
const VOICEFLOW_PROJECT_ID = "6840b5b978f00e1b0b9447be";
const VOICEFLOW_VERSION_ID = "production";

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<null | HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Function to send message to Voiceflow and handle response
  const sendMessageToVoiceflow = async (text: string | null, eventType?: string) => {
    setIsLoading(true);
    if (text) {
      const userMessage: Message = { 
        sender: "user", 
        text, 
        type: "text",
        id: `user-${Date.now()}-${Math.random()}`
      };
      setMessages((prevMessages) => [...prevMessages, userMessage]);
      // console.log("Added user message:", userMessage);
    }

    const requestBody: any = {
      config: { tts: false, stripSSML: true }, // Optional config
    };

    if (eventType === 'launch') {
      requestBody.action = { 
        type: 'launch',
        payload: {
          user_name: 'Max Den', // Example user data
          user_role: 'Customer',
          user_access: 'Full',
          user_email: 'max.den@example.com',
        }
      };
    } else if (text) {
      requestBody.action = { type: "text", payload: text };
    } else {
      // Potentially an empty request to trigger a response or a specific event type
      // For now, if no text and not launch, we don't send.
      setIsLoading(false);
      return;
    }
    
    // If starting a new session (e.g., first message or after clearing session)
    // you might want to use a POST to `https://general-runtime.voiceflow.com/state/user/${USER_ID}/interact`
    // For continuing a session, subsequent requests are also POSTs to the same endpoint.
    // Voiceflow's API is stateful per userID.

    // For the first interaction (launch), we can use POST to initialize.
    // Subsequent interactions also use POST.
    const apiUrl = `https://general-runtime.voiceflow.com/v2/project/${VOICEFLOW_PROJECT_ID}/user/${USER_ID}/interact/stream?completion_events=true`;
    
    try {
      // console.log("Sending request to Voiceflow:", requestBody);
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/event-stream",
          Authorization: VOICEFLOW_API_KEY,
          versionID: VOICEFLOW_VERSION_ID, 
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json(); // Or response.text() if not JSON
        console.error("Voiceflow API Error:", errorData);
        const errorMessage: Message = {
          sender: "bot", 
          text: `Error: ${errorData.message || "Failed to connect to Voiceflow."}`, 
          type: "text",
          id: `error-${Date.now()}`
        };
        setMessages((prevMessages) => [...prevMessages, errorMessage]);
        setIsLoading(false);
        return;
      }

      // Handle SSE stream
      if (!response.body) {
        throw new Error("Response body is null");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulatedContent = ""; // For accumulating streamed "completion" content
      let currentStreamingMessageId: string | null = null; // Track the current streaming message

      const addBotMessage = (
        text: string, 
        type: "text" | "image" | "card" | "carousel" | "button" | "debug" = "text", 
        payload?: any,
        messageId?: string
      ) => {
        const id = messageId || `bot-${Date.now()}-${Math.random()}`;
        const newMessage: Message = { 
          sender: "bot", 
          text, 
          type, 
          payload: { ...payload, id },
          id
        };
        
        if (type === "debug") {
          // console.log("Debug message (not displayed in UI):", newMessage);
        } else {
          // console.log("Adding bot message:", newMessage);
        }
        setMessages(prevMessages => [...prevMessages, newMessage]);
        return id;
      };

      const updateBotMessage = (messageId: string, text: string, payload?: any) => {
        // console.log("Updating bot message:", messageId, "with text:", text);
        setMessages(prevMessages => 
          prevMessages.map(msg => 
            msg.id === messageId 
              ? { ...msg, text, payload: { ...msg.payload, ...payload } }
              : msg
          )
        );
      };

      readerLoop: while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // console.log("SSE stream ended");
          if (accumulatedContent && currentStreamingMessageId) {
            updateBotMessage(currentStreamingMessageId, accumulatedContent, { state: "end" });
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        
        let eventEndIndex;
        while ((eventEndIndex = buffer.indexOf("\n\n")) !== -1) {
          const eventString = buffer.substring(0, eventEndIndex);
          buffer = buffer.substring(eventEndIndex + 2);

          let eventType = "";
          let dataString = "";

          eventString.split("\n").forEach(line => {
            if (line.startsWith("event:")) {
              eventType = line.substring("event:".length).trim();
            } else if (line.startsWith("data:")) {
              dataString = line.substring("data:".length).trim();
            }
          });

          // console.log("Received SSE event:", eventType, "data:", dataString);

          if (eventType === "trace" && dataString) {
            try {
              const trace = JSON.parse(dataString);
              // console.log("Parsed trace:", trace);

              if (trace.type === "completion") {
                if (trace.payload.state === "start") {
                  // console.log("Starting completion stream");
                  accumulatedContent = ""; 
                  currentStreamingMessageId = addBotMessage("", "text", { state: "start" });
                } else if (trace.payload.state === "content" && trace.payload.content) {
                  accumulatedContent += trace.payload.content;
                  if (currentStreamingMessageId) {
                    updateBotMessage(currentStreamingMessageId, accumulatedContent, { state: "content" });
                  }
                } else if (trace.payload.state === "end") {
                  // console.log("Ending completion stream with content:", accumulatedContent);
                  if (currentStreamingMessageId) {
                    updateBotMessage(currentStreamingMessageId, accumulatedContent || " ", { state: "end" });
                  }
                  accumulatedContent = "";
                  currentStreamingMessageId = null;
                }
              } else if (trace.type === "text" || trace.type === "speak") {
                if (trace.payload.message) {
                  // console.log("Adding text/speak message:", trace.payload.message);
                  addBotMessage(trace.payload.message, "text", trace.payload);
                }
              } else if (trace.type === "visual" && trace.payload.visualType === "image") {
                // console.log("Adding image message:", trace.payload);
                addBotMessage("Image", "image", trace.payload);
              } else if (trace.type === "choice" && trace.payload.buttons && trace.payload.buttons.length > 0) {
                const introText = trace.payload.message || "";
                // console.log("Adding button message:", introText, "buttons:", trace.payload.buttons);
                addBotMessage(introText, "button", { buttons: trace.payload.buttons, ...trace.payload });
              } else if (trace.type === "debug") {
                // Handle debug traces - log but don't display in UI
                // console.log("Debug trace received:", trace.payload);
                addBotMessage(trace.payload.message || "Debug info", "debug", trace.payload);
              } else {
                // Handle any other trace types that might contain messages
                // console.log("Unhandled trace type:", trace.type, "payload:", trace.payload);
                
                // Try to extract any message content from unknown trace types
                if (trace.payload && trace.payload.message) {
                  // console.log("Adding message from unhandled trace type:", trace.payload.message);
                  addBotMessage(trace.payload.message, "text", trace.payload);
                }
              }
            } catch (e) {
              console.error("Failed to parse trace data:", e, "Data:", dataString);
            }
          } else if (eventType === "end") {
            // console.log("Received end event");
            if (accumulatedContent && currentStreamingMessageId) {
              updateBotMessage(currentStreamingMessageId, accumulatedContent, { state: "end" });
              accumulatedContent = "";
              currentStreamingMessageId = null;
            }
            break readerLoop; // Exit the main reader loop
          } else {
            // Log any other event types we might be missing
            // console.log("Unhandled event type:", eventType, "data:", dataString);
          }
        }
      }

      // Final flush of the decoder
      const remainingDecoded = decoder.decode();
      if (remainingDecoded) {
        buffer += remainingDecoded;
        // console.log("Final remaining buffer content:", buffer);
      }

    } catch (error) {
      console.error("Failed to send message:", error);
      const errorMessage: Message = {
        sender: "bot", 
        text: "Error communicating with the chat service.", 
        type: "text",
        id: `error-${Date.now()}`
      };
      setMessages((prevMessages) => [...prevMessages, errorMessage]);
    } finally {
      setIsLoading(false);
      if (text && eventType !== 'launch') { // Don't clear input after launch
        setUserInput("");
      }
    }
  };

  // Send initial launch event to Voiceflow when component mounts
  useEffect(() => {
    sendMessageToVoiceflow(null, 'launch');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array ensures this runs only once on mount

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (userInput.trim() && !isLoading) {
      sendMessageToVoiceflow(userInput.trim());
    }
  };

  return (
    <>
      <Head>
        <title>Voiceflow API Chat</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div
        className={`${styles.page} ${geistSans.variable} ${geistMono.variable}`}
      >
        <main className={styles.main}>
          {/* Basic chat UI */}
          <div className={styles.chatContainer} style={{ width: "800px"}}>
            <div className={styles.messageArea}>
              {messages
                .filter(msg => msg.type !== "debug") // Filter out debug messages from UI
                .map((msg, index) => (
                <React.Fragment key={msg.id || index}>
                  {/* Render all text messages and messages with content */}
                  {(msg.type === 'text' || msg.type === 'image' || (msg.type === 'button' && msg.text)) && (
                    <div className={`${styles.message} ${msg.sender === 'user' ? styles.userMessage : styles.botMessage}`}>
                      {msg.type === 'text' && <p style={{ whiteSpace: 'pre-line' }}>{msg.text}</p>}
                      {msg.type === 'image' && msg.payload && msg.payload.image && <img src={msg.payload.image} alt="bot visual" />}
                      {msg.type === 'button' && msg.text && <p style={{ whiteSpace: 'pre-line' }}>{msg.text}</p>}
                    </div>
                  )}

                  {/* Render buttons separately if the message type is 'button' */}
                  {msg.type === 'button' && msg.payload && msg.payload.buttons && Array.isArray(msg.payload.buttons) && (
                    <div className={styles.buttonsContainer}>
                      {(msg.payload.buttons as Array<{name: string, request?: {type: string, payload: any}}>).map((button, btnIndex) => (
                        <button
                          key={btnIndex}
                          className={styles.chatButton}
                          onClick={() => {
                            if (isLoading) return;
                            let textToSend = button.name;
                            if (button.request && typeof button.request.payload === 'string' &&
                                (button.request.type === 'text' || button.request.type === 'path')) {
                              textToSend = button.request.payload;
                            } else if (button.request) {
                              console.warn(`Button action type '${button.request.type}' or payload not directly sendable as text. Sending button name. Request:`, button.request);
                            }
                            sendMessageToVoiceflow(textToSend);
                          }}
                          disabled={isLoading}
                        >
                          {button.name}
                        </button>
                      ))}
                    </div>
                  )}
                </React.Fragment>
              ))}
              {isLoading && <div className={styles.loadingIndicator}>
                {/* 3-dot animation */}
                <div className={styles.dotFlashing}></div>
              </div>}
              <div ref={messagesEndRef} />
            </div>
            <form onSubmit={handleSubmit} className={styles.inputArea}>
              <input
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="Type your message..."
                disabled={isLoading}
              />
              <button type="submit" disabled={isLoading}>
                Send
              </button>
            </form>
          </div>
        </main>
      </div>
    </>
  );
}

declare global {
  interface Window {
    voiceflow: any;
  }
}
