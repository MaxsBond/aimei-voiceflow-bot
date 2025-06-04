This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/pages/api-reference/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `pages/index.tsx`. The page auto-updates as you edit the file.

## Application Functionality

This project implements a chat client with the following features:

**Core Functionality: Chat Interface with Voiceflow Integration**

*   **Chat UI:**
    *   Displays a list of messages between the user and a bot.
    *   Provides an input field for the user to type messages and a "Send" button.
    *   Automatically scrolls to the latest message.
    *   Shows a loading indicator while waiting for bot responses.
*   **Voiceflow API Interaction:**
    *   Connects to a Voiceflow project using a (currently hardcoded) API key, user ID, project ID, and version ID.
    *   Sends an initial "launch" event to Voiceflow when the chat loads, passing predefined user data (`user_name`, `user_role`, `user_data_access`, `user_email`).
    *   Sends user text input to the Voiceflow API.
    *   Handles Server-Sent Events (SSE) for real-time, streamed responses from Voiceflow.
*   **Message Handling & Rendering:**
    *   Manages a state array (`messages`) containing message objects, each with a `sender` (`user` or `bot`), `text`, `type`, and optional `payload`.
    *   Supports and renders different message types received from Voiceflow:
        *   **Text:** Standard text messages.
        *   **Image:** Displays images sent by the bot.
        *   **Buttons (Choices):** Renders buttons based on Voiceflow's "choice" trace. Clicking a button sends either the button's label or a predefined payload as a message to Voiceflow.
        *   **Streamed Text (Completions):** Accumulates parts of a streamed "completion" event from Voiceflow and renders them as a single, progressively updated text message.
    *   Differentiates styling for user messages and bot messages.
*   **State Management:**
    *   `messages`: Stores the history of chat messages.
    *   `userInput`: Holds the current text in the input field.
    *   `isLoading`: Tracks whether the application is currently waiting for a response from Voiceflow.

**Technical Details:**

*   Built with Next.js and React (using functional components and hooks like `useState`, `useEffect`, `useRef`).
*   Uses `Geist` and `Geist_Mono` fonts.
*   Includes basic error handling for API communication failures, displaying an error message to the user.
*   Parses different event types from the Voiceflow SSE stream (`trace`, `end`) and different `trace.type` payloads (`completion`, `text`, `speak`, `visual`, `choice`).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn-pages-router) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/pages/building-your-application/deploying) for more details.
