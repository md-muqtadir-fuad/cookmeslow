import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Info, Loader2, ChefHat, Ghost, Flame, Copy, Reply, X, SmilePlus, Check, Bell, BellOff, Search, Share, MoreVertical, Edit2, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import { auth, db } from '../firebase';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot, doc, setDoc, getDoc, serverTimestamp, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';

interface Message {
  id: string;
  text: string;
  senderId: string;
  timestamp: number;
  isRead: boolean;
  isBurned: boolean;
  reactions?: Record<string, string[]>;
  replyTo?: {
    id: string;
    text: string;
    senderId: string;
    isHostMsg?: boolean;
  };
  isHostMsg?: boolean;
}

const getMessageHeat = (text: string) => {
  let score = text.length;
  const upperCaseCount = text.replace(/[^A-Z]/g, '').length;
  score += upperCaseCount * 2;
  const exclamationCount = text.replace(/[^!]/g, '').length;
  score += exclamationCount * 10;

  if (score < 40) return { 
    label: 'MILD', 
    color: 'text-yellow-500', 
    iconCount: 1,
    textClass: 'text-[15px]',
    glowClass: ''
  };
  if (score < 100) return { 
    label: 'SPICY', 
    color: 'text-orange-500', 
    iconCount: 2,
    textClass: 'text-[15px]',
    glowClass: 'shadow-[0_0_12px_rgba(249,115,22,0.4)] border-orange-500/50'
  };
  return { 
    label: 'FIRE', 
    color: 'text-red-500 animate-pulse', 
    iconCount: 3,
    textClass: 'text-[15px]',
    glowClass: 'shadow-[0_0_20px_rgba(239,68,68,0.7)] border-red-500'
  };
};

let isSigningIn = false;

