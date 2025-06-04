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
  type: "text" | "image" | "card" | "carousel" | "button"; // Add other types as needed
  payload?: any; // For rich content like images, buttons, cards
}

const VOICEFLOW_API_KEY = "VF.DM.683f8d058602f52f00c527c6.rfQSfRv39vC1kyHf"; // IMPORTANT: Move to env var for production
const USER_ID = "user_12345"; 
const VOICEFLOW_PROJECT_ID = "683ce60b42015279f6c3d566"; // If needed for specific launch/config
const VOICEFLOW_VERSION_ID = "production"; // Or specific version

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
      setMessages((prevMessages) => [...prevMessages, { sender: "user", text, type: "text" }]);
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
          user_data_access: 'Full',
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
        setMessages((prevMessages) => [
          ...prevMessages,
          { sender: "bot", text: `Error: ${errorData.message || "Failed to connect to Voiceflow."}`, type: "text" },
        ]);
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
      let currentBotMessageId: string | number | null = null; // To update the same bot message, can be a unique ID or index

      const addOrUpdateBotMessage = (
        text: string, 
        type: "text" | "image" | "card" | "carousel" | "button" = "text", 
        payload?: any, 
        isFinalForStream: boolean = true, // Indicates if this is the final part of a stream for a single logical message
        messageId?: string | number // Optional ID to specifically target a message for update
      ) => {
        setMessages(prevMessages => {
          const uniqueMessageId = messageId || (currentBotMessageId !== null ? currentBotMessageId : `bot-msg-${Date.now()}-${Math.random()}`);
          
          const existingMessageIndex = prevMessages.findIndex(msg => msg.payload?.id === uniqueMessageId || (typeof uniqueMessageId === 'number' && prevMessages.indexOf(msg) === uniqueMessageId));          

          if (existingMessageIndex !== -1 && !isFinalForStream) {
            // Update existing message if it's not final
            return prevMessages.map((msg, index) => 
              index === existingMessageIndex
              ? { ...msg, text: text, type, payload: { ...msg.payload, ...payload, id: uniqueMessageId } } 
              : msg
            );
          } else if (existingMessageIndex !== -1 && isFinalForStream) {
            // Finalize an existing streamed message
             const finalMessage = { 
                sender: "bot" as const, 
                text, 
                type, 
                payload: { ...prevMessages[existingMessageIndex].payload, ...payload, id: uniqueMessageId } 
            };
            const updatedMessages = prevMessages.map((msg, index) => 
              index === existingMessageIndex ? finalMessage : msg
            );
            if (currentBotMessageId === uniqueMessageId) {
                currentBotMessageId = null;
                accumulatedContent = "";
            }
            return updatedMessages;
          } else {
            // Add new message
            const newMessage = { 
                sender: "bot" as const, 
                text, 
                type, 
                payload: { ...payload, id: uniqueMessageId } 
            };
            if (!isFinalForStream) {
              currentBotMessageId = uniqueMessageId; // Set this as the message being actively streamed
            }
            return [...prevMessages, newMessage];
          }
        });
      };

      readerLoop: while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (accumulatedContent) {
            addOrUpdateBotMessage(accumulatedContent, "text", undefined, true, currentBotMessageId ?? undefined);
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

          if (eventType === "trace" && dataString) {
            try {
              const trace = JSON.parse(dataString);
              const messageBaseId = `trace-${trace.time || Date.now()}`;

              if (trace.type === "completion") {
                if (trace.payload.state === "start") {
                  accumulatedContent = ""; 
                  currentBotMessageId = `${messageBaseId}-completion`;
                  addOrUpdateBotMessage("", "text", { state: "start" }, false, currentBotMessageId);
                } else if (trace.payload.state === "content" && trace.payload.content) {
                  accumulatedContent += trace.payload.content;
                  addOrUpdateBotMessage(accumulatedContent, "text", { state: "content" }, false, currentBotMessageId ?? undefined);
                } else if (trace.payload.state === "end") {
                  addOrUpdateBotMessage(accumulatedContent || " ", "text", { state: "end" }, true, currentBotMessageId ?? undefined);
                  accumulatedContent = "";
                  currentBotMessageId = null;
                }
              } else if (trace.type === "text" || trace.type === "speak") {
                if (trace.payload.message) {
                  addOrUpdateBotMessage(trace.payload.message, "text", { ...trace.payload, id: `${messageBaseId}-text` }, true);
                }
              } else if (trace.type === "visual" && trace.payload.visualType === "image") {
                addOrUpdateBotMessage("Image", "image", { ...trace.payload, id: `${messageBaseId}-image` }, true);
              } else if (trace.type === "choice" && trace.payload.buttons && trace.payload.buttons.length > 0) {
                const introText = trace.payload.message || "";
                addOrUpdateBotMessage(introText, "button", { buttons: trace.payload.buttons, id: `${messageBaseId}-buttons`, ...trace.payload }, true);
              }
              // Add more handlers for other trace types (cards, etc.)
            } catch (e) {
              console.error("Failed to parse trace data:", e, "Data:", dataString);
            }
          } else if (eventType === "end") {
            if (accumulatedContent) {
              addOrUpdateBotMessage(accumulatedContent, "text", undefined, true, currentBotMessageId ?? undefined);
              accumulatedContent = "";
              currentBotMessageId = null;
            }
            // Optional: Signal conversation ended if no other messages were processed or based on specific logic
            // This is the end of the stream for *this* interaction, not necessarily the whole conversation session.
            // Consider if a specific "Conversation ended." message is always appropriate here.
            console.log("Voiceflow SSE stream ended for this interaction.");
            break readerLoop; // Exit the main reader loop
          }
        }
      }
      // Final flush of the decoder, though usually not needed for SSE with \n\n termination
      const remainingDecoded = decoder.decode();
      if (remainingDecoded) {
        buffer += remainingDecoded;
        // Process any final, potentially incomplete, message in buffer - similar to loop above
        // This is less common for well-behaved SSE streams that terminate events with \n\n
        console.log("Final remaining buffer content:", buffer)
      }

    } catch (error) {
      console.error("Failed to send message:", error);
      setMessages((prevMessages) => [
        ...prevMessages,
        { sender: "bot", text: "Error communicating with the chat service.", type: "text" },
      ]);
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
              {messages.map((msg, index) => (
                <React.Fragment key={index}>
                  {/* Conditionally render the message bubble if there's content for it */}
                  {(msg.type === 'text' || msg.type === 'image' || (msg.type === 'button' && msg.text)) && (
                    <div className={`${styles.message} ${msg.sender === 'user' ? styles.userMessage : styles.botMessage}`}>
                      {msg.type === 'text' && <p style={{ whiteSpace: 'pre-line' }}>{msg.text}</p>}
                      {msg.type === 'image' && msg.payload.image && <img src={msg.payload.image} alt="bot visual" />}
                      {msg.type === 'button' && msg.text && <p style={{ whiteSpace: 'pre-line' }}>{msg.text}</p>}
                      {/* Add rendering for other message types (cards) here, if they should be in a bubble */}
                    </div>
                  )}

                  {/* Render buttons separately if the message type is 'button' */}
                  {msg.type === 'button' && msg.payload && msg.payload.buttons && Array.isArray(msg.payload.buttons) && (
                    <div className={styles.buttonsContainer}> {/* This div now directly holds the buttons, outside the main message bubble */}
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
