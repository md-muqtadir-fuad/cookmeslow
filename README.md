# CookMeSlow 🔥

CookMeSlow is a real-time, anonymous-friendly chat application designed for quick, ephemeral conversations ("Kitchens"). Users can create rooms instantly, share links, and engage in fast-paced text chats with features like message burning, reactions, and shared room management.

## Features

### Authentication & Access
* **Anonymous Sign-in:** Users can instantly create or join a Kitchen without registering. Anonymous sessions are persisted locally.
* **Registered Accounts:** Users can optionally create an account with an email and password to reserve a username and keep track of their Kitchens across devices.

### Kitchens (Chat Rooms)
* **Instant Creation:** Create a Kitchen with a single click.
* **Shared Metadata Editing:** Both the Kitchen Creator (Chef) and the Guest (Roaster) can rename the Kitchen in real-time.
* **Role-Based Access:** 
  * **Chef (Creator):** Has full control. Can edit the name, burn messages, delete any message, and close (delete) the entire Kitchen.
  * **Roaster (Guest):** Can join via link, edit the Kitchen name, send messages, and delete their own messages.

### Real-Time Messaging
* **Live Chat:** Instant message delivery powered by Firebase Firestore.
* **Typing Indicators:** See when the other person is typing.
* **Message Reactions:** React to individual messages with emojis (🔥, 💀, 💯, 👀, 🧢).
* **Message Replies:** Reply directly to specific messages for better context.
* **Message Deletion:** Users can delete their own messages. The Chef can delete any message.
* **Message Burning:** The Chef can "burn" (hide/redact) specific messages.
* **Heat Level:** A visual indicator that increases based on the frequency of recent messages.

## Technical Architecture

### Tech Stack
* **Frontend:** React 18, TypeScript, Vite
* **Styling:** Tailwind CSS
* **Icons:** Lucide React
* **Backend/Database:** Firebase (Authentication, Firestore)
* **Routing:** React Router DOM

### Database Schema (Firestore)

#### `users` Collection
* `uid` (string): Unique user identifier.
* `createdAt` (timestamp): Account creation time.

#### `rooms` Collection
* `roomId` (string): Unique room identifier (used in URLs).
* `creatorId` (string): UID of the user who created the room.
* `guestId` (string, optional): UID of the user who joined the room.
* `kitchenName` (string): The display name of the room.
* `status` (string): 'active' or 'closed'.
* `createdAt` (timestamp): Room creation time.
* `typing` (array): List of UIDs currently typing.

#### `rooms/{roomId}/messages` Subcollection
* `id` (string): Message identifier.
* `text` (string): Message content.
* `senderId` (string): UID of the sender.
* `timestamp` (timestamp): Time sent.
* `isRead` (boolean): Read status.
* `isBurned` (boolean): Whether the message was burned by the Chef.
* `reactions` (map): Map of emoji strings to arrays of UIDs.
* `replyTo` (map, optional): Reference to a parent message.
* `isHostMsg` (boolean): True if sent by the Chef.

## Security Rules

The application uses strict Firebase Security Rules to ensure data integrity and privacy:
* **Room Creation:** Any authenticated user can create a room.
* **Room Updates:** Only the `creatorId` or `guestId` can update the `kitchenName` and `typing` status.
* **Room Deletion:** Only the `creatorId` can delete the room document and its messages.
* **Message Creation:** Only authenticated users can send messages to active rooms.
* **Message Updates:** Senders can update their own messages (e.g., for reactions). The Chef can update any message (e.g., to burn it).

## Getting Started (Development)

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Environment Setup:**
   Ensure your Firebase configuration is properly set up in `firebase-applet-config.json` or your `.env` file.

3. **Run Development Server:**
   ```bash
   npm run dev
   ```

4. **Build for Production:**
   ```bash
   npm run build
   ```
