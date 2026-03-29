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
      if (user && !user.isAnonymous) {
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


  return (
    <div className="flex flex-col lg:flex-row items-center justify-center h-full min-h-[100dvh] p-6 bg-[#0a0a0a] gap-12 lg:gap-24">
      
      {/* Left Side: Sign In Form */}
      <div className="w-full max-w-sm p-8 bg-[#0f0f0f] rounded-[2.5rem] shadow-2xl border border-[#1a1a1a] order-2 lg:order-1">
        <h2 className="text-2xl font-black text-white mb-8 text-center lg:hidden uppercase tracking-tighter">
          {isRegistering ? 'Create Account' : 'Sign In'}
        </h2>
        
        {error && (
          <div className="mb-6 p-4 bg-red-950/50 text-red-400 text-xs font-bold rounded-2xl border border-red-900/30 text-center uppercase tracking-wider">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className="w-full px-6 py-4 bg-[#0a0a0a] border border-[#222] rounded-2xl text-white placeholder-gray-700 focus:outline-none focus:border-[#991b1b] transition-colors text-center font-bold"
              required
            />
          </div>
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full px-6 py-4 bg-[#0a0a0a] border border-[#222] rounded-2xl text-white placeholder-gray-700 focus:outline-none focus:border-[#991b1b] transition-colors text-center font-bold"
              required
            />
          </div>
          <button 
            type="submit"
            disabled={loading}
            className="w-full py-4 px-4 bg-[#991b1b] hover:bg-[#7f1d1d] disabled:bg-[#1a1a1a] disabled:text-gray-700 text-white font-black uppercase tracking-widest rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            {loading ? (isRegistering ? 'Creating...' : 'Entering...') : (isRegistering ? 'Register' : 'Enter Kitchen')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => {
              setIsRegistering(!isRegistering);
              setError('');
            }}
            className="text-[#991b1b] hover:text-[#7f1d1d] text-xs font-black uppercase tracking-widest transition-colors"
          >
            {isRegistering ? 'Already have an account? Sign In' : 'Need an account? Register'}
          </button>
        </div>


        <div className="mt-8 text-center border-t border-[#1a1a1a] pt-6">
          <button 
            onClick={() => setShowGuidelines(true)}
            className="text-[10px] font-black text-gray-600 hover:text-white flex items-center justify-center gap-2 mx-auto transition-colors uppercase tracking-widest"
          >
            <ShieldAlert className="w-4 h-4" />
            Warning & Safety Guidelines
          </button>
        </div>
      </div>

      {/* Right Side: Text / Branding */}
      <div className="w-full max-w-lg text-center lg:text-left order-1 lg:order-2">
        <div className="flex justify-center lg:justify-start mb-8">
          <img 
            src="/logo.png" 
            alt="CookMeSlow Logo" 
            className="w-32 h-32 lg:w-48 lg:h-48 rounded-full object-cover border-8 border-[#0f0f0f] grayscale contrast-125"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextElementSibling?.classList.remove('hidden');
            }}
          />
          <div className="hidden w-20 h-20 bg-[#991b1b] rounded-full flex items-center justify-center">
            <Flame className="w-10 h-10 text-white" />
          </div>
        </div>
        <h1 className="text-6xl lg:text-8xl font-black text-white mb-6 tracking-tighter uppercase leading-none">CookMeSlow</h1>
        <p className="text-xl lg:text-2xl text-gray-600 font-bold leading-relaxed">
          Enter the kitchen to roast or be roasted. Bring the heat and connect with friends.
        </p>
      </div>

      {/* Guidelines Modal */}
      {showGuidelines && (
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-[#0f0f0f] border border-[#222] rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl relative">
            <button 
              onClick={() => setShowGuidelines(false)}
              className="absolute top-6 right-6 p-2 text-gray-600 hover:text-white bg-[#1a1a1a] rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-red-950/30 rounded-2xl flex items-center justify-center text-red-700">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Safety Rules</h2>
            </div>
            
            <div className="space-y-5 text-sm text-gray-400 font-medium">
              <p>
                <strong className="text-white font-black uppercase">CookMeSlow</strong> is a platform for playful roasting and banter. To keep the kitchen fun for everyone, please follow these rules:
              </p>
              <ul className="space-y-3">
                <li className="flex gap-3"><span className="text-[#991b1b] font-black">01</span> <span><strong className="text-white font-black uppercase text-xs">Keep it playful:</strong> Roasts should be funny, not deeply personal or malicious.</span></li>
                <li className="flex gap-3"><span className="text-[#991b1b] font-black">02</span> <span><strong className="text-white font-black uppercase text-xs">No hate speech:</strong> Racism, sexism, homophobia, and other forms of discrimination are strictly prohibited.</span></li>
                <li className="flex gap-3"><span className="text-[#991b1b] font-black">03</span> <span><strong className="text-white font-black uppercase text-xs">No doxxing:</strong> Do not share personal information, real names, or addresses.</span></li>
                <li className="flex gap-3"><span className="text-[#991b1b] font-black">04</span> <span><strong className="text-white font-black uppercase text-xs">Know when to stop:</strong> If someone asks to stop or closes the kitchen, respect their boundaries.</span></li>
              </ul>
              <p className="text-[10px] text-gray-700 mt-6 pt-6 border-t border-[#1a1a1a] font-black uppercase tracking-widest">
                By entering the kitchen, you agree to participate in good faith. The chef (host) has the right to burn messages or close the kitchen at any time.
              </p>
            </div>
            
            <button 
              onClick={() => setShowGuidelines(false)}
              className="w-full mt-8 py-4 bg-[#1a1a1a] hover:bg-[#222] text-white font-black uppercase tracking-widest rounded-2xl transition-colors border border-[#333]"
            >
              I Understand
            </button>
          </div>
        </div>
      )}
    </div>
  );
}