export default function ChatRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [userId, setUserId] = useState<string>('');
  const [isHost, setIsHost] = useState(false);
  const [roomHostId, setRoomHostId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isGhosted, setIsGhosted] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showReactMenu, setShowReactMenu] = useState<string | null>(null);
  const [heatLevel, setHeatLevel] = useState(0);
  const [copied, setCopied] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'mine' | 'host'>('all');
  const [showSearch, setShowSearch] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [roomName, setRoomName] = useState<string>('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [notifyPermission, setNotifyPermission] = useState(
    'Notification' in window ? Notification.permission : 'default'
  );

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      alert("Your browser does not support notifications.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setNotifyPermission(permission);
      if (permission === 'denied') {
        alert("Notifications are blocked. Please enable them in your browser settings.");
      }
    } catch (error) {
      console.error("Error requesting notification permission:", error);
      alert("Could not request notification permission. You might need to enable it in your browser settings.");
    }
  };

  const prevMessagesLengthRef = useRef(0);

  const MAX_CHARS = 100;

  useEffect(() => {
    if (!roomId) return;

    let isMounted = true;
    let unsubscribeAuth: (() => void) | null = null;

    const setupAuthAndRoom = async () => {
      try {
        // 1. Check if this is a portal link (username) first (public read)
        const userDocRef = doc(db, 'users', roomId);
        const userDocSnap = await getDoc(userDocRef);
        
        if (userDocSnap.exists()) {
          const targetUserUid = userDocSnap.data().uid;
          
          // Ensure visitor is signed in anonymously
          let currentUserId = auth.currentUser?.uid;
          if (!currentUserId) {
            const cred = await signInAnonymously(auth);
            currentUserId = cred.user.uid;
          }
          
          // Create a new random room for this visitor
          const newRoomId = Math.random().toString(36).substring(2, 10);
          
          const adjectives = ['Spicy', 'Burnt', 'Sizzling', 'Smoky', 'Crispy', 'Salty', 'Sweet', 'Sour', 'Bitter', 'Tangy', 'Hot', 'Cold', 'Fresh', 'Stale', 'Greasy'];
          const nouns = ['Soup', 'Toast', 'Steak', 'Salad', 'Pasta', 'Pizza', 'Burger', 'Taco', 'Sushi', 'Curry', 'Noodles', 'Rice', 'Stew', 'Roast', 'Grill'];
          const randomName = `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;

          await setDoc(doc(db, 'rooms', newRoomId), {
            roomId: newRoomId,
            creatorId: targetUserUid,
            guestId: currentUserId,
            status: 'active',
            createdAt: serverTimestamp(),
            kitchenName: randomName
          });
          
          navigate(`/${newRoomId}`, { replace: true });
          return;
        }

        // 2. If not a username, it must be a room ID.
        // We MUST be authenticated to read room data (per security rules)
        let user = auth.currentUser;
        if (!user) {
          try {
            const cred = await signInAnonymously(auth);
            user = cred.user;
          } catch (authErr) {
            console.error("Auth failed", authErr);
            setError('Authentication failed');
            setLoading(false);
            return;
          }
        }

        const roomRef = doc(db, 'rooms', roomId);
        const roomSnap = await getDoc(roomRef);
        
        if (!isMounted) return;

        if (!roomSnap.exists() || roomSnap.data().status !== 'active') {
          setError('Room not found or closed');
          setLoading(false);
          return;
        }

        const creatorId = roomSnap.data().creatorId;
        setRoomHostId(creatorId);
        
        unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
          if (!isMounted) return;
          if (user) {
            setUserId(user.uid);
            const isUserHost = user.uid === creatorId;
            setIsHost(isUserHost);
            
            // If not host, set as guestId if not already set
            if (!isUserHost && !roomSnap.data().guestId) {
              try {
                await updateDoc(roomRef, { guestId: user.uid });
              } catch (e) {
                console.error("Failed to set guestId", e);
              }
            }
            setLoading(false);
          } else {
            if (isSigningIn) return;
            isSigningIn = true;
            try {
              const cred = await signInAnonymously(auth);
              if (isMounted) {
                setUserId(cred.user.uid);
                setIsHost(false);
                // Set as guestId
                if (!roomSnap.data().guestId) {
                  try {
                    await updateDoc(roomRef, { guestId: cred.user.uid });
                  } catch (e) {
                    console.error("Failed to set guestId", e);
                  }
                }
                setLoading(false);
              }
            } catch (err) {
              console.error("Error signing in anonymously:", err);
              if (isMounted) {
                setError('Failed to join kitchen');
                setLoading(false);
              }
            } finally {
              isSigningIn = false;
            }
          }
        });
      } catch (err) {
        console.error("Error setting up room:", err);
        if (isMounted) {
          setError('Failed to load kitchen');
          setLoading(false);
        }
      }
    };

    setupAuthAndRoom();

    return () => {
      isMounted = false;
      if (unsubscribeAuth) {
        unsubscribeAuth();
      }
    };
  }, [roomId]);

  // Listen for room deletion (Ghosting) and updates (name, typing)
  useEffect(() => {
    if (!roomId || loading || error) return;
    const roomRef = doc(db, 'rooms', roomId);
    const unsubscribe = onSnapshot(roomRef, (docSnap) => {
      if (!docSnap.exists() && !isHost) {
        setIsGhosted(true);
      } else if (docSnap.exists()) {
        const data = docSnap.data();
        setRoomName(data.kitchenName || roomId);
        setTypingUsers(data.typing || []);
      }
    });
    return () => unsubscribe();
  }, [roomId, loading, error, isHost]);

  useEffect(() => {
    if (!roomId || !userId) return;

    const messagesRef = collection(db, 'rooms', roomId, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        msgs.push({
          id: doc.id,
          text: data.text,
          senderId: data.senderId,
          timestamp: data.timestamp?.toMillis() || Date.now(),
          isRead: data.isRead || false,
          isBurned: data.isBurned || false,
          reactions: data.reactions || {},
          replyTo: data.replyTo || undefined,
          isHostMsg: data.isHostMsg || false,
        });
      });
      setMessages(msgs);
    }, (err) => {
      console.error("Error fetching messages:", err);
    });

    return () => unsubscribe();
  }, [roomId, userId]);

  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current) {
      const newMessages = messages.slice(prevMessagesLengthRef.current);
      const latestMessage = newMessages[newMessages.length - 1];
      
      if (latestMessage && latestMessage.senderId !== userId && document.hidden) {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('New Roast in Kitchen', {
            body: latestMessage.text,
          });
        }
      }
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages, userId]);

  // Calculate room heat based on recent messages
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const recentMessages = messages.filter(m => now - m.timestamp < 10000).length;
      // Max heat at 5 messages in 10 seconds
      const newHeat = Math.min(recentMessages / 5, 1);
      setHeatLevel(newHeat);
    }, 1000);
    return () => clearInterval(interval);
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || inputText.length > MAX_CHARS || !userId || !roomId) return;

    const messageText = inputText.trim();
    setInputText('');

    const messageId = Math.random().toString(36).substring(2, 15);
    const messageRef = doc(db, 'rooms', roomId, 'messages', messageId);

    const messageData: any = {
      text: messageText,
      senderId: userId,
      timestamp: serverTimestamp(),
      isRead: false,
      isBurned: false,
      reactions: {},
      isHostMsg: isHost
    };

    if (replyingTo) {
      messageData.replyTo = {
        id: replyingTo.id,
        text: replyingTo.text,
        senderId: replyingTo.senderId,
        isHostMsg: replyingTo.isHostMsg || false
      };
    }

    try {
      await setDoc(messageRef, messageData);
      setReplyingTo(null);
      
      // Clear typing status immediately after sending
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      const roomRef = doc(db, 'rooms', roomId);
      const roomSnap = await getDoc(roomRef);
      if (roomSnap.exists()) {
        const currentTyping = roomSnap.data().typing || [];
        await updateDoc(roomRef, {
          typing: currentTyping.filter((id: string) => id !== userId)
        });
      }
    } catch (err) {
      console.error("Error sending message:", err);
      setInputText(messageText);
    }
  };

  const toggleReaction = async (msg: Message, emoji: string) => {
    if (!roomId || !userId) return;
    const msgRef = doc(db, 'rooms', roomId, 'messages', msg.id);
    const currentReactions = msg.reactions || {};
    const usersForEmoji = currentReactions[emoji] || [];
    
    let newUsersForEmoji;
    if (usersForEmoji.includes(userId)) {
      newUsersForEmoji = usersForEmoji.filter(id => id !== userId);
    } else {
      newUsersForEmoji = [...usersForEmoji, userId];
    }
    
    const newReactions = { ...currentReactions };
    if (newUsersForEmoji.length === 0) {
      delete newReactions[emoji];
    } else {
      newReactions[emoji] = newUsersForEmoji;
    }
    
    try {
      await updateDoc(msgRef, { reactions: newReactions });
    } catch (err) {
      console.error("Error toggling reaction:", err);
    }
  };

  const closeKitchen = async () => {
    if (!roomId || !isHost) return;
    try {
      const messagesRef = collection(db, 'rooms', roomId, 'messages');
      const snapshot = await getDocs(messagesRef);
      const deletePromises = snapshot.docs.map(d => deleteDoc(d.ref));
      await Promise.all(deletePromises);
      await deleteDoc(doc(db, 'rooms', roomId));
      navigate('/kitchen');
    } catch (err) {
      console.error("Error closing kitchen:", err);
    }
  };

  const toggleBurn = async (msgId: string, currentBurnStatus: boolean) => {
    if (!isHost || !roomId) return;
    try {
      const msgRef = doc(db, 'rooms', roomId, 'messages', msgId);
      await updateDoc(msgRef, { isBurned: !currentBurnStatus });
    } catch (err) {
      console.error("Error burning message:", err);
    }
  };

  const handleTextChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    
    // Typing indicator logic
    if (!roomId || !userId) return;
    const roomRef = doc(db, 'rooms', roomId);
    
    try {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      } else {
        // Add user to typing array if not already there
        if (!typingUsers.includes(userId)) {
          await updateDoc(roomRef, {
            typing: [...typingUsers, userId]
          });
        }
      }

      // Remove user from typing array after 2 seconds of inactivity
      typingTimeoutRef.current = setTimeout(async () => {
        try {
          const roomSnap = await getDoc(roomRef);
          if (roomSnap.exists()) {
            const currentTyping = roomSnap.data().typing || [];
            await updateDoc(roomRef, {
              typing: currentTyping.filter((id: string) => id !== userId)
            });
          }
        } catch (err) {
          console.error("Error updating typing status:", err);
        }
        typingTimeoutRef.current = null;
      }, 2000);
    } catch (err) {
      console.error("Error setting typing status:", err);
    }
  };

  const updateRoomName = async () => {
    if (!roomId || !newRoomName.trim()) return;
    try {
      await updateDoc(doc(db, 'rooms', roomId), { kitchenName: newRoomName.trim() });
      setIsEditingName(false);
    } catch (err) {
      console.error("Error updating room name:", err);
    }
  };

  const deleteMessage = async (msgId: string) => {
    if (!roomId) return;
    try {
      await deleteDoc(doc(db, 'rooms', roomId, 'messages', msgId));
    } catch (err) {
      console.error("Error deleting message:", err);
    }
  };

  const getHeatColor = (len: number) => {
    if (len <= 50) return 'bg-yellow-400';
    if (len <= 80) return 'bg-orange-500';
    return 'bg-red-600 animate-pulse shadow-[0_0_10px_rgba(220,38,38,0.8)]';
  };

  const copyRoomLink = () => {
    const link = `${window.location.origin}/${roomId}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredMessages = useMemo(() => {
    return messages.filter(msg => {
      if (filterType === 'mine' && msg.senderId !== userId) return false;
      if (filterType === 'host' && !msg.isHostMsg) return false;
      if (searchQuery && !msg.text.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [messages, filterType, searchQuery, userId]);

  if (isGhosted) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#121212] p-6 text-center text-white">
        <div className="w-20 h-20 bg-[#1a1a1a] rounded-full flex items-center justify-center mb-6 border border-[#333] shadow-[0_0_30px_rgba(255,255,255,0.1)]">
          <Ghost className="w-10 h-10 text-gray-400 animate-bounce" />
        </div>
        <h2 className="text-2xl font-black mb-3 tracking-tight">The Kitchen is Closed.</h2>
        <p className="text-gray-400 mb-8 font-medium">You've been Ghosted.</p>
        <button 
          onClick={() => navigate('/')}
          className="px-8 py-3 bg-[#2a2a2a] hover:bg-[#333] text-white rounded-full font-bold transition-colors border border-[#444]"
        >
          Leave
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#121212] text-white">
        <Loader2 className="w-10 h-10 animate-spin text-[#FF4500]" />
        <p className="mt-4 text-gray-400 font-bold tracking-wide">Entering Kitchen...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#121212] p-6 text-center text-white">
        <div className="w-16 h-16 bg-red-900/30 text-red-500 rounded-2xl flex items-center justify-center mb-4 border border-red-900/50">
          <Info className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold mb-2">Cannot Enter Kitchen</h2>
        <p className="text-gray-400 mb-6">{error}</p>
        <button 
          onClick={() => navigate('/')}
          className="px-6 py-3 bg-[#FF4500] text-white rounded-full font-bold hover:bg-[#ff571a] transition-colors"
        >
          Go to Home
        </button>
      </div>
    );
  }

  return (
    <div 
      className="flex flex-col h-full text-white transition-colors duration-1000"
      style={{ backgroundColor: heatLevel > 0 ? `rgba(255, 69, 0, ${heatLevel * 0.15})` : '#121212' }}
    >
      {/* Chat Header */}
      <header className="bg-[#1a1a1a] border-b border-[#333] px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-md">
        <div className="flex items-center gap-3">
          {isHost && (
            <button onClick={() => navigate('/kitchen')} className="p-2 -ml-2 hover:bg-[#333] rounded-full transition-colors text-gray-400 hover:text-white">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <img 
            src="/logo.png" 
            alt="Logo" 
            className="w-10 h-10 rounded-full object-cover hidden sm:block"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <div>
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  className="bg-[#121212] border border-[#333] rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-[#FF4500]"
                  placeholder="Kitchen Name"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && updateRoomName()}
                />
                <button onClick={updateRoomName} className="text-green-500 hover:text-green-400">
                  <Check className="w-4 h-4" />
                </button>
                <button onClick={() => setIsEditingName(false)} className="text-gray-500 hover:text-gray-400">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <h1 
                className="font-bold text-lg leading-tight flex items-center gap-2 cursor-pointer hover:text-[#FF4500] transition-colors"
                onClick={() => {
                  setNewRoomName(roomName);
                  setIsEditingName(true);
                }}
                title="Click to edit name"
              >
                {isHost ? <ChefHat className="w-5 h-5 text-[#FF4500]" /> : <Ghost className="w-5 h-5 text-gray-400" />}
                {roomName}
              </h1>
            )}
            <p className="text-xs text-gray-500 font-medium mt-0.5">
              {isHost ? 'You are the Chef' : 'You are the Roaster'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 relative">
          <button 
            onClick={() => setShowMenu(!showMenu)}
            className="p-1.5 bg-[#2a2a2a] hover:bg-[#333] text-gray-300 rounded-full transition-colors flex items-center justify-center"
            title="More Options"
          >
            <MoreVertical className="w-5 h-5" />
          </button>

          {showMenu && (
            <div className="absolute top-full right-0 mt-2 w-48 bg-[#1a1a1a] border border-[#333] rounded-xl shadow-xl overflow-hidden z-50">
              <button
                onClick={() => {
                  setNewRoomName(roomName);
                  setIsEditingName(true);
                  setShowMenu(false);
                }}
                className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-[#2a2a2a] hover:text-white flex items-center gap-3 transition-colors"
              >
                <Edit2 className="w-4 h-4" />
                Edit Kitchen Name
              </button>
              <button
                onClick={() => {
                  setShowSearch(!showSearch);
                  setShowMenu(false);
                }}
                className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-[#2a2a2a] hover:text-white flex items-center gap-3 transition-colors"
              >
                <Search className="w-4 h-4" />
                Search Messages
              </button>
              {'Notification' in window && (
                <button
                  onClick={() => {
                    if (notifyPermission !== 'granted') requestNotificationPermission();
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-[#2a2a2a] hover:text-white flex items-center gap-3 transition-colors"
                >
                  {notifyPermission === 'granted' ? <Bell className="w-4 h-4 text-[#FF4500]" /> : <BellOff className="w-4 h-4" />}
                  {notifyPermission === 'granted' ? 'Notifications On' : 'Enable Notifications'}
                </button>
              )}
              <button
                onClick={() => {
                  copyRoomLink();
                  setShowMenu(false);
                }}
                className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-[#2a2a2a] hover:text-white flex items-center gap-3 transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Link Copied!' : 'Copy Room Link'}
              </button>
              {isHost && (
                <button
                  onClick={() => {
                    closeKitchen();
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-4 py-3 text-sm text-red-500 hover:bg-red-500/10 flex items-center gap-3 transition-colors border-t border-[#333]"
                >
                  <Trash2 className="w-4 h-4" />
                  Close Kitchen
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Search & Filter Bar */}
      {showSearch && (
        <div className="bg-[#1a1a1a] border-b border-[#333] p-3 flex gap-2 z-10 shadow-sm animate-in slide-in-from-top-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search messages..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-[#121212] border border-[#333] rounded-full py-2 pl-9 pr-4 text-sm text-white focus:outline-none focus:border-[#FF4500] transition-colors"
            />
          </div>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value as any)}
            className="bg-[#121212] border border-[#333] rounded-full px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FF4500] transition-colors appearance-none"
          >
            <option value="all">All</option>
            <option value="mine">Mine</option>
            <option value="host">Chef's</option>
          </select>
        </div>
      )}

      {/* Messages Area */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {filteredMessages.length === 0 && (
          <div className="flex justify-center mb-8 mt-4">
            <div className="bg-[#1a1a1a] border border-[#333] text-gray-400 text-xs py-2 px-4 rounded-xl shadow-sm flex items-center gap-2 max-w-[85%] text-center font-medium">
              <Flame className="w-4 h-4 text-[#FF4500] shrink-0" />
              <span>{messages.length === 0 ? 'The stove is cold. Start roasting!' : 'No messages match your search.'}</span>
            </div>
          </div>
        )}

        {filteredMessages.map((msg) => {
          const isMe = msg.senderId === userId;
          const isMsgHost = msg.isHostMsg;
          
          return (
            <div key={msg.id} className={cn("flex items-end gap-2 group", isMe ? "justify-end" : "justify-start")}>
              
              {/* Actions for my messages (left side) */}
              {isMe && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity mb-2">
                  <button onClick={() => setShowReactMenu(showReactMenu === msg.id ? null : msg.id)} className="p-1.5 bg-[#2a2a2a] hover:bg-[#333] rounded-full text-gray-400 hover:text-white relative">
                    <SmilePlus className="w-4 h-4" />
                    {showReactMenu === msg.id && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-[#1a1a1a] border border-[#333] rounded-full px-2 py-1 flex gap-1 shadow-xl z-20">
                        {['🔥', '😂', '💀', '👀'].map(emoji => (
                          <span key={emoji} onClick={(e) => { e.stopPropagation(); toggleReaction(msg, emoji); setShowReactMenu(null); }} className="cursor-pointer hover:scale-125 transition-transform text-lg">{emoji}</span>
                        ))}
                      </div>
                    )}
                  </button>
                  <button onClick={() => setReplyingTo(msg)} className="p-1.5 bg-[#2a2a2a] hover:bg-[#333] rounded-full text-gray-400 hover:text-white"><Reply className="w-4 h-4" /></button>
                  <button onClick={() => { navigator.clipboard.writeText(msg.text); }} className="p-1.5 bg-[#2a2a2a] hover:bg-[#333] rounded-full text-gray-400 hover:text-white"><Copy className="w-4 h-4" /></button>
                  <button onClick={() => deleteMessage(msg.id)} className="p-1.5 bg-[#2a2a2a] hover:bg-red-500/20 rounded-full text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                </div>
              )}

              {!isMe && isHost && (
                <button 
                  onClick={() => toggleBurn(msg.id, msg.isBurned)}
                  className={cn(
                    "p-1.5 rounded-full transition-all mb-1",
                    msg.isBurned ? "bg-red-500/20 text-red-500" : "bg-[#2a2a2a] text-gray-500 hover:text-[#FF4500]"
                  )}
                  title="Burn this roast"
                >
                  <Flame className="w-4 h-4" />
                </button>
              )}
              
              <div className="flex flex-col max-w-[75%]">
                <div className={cn("flex items-center gap-1.5 mb-1 px-1", isMe && "justify-end")}>
                  {isMsgHost ? (
                    <>
                      <ChefHat className="w-3 h-3 text-[#FF4500]" />
                      <span className="text-[10px] font-bold text-[#FF4500] uppercase tracking-wider">Chef</span>
                    </>
                  ) : (
                    <>
                      <Ghost className="w-3 h-3 text-gray-500" />
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Roaster</span>
                    </>
                  )}
                  
                  <span className="text-[#444] text-[10px] mx-0.5">•</span>
                  <div className={cn("flex items-center", getMessageHeat(msg.text).color)} title="Heat Level">
                    {Array.from({ length: getMessageHeat(msg.text).iconCount }).map((_, i) => (
                      <Flame key={i} className="w-3 h-3" />
                    ))}
                    <span className="text-[9px] font-bold ml-0.5 tracking-wider">{getMessageHeat(msg.text).label}</span>
                  </div>
                </div>
                
                <div 
                  className={cn(
                    "rounded-2xl px-4 py-2.5 shadow-sm relative transition-all duration-300",
                    isMsgHost 
                      ? "bg-[#FF4500] text-white" 
                      : "bg-[#2a2a2a] text-gray-100 border border-[#333]",
                    isMe ? "rounded-tr-sm" : "rounded-tl-sm",
                    msg.isBurned && !isMsgHost && "shadow-[0_0_15px_rgba(220,38,38,0.5)] border-red-500/50",
                    !msg.isBurned && getMessageHeat(msg.text).glowClass
                  )}
                >
                  {msg.replyTo && (
                    <div className="mb-2 pl-2 border-l-2 border-white/30 bg-black/10 rounded-r-md p-1.5">
                      <span className="text-[10px] font-bold text-white/80 block mb-0.5">
                        Replying to {msg.replyTo.isHostMsg ? 'Chef' : 'Roaster'}
                      </span>
                      <p className="text-xs text-white/70 truncate">{msg.replyTo.text}</p>
                    </div>
                  )}
                  <p className={cn("leading-relaxed break-words", getMessageHeat(msg.text).textClass)}>{msg.text}</p>
                  <div className={cn(
                    "text-[9px] text-right mt-1.5 font-bold",
                    isMsgHost ? "text-orange-200" : "text-gray-500"
                  )}>
                    {format(msg.timestamp, 'h:mm a')}
                  </div>
                </div>

                {/* Reactions Display */}
                {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                  <div className={cn("flex flex-wrap gap-1 mt-1.5", isMe ? "justify-end" : "justify-start")}>
                    {(Object.entries(msg.reactions) as [string, string[]][]).map(([emoji, users]) => (
                      users.length > 0 && (
                        <button 
                          key={emoji}
                          onClick={() => toggleReaction(msg, emoji)}
                          className={cn(
                            "px-1.5 py-0.5 rounded-full text-[11px] flex items-center gap-1 border transition-colors",
                            users.includes(userId) 
                              ? "bg-[#FF4500]/20 border-[#FF4500]/50 text-[#FF4500]" 
                              : "bg-[#2a2a2a] border-[#333] text-gray-400 hover:border-gray-500"
                          )}
                        >
                          <span>{emoji}</span>
                          <span className="font-bold">{users.length}</span>
                        </button>
                      )
                    ))}
                  </div>
                )}
              </div>

              {/* Actions for others' messages (right side) */}
              {!isMe && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity mb-2">
                  <button onClick={() => { navigator.clipboard.writeText(msg.text); }} className="p-1.5 bg-[#2a2a2a] hover:bg-[#333] rounded-full text-gray-400 hover:text-white"><Copy className="w-4 h-4" /></button>
                  <button onClick={() => setReplyingTo(msg)} className="p-1.5 bg-[#2a2a2a] hover:bg-[#333] rounded-full text-gray-400 hover:text-white"><Reply className="w-4 h-4" /></button>
                  <button onClick={() => setShowReactMenu(showReactMenu === msg.id ? null : msg.id)} className="p-1.5 bg-[#2a2a2a] hover:bg-[#333] rounded-full text-gray-400 hover:text-white relative">
                    <SmilePlus className="w-4 h-4" />
                    {showReactMenu === msg.id && (
                      <div className="absolute bottom-full right-0 mb-2 bg-[#1a1a1a] border border-[#333] rounded-full px-2 py-1 flex gap-1 shadow-xl z-20">
                        {['🔥', '😂', '💀', '👀'].map(emoji => (
                          <span key={emoji} onClick={(e) => { e.stopPropagation(); toggleReaction(msg, emoji); setShowReactMenu(null); }} className="cursor-pointer hover:scale-125 transition-transform text-lg">{emoji}</span>
                        ))}
                      </div>
                    )}
                  </button>
                  {isHost && (
                    <button onClick={() => deleteMessage(msg.id)} className="p-1.5 bg-[#2a2a2a] hover:bg-red-500/20 rounded-full text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </main>

      {/* Typing Indicator */}
      {typingUsers.filter(id => id !== userId).length > 0 && (
        <div className="px-4 py-1 text-xs text-gray-400 italic bg-[#121212]">
          {typingUsers.filter(id => id !== userId).length === 1 
            ? "Someone is typing..." 
            : "Multiple people are typing..."}
        </div>
      )}

      {/* Input Area */}
      <footer className="bg-[#1a1a1a] border-t border-[#333] p-3 pb-safe flex flex-col gap-2">
        {replyingTo && (
          <div className="flex items-center justify-between bg-[#2a2a2a] p-2 rounded-xl border border-[#333] mx-1">
            <div className="flex flex-col overflow-hidden">
              <span className="text-[10px] font-bold text-[#FF4500] uppercase tracking-wider mb-0.5">
                Replying to {replyingTo.isHostMsg ? 'Chef' : 'Roaster'}
              </span>
              <span className="text-xs text-gray-300 truncate">{replyingTo.text}</span>
            </div>
            <button onClick={() => setReplyingTo(null)} className="p-1.5 text-gray-500 hover:text-white rounded-full hover:bg-[#333] transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <form onSubmit={sendMessage} className="flex gap-2 items-center">
          <div className="flex-1 bg-[#121212] rounded-3xl border border-[#FF4500] focus-within:border-[#ff571a] transition-colors overflow-hidden flex flex-col shadow-[0_0_10px_rgba(255,69,0,0.1)]">
            <input
              type="text"
              value={inputText}
              onChange={handleTextChange}
              placeholder="Drop a roast..."
              className="w-full px-5 py-3.5 outline-none bg-transparent text-white placeholder-gray-600 font-medium"
            />
            
            {/* Heat Meter */}
            <div className="px-5 pb-3 flex flex-col gap-1.5">
              <div className="h-1.5 w-full bg-[#2a2a2a] rounded-full overflow-hidden">
                <div 
                  className={cn("h-full transition-all duration-300", getHeatColor(inputText.length))}
                  style={{ width: `${Math.min((inputText.length / MAX_CHARS) * 100, 100)}%` }}
                />
              </div>
              <div className="flex justify-end">
                <span className={cn(
                  "text-[10px] font-bold tracking-wider",
                  inputText.length > MAX_CHARS ? "text-red-500" : "text-gray-500"
                )}>
                  {inputText.length}/{MAX_CHARS}
                </span>
              </div>
            </div>
          </div>
          
          <button
            type="submit"
            disabled={!inputText.trim() || inputText.length > MAX_CHARS}
            className="h-[60px] px-6 shrink-0 bg-[#FF4500] hover:bg-[#ff571a] disabled:bg-[#2a2a2a] disabled:text-gray-500 disabled:cursor-not-allowed text-white rounded-full flex flex-row items-center justify-center gap-2 shadow-[0_4px_14px_0_rgba(255,69,0,0.39)] disabled:shadow-none transition-all"
          >
            <Flame className="w-5 h-5" />
            <span className="text-sm font-bold uppercase tracking-wider">Serve</span>
          </button>
        </form>
      </footer>
    </div>
  );
}