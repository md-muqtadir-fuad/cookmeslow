import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, ShieldAlert, X } from 'lucide-react';
import { auth, db } from '../firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showGuidelines, setShowGuidelines] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        navigate('/kitchen');
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const cleanUsername = username.trim().toLowerCase();
    if (cleanUsername.length < 3 || cleanUsername.length > 15) {
      setError('Username must be between 3 and 15 characters.');
      return;
    }
    if (!/^[a-z0-9_]+$/.test(cleanUsername)) {
      setError('Username can only contain lowercase letters, numbers, and underscores.');
      return;
    }
    if (password.length < 6 || password.length > 50) {
      setError('Password must be between 6 and 50 characters.');
      return;
    }

    setLoading(true);
    const fakeEmail = `${cleanUsername}@cookmeslow.app`;

    try {
      if (isRegistering) {
        const userDocRef = doc(db, 'users', cleanUsername);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          throw new Error('Username is already taken. Please choose another one.');
        }

        const cred = await createUserWithEmailAndPassword(auth, fakeEmail, password);
        await setDoc(userDocRef, {
          uid: cred.user.uid,
          createdAt: serverTimestamp()
        });
      } else {
        try {
          const cred = await signInWithEmailAndPassword(auth, fakeEmail, password);
          
          // Ensure user document exists (in case it failed during registration)
          const userDocRef = doc(db, 'users', cleanUsername);
          const userDoc = await getDoc(userDocRef);
          if (!userDoc.exists()) {
            await setDoc(userDocRef, {
              uid: cred.user.uid,
              createdAt: serverTimestamp()
            });
          }
        } catch (signInError: any) {
          if (signInError.code === 'auth/user-not-found' || signInError.code === 'auth/invalid-credential') {
            const userDocRef = doc(db, 'users', cleanUsername);
            const userDoc = await getDoc(userDocRef);
            
            if (userDoc.exists()) {
              throw new Error('Incorrect password for this username.');
            } else {
              throw new Error('User not found. Please register first.');
            }
          } else {
            throw signInError;
          }
        }
      }
      
      localStorage.setItem('cookmeslow_username', cleanUsername);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setError('Username is already taken. Please choose another one.');
      } else if (err.message === 'Incorrect password for this username.' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Incorrect password for this username.');
      } else {
        setError(err.message || (isRegistering ? 'Failed to create account' : 'Failed to sign in'));
      }
      setLoading(false);
    }
  };

  const handleAnonymousLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const cred = await signInAnonymously(auth);
      // Ensure user document exists for anonymous user
      const userDocRef = doc(db, 'users', cred.user.uid);
      const userDoc = await getDoc(userDocRef);
      if (!userDoc.exists()) {
        await setDoc(userDocRef, {
          uid: cred.user.uid,
          createdAt: serverTimestamp()
        });
      }
      
      // Create a room immediately
      const newRoomId = Math.random().toString(36).substring(2, 10);
      await setDoc(doc(db, 'rooms', newRoomId), {
        roomId: newRoomId,
        creatorId: cred.user.uid,
        status: 'active',
        createdAt: serverTimestamp(),
        kitchenName: `Anonymous's Kitchen`
      });
      
      navigate(`/kitchen/${newRoomId}`);
    } catch (err: any) {
      console.error(err);
      setError('Failed to start anonymous kitchen.');
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row items-center justify-center h-full min-h-[100dvh] p-6 bg-[#121212] gap-12 lg:gap-24">
      
      {/* Left Side: Sign In Form */}
      <div className="w-full max-w-sm p-8 bg-[#1a1a1a] rounded-3xl shadow-2xl border border-[#333] order-2 lg:order-1">
        <h2 className="text-2xl font-bold text-white mb-6 text-center lg:hidden">
          {isRegistering ? 'Create Account' : 'Sign In'}
        </h2>
        
        {error && (
          <div className="mb-4 p-3 bg-red-900/50 text-red-200 text-sm rounded-xl border border-red-800 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className="w-full px-4 py-3 bg-[#121212] border border-[#333] rounded-full text-white placeholder-gray-500 focus:outline-none focus:border-[#FF4500] transition-colors text-center"
              required
            />
          </div>
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full px-4 py-3 bg-[#121212] border border-[#333] rounded-full text-white placeholder-gray-500 focus:outline-none focus:border-[#FF4500] transition-colors text-center"
              required
            />
          </div>
          <button 
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-[#FF4500] hover:bg-[#ff571a] disabled:bg-[#FF4500]/50 text-white font-bold rounded-full transition-all shadow-[0_4px_14px_0_rgba(255,69,0,0.39)] hover:shadow-[0_6px_20px_rgba(255,69,0,0.23)] flex items-center justify-center gap-2"
          >
            {loading ? (isRegistering ? 'Creating...' : 'Entering...') : (isRegistering ? 'Register' : 'Enter Kitchen')}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => {
              setIsRegistering(!isRegistering);
              setError('');
            }}
            className="text-[#FF4500] hover:text-[#ff571a] text-sm font-bold transition-colors"
          >
            {isRegistering ? 'Already have an account? Sign In' : 'Need an account? Register'}
          </button>
        </div>

        <div className="mt-4 text-center border-t border-[#333] pt-4">
          <button
            type="button"
            onClick={handleAnonymousLogin}
            disabled={loading}
            className="text-gray-400 hover:text-white text-sm font-bold transition-colors"
          >
            Start a Kitchen (Anonymous)
          </button>
        </div>

        <div className="mt-6 text-center">
          <button 
            onClick={() => setShowGuidelines(true)}
            className="text-sm text-gray-400 hover:text-white flex items-center justify-center gap-1.5 mx-auto transition-colors"
          >
            <ShieldAlert className="w-4 h-4" />
            Warning & Safety Guidelines
          </button>
        </div>
      </div>

      {/* Right Side: Text / Branding */}
      <div className="w-full max-w-lg text-center lg:text-left order-1 lg:order-2">
        <div className="flex justify-center lg:justify-start mb-6">
          <img 
            src="/logo.png" 
            alt="CookMeSlow Logo" 
            className="w-32 h-32 lg:w-48 lg:h-48 rounded-full shadow-[0_0_30px_rgba(255,69,0,0.3)] object-cover border-4 border-[#1a1a1a]"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextElementSibling?.classList.remove('hidden');
            }}
          />
          <div className="hidden w-20 h-20 bg-[#FF4500] rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(255,69,0,0.5)]">
            <Flame className="w-10 h-10 text-white" />
          </div>
        </div>
        <h1 className="text-5xl lg:text-6xl font-extrabold text-white mb-4 tracking-tight">CookMeSlow</h1>
        <p className="text-xl lg:text-2xl text-gray-400">
          Enter the kitchen to roast or be roasted. Bring the heat and connect with friends.
        </p>
      </div>

      {/* Guidelines Modal */}
      {showGuidelines && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-[#1a1a1a] border border-[#333] rounded-3xl p-6 max-w-md w-full shadow-2xl relative">
            <button 
              onClick={() => setShowGuidelines(false)}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white bg-[#2a2a2a] rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-orange-500/20 rounded-full flex items-center justify-center text-orange-500">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold text-white">Safety Guidelines</h2>
            </div>
            
            <div className="space-y-4 text-sm text-gray-300">
              <p>
                <strong className="text-white">CookMeSlow</strong> is a platform for playful roasting and banter. To keep the kitchen fun for everyone, please follow these rules:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong className="text-orange-400">Keep it playful:</strong> Roasts should be funny, not deeply personal or malicious.</li>
                <li><strong className="text-orange-400">No hate speech:</strong> Racism, sexism, homophobia, and other forms of discrimination are strictly prohibited.</li>
                <li><strong className="text-orange-400">No doxxing:</strong> Do not share personal information, real names, or addresses.</li>
                <li><strong className="text-orange-400">Know when to stop:</strong> If someone asks to stop or closes the kitchen, respect their boundaries.</li>
              </ul>
              <p className="text-xs text-gray-500 mt-4 pt-4 border-t border-[#333]">
                By entering the kitchen, you agree to participate in good faith. The chef (host) has the right to burn messages or close the kitchen at any time.
              </p>
            </div>
            
            <button 
              onClick={() => setShowGuidelines(false)}
              className="w-full mt-6 py-3 bg-[#2a2a2a] hover:bg-[#333] text-white font-bold rounded-full transition-colors"
            >
              I Understand
            </button>
          </div>
        </div>
      )}
    </div>
  );
}