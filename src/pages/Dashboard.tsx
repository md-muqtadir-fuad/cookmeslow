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
    <div className="flex flex-col h-full bg-[#0a0a0a] text-white">
      <header className="bg-[#0f0f0f] border-b border-[#222] px-4 py-4 flex items-center justify-between sticky top-0 z-10 shadow-lg">
        <div className="flex items-center gap-2">
          <img 
            src="/logo.png" 
            alt="Logo" 
            className="w-10 h-10 rounded-full object-cover grayscale contrast-125"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextElementSibling?.classList.remove('hidden');
            }}
          />
          <div className="hidden w-8 h-8 bg-[#991b1b] rounded-full flex items-center justify-center">
            <ChefHat className="w-5 h-5 text-white" />
          </div>
          <h1 className="font-black text-lg tracking-tight uppercase">The Kitchen</h1>
        </div>
        <div className="flex items-center gap-2">
          {'Notification' in window && notifyPermission !== 'granted' && (
            <button 
              onClick={requestNotificationPermission} 
              className="relative z-20 p-2 text-gray-600 hover:text-white hover:bg-[#1a1a1a] rounded-full transition-colors"
              title="Enable Notifications"
            >
              <BellOff className="w-5 h-5" />
            </button>
          )}
          {'Notification' in window && notifyPermission === 'granted' && (
            <button 
              className="relative z-20 p-2 text-[#991b1b] hover:bg-[#1a1a1a] rounded-full transition-colors cursor-default"
              title="Notifications Enabled"
            >
              <Bell className="w-5 h-5" />
            </button>
          )}
          <button onClick={handleLogout} className="p-2 text-gray-600 hover:text-white hover:bg-[#1a1a1a] rounded-full transition-colors">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 max-w-2xl mx-auto w-full">
        {username && username !== 'Anonymous' && (
          <div className="mb-10">
            <h2 className="text-[10px] font-black text-[#991b1b] uppercase tracking-[0.2em] mb-4">Your Roast Portal</h2>
            <div className="bg-[#0f0f0f] border-2 border-[#222] rounded-3xl p-6 flex flex-col gap-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#991b1b]/5 rounded-full -mr-16 -mt-16 blur-3xl" />
              
              <div className="flex justify-between items-start relative z-10">
                <div>
                  <div className="font-black text-2xl text-white tracking-tighter">
                    cookmeslow.app/<span className="text-[#991b1b]">{username}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-2 font-bold uppercase tracking-wider">
                    Your permanent roasting link
                  </div>
                </div>
                <div className="w-12 h-12 bg-[#991b1b] rounded-2xl flex items-center justify-center shadow-xl rotate-3">
                  <Share className="w-6 h-6 text-white" />
                </div>
              </div>

              <div className="mt-2 mb-2 relative z-10">
                <p className="text-sm text-gray-400 leading-relaxed font-medium">
                  Anyone who visits this link will land in a <strong className="text-white font-black">direct random kitchen</strong> to roast you.
                </p>
              </div>
              
              <button 
                onClick={copyPortalLink}
                className="w-full py-4 px-4 bg-[#991b1b] hover:bg-[#7f1d1d] text-white font-black uppercase tracking-widest rounded-2xl transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
              >
                {copiedId === 'portal' ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                {copiedId === 'portal' ? 'Portal Link Copied!' : 'Copy Portal Link'}
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-4 px-1">
          <h2 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.2em]">Active Kitchens</h2>
          <button 
            onClick={createRoom}
            disabled={isCreating}
            className="text-[10px] font-black text-[#991b1b] hover:text-[#7f1d1d] flex items-center gap-1.5 transition-colors uppercase tracking-widest"
          >
            <Flame className="w-3.5 h-3.5" />
            Light New Stove
          </button>
        </div>

        <div className="space-y-4">
          {rooms.length === 0 ? (
            <div className="text-center py-16 text-gray-700 bg-[#0f0f0f] rounded-3xl border-2 border-[#1a1a1a] border-dashed">
              <ChefHat className="w-16 h-16 mx-auto mb-4 opacity-10" />
              <p className="font-black uppercase tracking-widest text-sm">No active stoves</p>
            </div>
          ) : (
            rooms.map((room) => (
              <div key={room.roomId} className="bg-[#0f0f0f] border border-[#222] rounded-3xl p-6 flex flex-col gap-5 hover:border-[#991b1b]/30 transition-colors">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-black text-lg text-white tracking-tight">
                      {room.kitchenName || room.roomId}
                    </div>
                    <div className="text-[10px] text-gray-600 mt-1 font-black uppercase tracking-widest">
                      Lit {format(room.createdAt, 'MMM d, h:mm a')}
                    </div>
                  </div>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-red-900/10 text-red-700 border border-red-900/20">
                    Sizzling
                  </span>
                </div>

                <div className="mt-1 mb-1">
                  <p className="text-sm text-gray-500 font-medium leading-relaxed">
                    Your kitchen is open! Share this link on your socials to get anonymous roasts.
                  </p>
                </div>
                
                <div className="flex flex-col gap-3">
                  <button 
                    onClick={() => copyLink(room.roomId)}
                    className="w-full py-3.5 px-4 bg-[#1a1a1a] hover:bg-[#222] text-white font-black uppercase tracking-widest rounded-2xl transition-all flex items-center justify-center gap-3 border border-[#333]"
                  >
                    {copiedId === room.roomId ? <Check className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5" />}
                    {copiedId === room.roomId ? 'Link Copied!' : 'Copy Link to Share'}
                  </button>

                  <div className="flex gap-3">
                    <button 
                      onClick={() => navigate(`/${room.roomId}`)}
                      className="flex-1 bg-[#991b1b] hover:bg-[#7f1d1d] text-white py-3.5 rounded-2xl text-sm font-black uppercase tracking-widest transition-all active:scale-[0.98]"
                    >
                      Enter Kitchen
                    </button>
                    <button 
                      onClick={() => closeRoom(room.roomId)}
                      className="p-3.5 bg-red-900/10 hover:bg-red-900/20 text-red-700 rounded-2xl transition-colors aspect-square flex items-center justify-center border border-red-900/20"
                      title="Close Kitchen"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}