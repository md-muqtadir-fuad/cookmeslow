import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, Trash2, Copy, ChefHat, LogOut, Check, Bell, BellOff, Share } from 'lucide-react';
import { format } from 'date-fns';
import { auth, db } from '../firebase';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp, getDocs, orderBy, limit } from 'firebase/firestore';

interface Room {
  roomId: string;
  creatorId: string;
  guestId?: string;
  status: 'active' | 'closed';
  createdAt: number;
  kitchenName?: string;
}

export default function Dashboard() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const navigate = useNavigate();

  const [isCreating, setIsCreating] = useState(false);
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user || user.isAnonymous) {
        navigate('/');
      } else {
        setUserId(user.uid);
        // Fetch username
        const q = query(collection(db, 'users'), where('uid', '==', user.uid));
        const snap = await getDocs(q);
        if (!snap.empty) {
          setUsername(snap.docs[0].id);
        } else {
          // If no username found, they might be from an old session
          const localUsername = localStorage.getItem('cookmeslow_username');
          if (localUsername) {
            setUsername(localUsername);
          } else {
            // Force them to login again to pick a username
            await signOut(auth);
            navigate('/');
          }
        }
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (!userId) return;

    const q = query(
      collection(db, 'rooms'),
      where('creatorId', '==', userId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const roomData: Room[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        roomData.push({
          roomId: data.roomId,
          creatorId: data.creatorId,
          guestId: data.guestId,
          status: data.status,
          createdAt: data.createdAt?.toMillis() || Date.now(),
          kitchenName: data.kitchenName
        });
      });
      // Sort by createdAt descending
      roomData.sort((a, b) => b.createdAt - a.createdAt);
      setRooms(roomData);
    }, (error) => {
      console.error("Error fetching rooms:", error);
    });

    return () => unsubscribe();
  }, [username]);

  useEffect(() => {
    if (rooms.length === 0 || !userId || notifyPermission !== 'granted') return;

    const unsubscribes = rooms.map(room => {
      const messagesRef = collection(db, 'rooms', room.roomId, 'messages');
      const q = query(messagesRef, orderBy('timestamp', 'desc'), limit(1));
      
      let isFirstSnapshot = true;
      
      return onSnapshot(q, (snapshot) => {
        if (isFirstSnapshot) {
          isFirstSnapshot = false;
          return;
        }
        
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data();
            if (data.senderId !== userId) {
              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification(`New message in ${room.roomId}`, {
                  body: data.text,
                });
              }
            }
          }
        });
      });
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [rooms, userId, notifyPermission]);

  const createRoom = async () => {
    if (!userId || isCreating) return;
    setIsCreating(true);
    const newRoomId = Math.random().toString(36).substring(2, 10);
    
    const adjectives = ['Spicy', 'Burnt', 'Sizzling', 'Smoky', 'Crispy', 'Salty', 'Sweet', 'Sour', 'Bitter', 'Tangy', 'Hot', 'Cold', 'Fresh', 'Stale', 'Greasy'];
    const nouns = ['Soup', 'Toast', 'Steak', 'Salad', 'Pasta', 'Pizza', 'Burger', 'Taco', 'Sushi', 'Curry', 'Noodles', 'Rice', 'Stew', 'Roast', 'Grill'];
    const randomName = `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;

    try {
      await setDoc(doc(db, 'rooms', newRoomId), {
        roomId: newRoomId,
        creatorId: userId,
        status: 'active',
        createdAt: serverTimestamp(),
        kitchenName: randomName
      });
      navigate(`/${newRoomId}`);
    } catch (error) {
      console.error("Error creating room:", error);
      alert("Failed to light the stove. Please check your connection and try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const closeRoom = async (roomId: string) => {
    try {
      // Delete messages subcollection first
      const messagesRef = collection(db, 'rooms', roomId, 'messages');
      const snapshot = await getDocs(messagesRef);
      const deletePromises = snapshot.docs.map(d => deleteDoc(d.ref));
      await Promise.all(deletePromises);
      
      // Delete room
      await deleteDoc(doc(db, 'rooms', roomId));
    } catch (error) {
      console.error("Error closing room:", error);
    }
  };

  const copyPortalLink = () => {
    if (!username || username === 'Anonymous') return;
    const link = `${window.location.origin}/${username}`;
    navigator.clipboard.writeText(link);
    setCopiedId('portal');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const copyLink = (roomId: string) => {
    const link = `${window.location.origin}/${roomId}`;
    navigator.clipboard.writeText(link);
    setCopiedId(roomId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem('cookmeslow_username');
      navigate('/');
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#121212] text-white">
      <header className="bg-[#1a1a1a] border-b border-[#333] px-4 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <img 
            src="/logo.png" 
            alt="Logo" 
            className="w-10 h-10 rounded-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextElementSibling?.classList.remove('hidden');
            }}
          />
          <div className="hidden w-8 h-8 bg-[#FF4500] rounded-full flex items-center justify-center shadow-[0_0_10px_rgba(255,69,0,0.4)]">
            <ChefHat className="w-5 h-5 text-white" />
          </div>
          <h1 className="font-bold text-lg tracking-wide">The Kitchen</h1>
        </div>
        <div className="flex items-center gap-2">
          {'Notification' in window && notifyPermission !== 'granted' && (
            <button 
              onClick={requestNotificationPermission} 
              className="relative z-20 p-2 text-gray-400 hover:text-white hover:bg-[#333] rounded-full transition-colors"
              title="Enable Notifications"
            >
              <BellOff className="w-5 h-5" />
            </button>
          )}
          {'Notification' in window && notifyPermission === 'granted' && (
            <button 
              className="relative z-20 p-2 text-[#FF4500] hover:bg-[#333] rounded-full transition-colors cursor-default"
              title="Notifications Enabled"
            >
              <Bell className="w-5 h-5" />
            </button>
          )}
          <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-white hover:bg-[#333] rounded-full transition-colors">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        {username && username !== 'Anonymous' && (
          <div className="mb-8">
            <h2 className="text-xs font-bold text-[#FF4500] uppercase tracking-widest mb-3">Your Roast Portal</h2>
            <div className="bg-gradient-to-br from-[#1a1a1a] to-[#3a1a1a] border-2 border-[#FF4500] rounded-2xl p-5 shadow-[0_0_20px_rgba(255,69,0,0.2)] flex flex-col gap-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-mono text-lg font-bold text-[#FF4500]">
                    cookmeslow.app/{username}
                  </div>
                  <div className="text-xs text-gray-400 mt-1 font-medium">
                    This is your permanent link. Share it to get roasted!
                  </div>
                </div>
                <div className="w-10 h-10 bg-[#FF4500] rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(255,69,0,0.4)]">
                  <Share className="w-6 h-6 text-white" />
                </div>
              </div>

              <div className="text-center mt-2 mb-2">
                <p className="text-sm text-gray-400">
                  Anyone who visits this link will land in a <strong className="text-white">direct random kitchen</strong> to roast you.
                </p>
              </div>
              
              <button 
                onClick={copyPortalLink}
                className="w-full py-3 px-4 bg-[#FF4500] hover:bg-[#ff571a] text-white font-bold rounded-full transition-all shadow-[0_4px_14px_0_rgba(255,69,0,0.39)] flex items-center justify-center gap-2"
              >
                {copiedId === 'portal' ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                {copiedId === 'portal' ? 'Portal Link Copied!' : 'Copy Portal Link'}
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Active Kitchens</h2>
          <button 
            onClick={createRoom}
            disabled={isCreating}
            className="text-xs font-bold text-[#FF4500] hover:text-[#ff571a] flex items-center gap-1 transition-colors"
          >
            <Flame className="w-3 h-3" />
            New Stove
          </button>
        </div>

        <div className="space-y-3">
          {rooms.length === 0 ? (
            <div className="text-center py-12 text-gray-500 bg-[#1a1a1a] rounded-3xl border border-[#333] border-dashed">
              <ChefHat className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="font-medium">No active stoves</p>
            </div>
          ) : (
            rooms.map((room) => (
              <div key={room.roomId} className="bg-gradient-to-br from-[#1a1a1a] to-[#2a1a1a] border border-[#FF4500]/30 rounded-2xl p-5 shadow-[0_0_15px_rgba(255,69,0,0.1)] flex flex-col gap-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-mono text-sm font-bold text-[#FF4500] bg-[#FF4500]/10 px-3 py-1 rounded-full inline-block">
                      {room.kitchenName || room.roomId}
                    </div>
                    <div className="text-xs text-gray-500 mt-2 font-medium px-1">
                      Lit {format(room.createdAt, 'MMM d, h:mm a')}
                    </div>
                  </div>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-green-500/10 text-green-400 border border-green-500/20">
                    Hot
                  </span>
                </div>

                <div className="text-center mt-2 mb-2">
                  <h3 className="font-bold text-white mb-2 flex items-center justify-center gap-2">
                    <Share className="w-4 h-4 text-[#FF4500]" />
                    Invite People to Roast You
                  </h3>
                  <p className="text-sm text-gray-400">
                    Your kitchen is open! Share this link on your socials to get anonymous roasts.
                  </p>
                </div>
                
                <button 
                  onClick={() => copyLink(room.roomId)}
                  className="w-full py-3 px-4 bg-[#FF4500] hover:bg-[#ff571a] text-white font-bold rounded-full transition-all shadow-[0_4px_14px_0_rgba(255,69,0,0.39)] hover:shadow-[0_6px_20px_rgba(255,69,0,0.23)] flex items-center justify-center gap-2"
                >
                  {copiedId === room.roomId ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                  {copiedId === room.roomId ? 'Link Copied!' : 'Copy Link to Share'}
                </button>

                <div className="flex gap-2 mt-2">
                  <button 
                    onClick={() => navigate(`/${room.roomId}`)}
                    className="flex-1 bg-[#2a2a2a] hover:bg-[#333] text-white py-2.5 rounded-full text-sm font-bold transition-colors"
                  >
                    Enter Kitchen
                  </button>
                  <button 
                    onClick={() => closeRoom(room.roomId)}
                    className="p-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-full transition-colors aspect-square flex items-center justify-center"
                    title="Close Kitchen"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}