import { useState, useRef, useEffect } from 'react';
import {
  Heart, HeartHandshake, MessageCircle, Send, Sparkles, Users, UserCheck, ShieldCheck,
  Smile, ArrowRight, CheckCircle2, MessageSquare, AlertCircle, PhoneCall, RefreshCw, X
} from 'lucide-react';
import { useToast } from './Toaster';

const card = 'p-6 rounded-2xl bg-white border border-violet-100 shadow-[0_4px_24px_rgba(124,58,237,0.07)]';
const primaryBtn = 'px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-bold font-mono tracking-wider hover:opacity-90 transition-all flex items-center gap-2 cursor-pointer shadow-[0_0_16px_rgba(124,58,237,0.3)] disabled:opacity-50';
const softBtn = 'px-4 py-2.5 rounded-xl bg-violet-50 hover:bg-violet-100 text-zinc-700 text-xs font-mono flex items-center gap-2 transition-colors cursor-pointer border border-violet-100';

const MIMI_PROMPTS = [
  'I feel overwhelmed and anxious',
  'Someone is threatening me / leaked my data',
  'I feel ashamed and scared',
  'Can you guide me through a 2-minute breathing exercise?',
];

const MIMI_RESPONSES = {
  'I feel overwhelmed and anxious':
    "It is completely natural to feel overwhelmed right now. Your nervous system is in fight-or-flight mode. Let's do this together: drop your shoulders, unclench your jaw, and take a slow breath in for 4 seconds... hold for 4... and exhale for 6. You are physically safe right here. We will take everything one step at a time.",
  'Someone is threatening me / leaked my data':
    "Please remember: you are the victim of a crime, NOT someone who did anything wrong. Extortionists and bullies use shame and urgency as weapons to isolate you. The law (IT Act & BNS) is firmly on your side. We have already fingerprinted your proof. Do not pay, do not delete anything, and let us take care of the official reports together.",
  'I feel ashamed and scared':
    "Shame belongs entirely to the person who violated your trust, never to you. Thousands of people walk through this every single day and come out the other side stronger. You don't have to carry this alone. If you ever feel in danger, 112 and 1930 are right here. You have dignity and worth that no one can strip away.",
  'Can you guide me through a 2-minute breathing exercise?':
    "Let's ground your senses together. Look around the room right now:\n1. Spot 5 things you can see.\n2. Touch 4 things near you.\n3. Notice 3 sounds you can hear.\n4. Notice 2 things you can smell.\n5. Notice 1 thing you are grateful for right now.\n\nDeep breath in... and let it all out. You're doing great.",
};

const DEFAULT_MIMI_REPLY =
  "I hear you. What you are experiencing is real, heavy, and exhausting. But please know you are not powerless. Solace is built around you so you never have to navigate this in the dark. Take a gentle breath — I'm right here whenever you need a calm voice.";

const DUMMY_LISTENERS = [
  {
    id: 'l1',
    name: 'Priya M.',
    badge: 'Trained Peer Companion',
    status: 'Active now',
    avatarTone: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    bio: 'Specializes in panic de-escalation, non-consensual media support, and quiet reassurance.',
    matchedTopic: 'Cyber harassment & anxiety',
  },
  {
    id: 'l2',
    name: 'Aarav K.',
    badge: 'Survivor Peer',
    status: 'Active now',
    avatarTone: 'bg-purple-50 text-purple-700 border-purple-200',
    bio: 'Experienced in handling extortion scams & lookalike account trauma. Patient listener.',
    matchedTopic: 'Extortion & threats',
  },
  {
    id: 'l3',
    name: 'SafeHaven Room #12',
    badge: 'Moderated Circle',
    status: '4 members active',
    avatarTone: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    bio: 'An anonymous group lounge where survivors share grounded comfort. No details shared.',
    matchedTopic: 'Safe sharing & solidarity',
  },
  {
    id: 'l4',
    name: 'Ananya S.',
    badge: 'Mindfulness Peer',
    status: 'Online 5m ago',
    avatarTone: 'bg-amber-50 text-amber-700 border-amber-200',
    bio: 'Grounding routines, sleep support after scary incidents, and gentle guidance.',
    matchedTopic: 'Panic recovery & sleep',
  },
];

const DUMMY_PEOPLE_SEEKING_HELP = [
  {
    id: 's1',
    alias: 'Anonymous Soul #429',
    time: '2 mins ago',
    concern: 'Deepfake / Morphed Images',
    snippet: 'Someone made a morphed image of me on Telegram and is threatening to share it with college contacts. Hands are shaking, need someone to talk to.',
    urgent: true,
  },
  {
    id: 's2',
    alias: 'Anonymous Soul #812',
    time: '6 mins ago',
    concern: 'WhatsApp Extortion',
    snippet: 'Getting repeated calls demanding ₹15,000 via UPI by tonight. Feeling panicked and isolated. Can someone just stay on chat while I calm down?',
    urgent: true,
  },
  {
    id: 's3',
    alias: 'Anonymous Soul #104',
    time: '11 mins ago',
    concern: 'Lookalike Account',
    snippet: 'A fake account is messaging my friends asking for personal photos. Terrified of people believing it. Need reassurance.',
    urgent: false,
  },
  {
    id: 's4',
    alias: 'Anonymous Soul #670',
    time: '18 mins ago',
    concern: 'Cyber Stalking',
    snippet: 'Ex-partner won’t stop making new accounts to harass me. Feeling helpless and exhausted.',
    urgent: false,
  },
];

export default function AftercarePanel({ user, onGoReport }) {
  const toast = useToast();
  const [mimiHovered, setMimiHovered] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      sender: 'mimi',
      text: "Hi there 💜 I'm right here with you. Take a slow, deep breath. What you are experiencing is heavy, but you are not alone and nothing here is logged or judged. What is weighing on your mind right now?",
      time: 'Just now',
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef(null);

  // Stranger mode: 'get-help' | 'give-help'
  const [strangerMode, setStrangerMode] = useState('get-help');
  const [activeStrangerChat, setActiveStrangerChat] = useState(null);
  const [strangerMessages, setStrangerMessages] = useState([]);
  const [strangerInput, setStrangerInput] = useState('');

  // Support offer modal
  const [supportingPeer, setSupportingPeer] = useState(null);
  const [supportNote, setSupportNote] = useState('');

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSendToMimi = (textToSend) => {
    const text = textToSend || input;
    if (!text.trim()) return;

    const userMsg = { sender: 'user', text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput('');
    setIsTyping(true);

    setTimeout(() => {
      const replyText = MIMI_RESPONSES[text] || DEFAULT_MIMI_REPLY;
      setMessages((prev) => [
        ...prev,
        {
          sender: 'mimi',
          text: replyText,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      setIsTyping(false);
    }, 700);
  };

  const startStrangerChat = (peer) => {
    setActiveStrangerChat(peer);
    setStrangerMessages([
      {
        sender: 'system',
        text: `Connected anonymously with ${peer.name}. All messages are temporary and end-to-end peer encrypted. Be kind and safe.`,
        time: 'Just now',
      },
      {
        sender: 'them',
        text: `Hello, I'm ${peer.name}. Take your time, I am listening. How are you holding up right now?`,
        time: 'Just now',
      },
    ]);
  };

  const handleSendStrangerMsg = () => {
    if (!strangerInput.trim() || !activeStrangerChat) return;
    const msg = { sender: 'me', text: strangerInput, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    setStrangerMessages((prev) => [...prev, msg]);
    setStrangerInput('');

    // Simulated kind reply
    setTimeout(() => {
      setStrangerMessages((prev) => [
        ...prev,
        {
          sender: 'them',
          text: "Thank you for sharing that with me. I want you to remember that this does not define you. Take one breath at a time — you are safe and heard.",
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }, 1200);
  };

  const handleSendSupportNote = () => {
    if (!supportNote.trim() || !supportingPeer) return;
    toast(`Your kind message was sent anonymously to ${supportingPeer.alias}. Thank you for being a light! 💜`);
    setSupportingPeer(null);
    setSupportNote('');
  };

  return (
    <div className="space-y-8 fade-in" data-testid="aftercare-panel">
      {/* KICKER & HEADLINE */}
      <div>
        <span className="text-xs font-mono font-bold tracking-widest text-purple-700 uppercase">
          AFTERCARE &amp; EMOTIONAL HEALING
        </span>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-[#1a1028] mt-1 tracking-tight">
          Recovery Haven
        </h2>
        <p className="text-sm text-zinc-600 mt-1 max-w-2xl leading-relaxed">
          Triage and evidence matter, but your nervous system and peace of mind matter just as much. 
          Talk through what you are feeling with Mimi or connect with an anonymous peer.
        </p>
      </div>

      {/* 1. MAIN PANEL: HAVING A BAD DAY? MIMI GOT YOU */}
      <section className={`${card} relative overflow-hidden`} data-testid="mimi-care-card">
        <div
          aria-hidden="true"
          className="absolute -top-24 -right-20 w-80 h-80 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.22), transparent 70%)' }}
        />

        <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center gap-5">
            {/* Mimi Robot with hover animation */}
            <div
              onMouseEnter={() => setMimiHovered(true)}
              onMouseLeave={() => setMimiHovered(false)}
              onClick={() => setChatOpen((v) => !v)}
              className="w-20 h-20 shrink-0 rounded-2xl bg-gradient-to-br from-purple-500/15 to-indigo-500/20 border border-purple-500/30 grid place-items-center cursor-pointer shadow-[0_0_24px_rgba(168,85,247,0.3)] transition-transform duration-300 hover:scale-105"
              title="Click or hover to play with Mimi"
            >
              <img
                src={mimiHovered ? '/robot-jump.gif' : '/solace-robot.png'}
                alt="Mimi"
                className="w-14 h-14 object-contain transition-all"
              />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono tracking-widest text-purple-700 font-bold uppercase flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Compassionate Companion
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Online · Always ready
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-[#1a1028] mt-1 tracking-tight">
                Having a bad day? Mimi got you.
              </h3>
              <p className="text-sm text-zinc-600 mt-1 leading-relaxed max-w-xl">
                Racing heart, fear, or disbelief? Click below to chat directly with Mimi. 
                She will guide you through grounding, calm the panic, and help you regain your footing.
              </p>
            </div>
          </div>

          <button
            onClick={() => setChatOpen((v) => !v)}
            className={`${primaryBtn} shrink-0 self-start md:self-center`}
          >
            <MessageCircle className="w-4 h-4" />
            {chatOpen ? 'Close Chat' : 'Talk to Mimi'}
          </button>
        </div>

        {/* INTERACTIVE SMALL CHAT WITH MIMI */}
        {chatOpen && (
          <div className="mt-6 pt-6 border-t border-violet-100 fade-in" data-testid="mimi-chat">
            <div className="bg-[#faf8ff] rounded-2xl border border-violet-200/80 p-4 sm:p-5 flex flex-col h-[400px]">
              {/* Chat Header */}
              <div className="flex items-center justify-between pb-3 border-b border-violet-200/60 text-xs">
                <div className="flex items-center gap-2">
                  <img src="/solace-robot.png" alt="" className="w-5 h-5 object-contain" />
                  <span className="font-bold text-[#1a1028]">Mimi Care Session</span>
                  <span className="text-[10px] text-zinc-500 font-mono">· Client-Side Private</span>
                </div>
                <button
                  onClick={() => setChatOpen(false)}
                  className="text-zinc-500 hover:text-zinc-800 p-1 rounded-md"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto py-4 space-y-3 pr-1">
                {messages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] sm:max-w-[75%] p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                        m.sender === 'user'
                          ? 'bg-purple-600 text-white rounded-br-sm shadow-md'
                          : 'bg-white text-zinc-800 border border-violet-100 rounded-bl-sm shadow-sm whitespace-pre-line'
                      }`}
                    >
                      {m.text}
                    </div>
                    <span className="text-[10px] text-zinc-400 mt-1 px-1 font-mono">{m.time}</span>
                  </div>
                ))}

                {isTyping && (
                  <div className="flex items-center gap-2 text-xs text-purple-700 font-mono p-2 bg-purple-50 rounded-xl w-fit">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-ping" />
                    Mimi is typing warm thoughts…
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Suggested quick feeling prompts */}
              <div className="flex flex-wrap gap-1.5 py-2">
                {MIMI_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleSendToMimi(prompt)}
                    className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-white hover:bg-violet-100 border border-violet-200 text-purple-900 transition-colors cursor-pointer"
                  >
                    + {prompt}
                  </button>
                ))}
              </div>

              {/* Input Area */}
              <div className="flex gap-2 pt-2 border-t border-violet-200/60">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSendToMimi();
                  }}
                  placeholder="Tell Mimi how you're feeling right now…"
                  className="flex-1 text-xs bg-white border border-violet-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-purple-500"
                />
                <button
                  onClick={() => handleSendToMimi()}
                  disabled={!input.trim()}
                  className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-mono font-bold transition-all disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 2. BELOW MIMI: TALK TO A STRANGER (TWO OPTIONS) */}
      <section className={card} data-testid="stranger-section">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-violet-100">
          <div>
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-600" />
              <h3 className="text-xl font-bold text-[#1a1028]">Talk to a stranger</h3>
            </div>
            <p className="text-xs text-zinc-600 mt-1 leading-relaxed">
              Anonymous, zero-trace peer support. Choose whether you want to reach out to someone to receive support, or offer a listening ear to someone in need.
            </p>
          </div>

          {/* TWO BUTTONS / TABS */}
          <div className="flex rounded-xl bg-violet-50 p-1 border border-violet-100 self-start sm:self-auto shrink-0">
            <button
              onClick={() => { setStrangerMode('get-help'); setActiveStrangerChat(null); }}
              className={`px-3.5 py-2 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                strangerMode === 'get-help'
                  ? 'bg-white text-purple-800 shadow-sm'
                  : 'text-zinc-600 hover:text-purple-700'
              }`}
            >
              <Heart className="w-3.5 h-3.5 text-purple-600" />
              <span>I want to get help</span>
            </button>
            <button
              onClick={() => { setStrangerMode('give-help'); setActiveStrangerChat(null); }}
              className={`px-3.5 py-2 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                strangerMode === 'give-help'
                  ? 'bg-white text-purple-800 shadow-sm'
                  : 'text-zinc-600 hover:text-purple-700'
              }`}
            >
              <HeartHandshake className="w-3.5 h-3.5 text-indigo-600" />
              <span>I want to help someone</span>
            </button>
          </div>
        </div>

        {/* OPTION 1: USER WANTS TO APPROACH A STRANGER TO GET HELP */}
        {strangerMode === 'get-help' && (
          <div className="mt-6 space-y-4 fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-zinc-600 uppercase">
                Available Anonymous Listeners &amp; Support Peers
              </span>
              <span className="text-xs text-purple-700 font-mono flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                4 Active Peers Online
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {DUMMY_LISTENERS.map((peer) => (
                <div
                  key={peer.id}
                  className="p-4 rounded-xl border border-violet-100 hover:border-purple-300 bg-[#fdfcff] hover:bg-white transition-all flex flex-col justify-between space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl grid place-items-center font-bold font-mono border text-sm ${peer.avatarTone}`}>
                        {peer.name[0]}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-[#1a1028] flex items-center gap-2">
                          {peer.name}
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-purple-50 text-purple-700 border border-purple-200">
                            {peer.badge}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-500 font-mono mt-0.5">{peer.status}</div>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-zinc-600 leading-relaxed">{peer.bio}</p>

                  <div className="pt-2 border-t border-violet-100/80 flex items-center justify-between">
                    <span className="text-[10px] font-mono text-zinc-500">
                      Topic: <strong className="text-zinc-700">{peer.matchedTopic}</strong>
                    </span>
                    <button
                      onClick={() => startStrangerChat(peer)}
                      className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-mono font-bold hover:opacity-90 flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Chat Anonymously</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Simulated Live Peer Chat Drawer/Modal */}
            {activeStrangerChat && (
              <div className="mt-6 p-5 rounded-2xl bg-[#faf8ff] border border-violet-200 shadow-sm fade-in">
                <div className="flex items-center justify-between pb-3 border-b border-violet-200/80">
                  <div className="flex items-center gap-2.5">
                    <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-sm font-bold text-[#1a1028]">
                      Anonymous Peer Chat with {activeStrangerChat.name}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
                      Encrypted &amp; Ephemeral
                    </span>
                  </div>
                  <button
                    onClick={() => setActiveStrangerChat(null)}
                    className="p-1 text-zinc-500 hover:text-zinc-800"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="py-4 space-y-3 max-h-60 overflow-y-auto">
                  {strangerMessages.map((sm, i) => (
                    <div
                      key={i}
                      className={`flex flex-col ${
                        sm.sender === 'system'
                          ? 'items-center'
                          : sm.sender === 'me'
                          ? 'items-end'
                          : 'items-start'
                      }`}
                    >
                      {sm.sender === 'system' ? (
                        <span className="text-[10px] font-mono text-zinc-500 bg-violet-100/60 px-3 py-1 rounded-full text-center max-w-md">
                          {sm.text}
                        </span>
                      ) : (
                        <div
                          className={`max-w-[80%] p-3 rounded-xl text-xs sm:text-sm ${
                            sm.sender === 'me'
                              ? 'bg-purple-600 text-white rounded-br-none'
                              : 'bg-white border border-violet-100 text-zinc-800 rounded-bl-none shadow-sm'
                          }`}
                        >
                          {sm.text}
                        </div>
                      )}
                      {sm.sender !== 'system' && (
                        <span className="text-[9px] text-zinc-400 mt-0.5 font-mono">{sm.time}</span>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 pt-2 border-t border-violet-200/60">
                  <input
                    type="text"
                    value={strangerInput}
                    onChange={(e) => setStrangerInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSendStrangerMsg();
                    }}
                    placeholder={`Say something gentle to ${activeStrangerChat.name}…`}
                    className="flex-1 text-xs bg-white border border-violet-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-purple-500"
                  />
                  <button
                    onClick={handleSendStrangerMsg}
                    disabled={!strangerInput.trim()}
                    className="px-4 py-2.5 rounded-xl bg-purple-600 text-white text-xs font-mono font-bold disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* OPTION 2: USER WANTS TO HELP A STRANGER */}
        {strangerMode === 'give-help' && (
          <div className="mt-6 space-y-4 fade-in">
            <div className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-100 text-xs text-indigo-900 leading-relaxed flex items-center gap-3">
              <Smile className="w-5 h-5 text-indigo-600 shrink-0" />
              <span>
                <strong>You can be someone's turning point tonight.</strong> These are anonymous peers currently experiencing cyber harassment or fear. A single kind, grounding message helps reduce panic immediately.
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {DUMMY_PEOPLE_SEEKING_HELP.map((person) => (
                <div
                  key={person.id}
                  className="p-4 rounded-xl border border-violet-100 hover:border-indigo-300 bg-[#fdfcff] hover:bg-white transition-all flex flex-col justify-between space-y-3"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        {person.alias}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-500">{person.time}</span>
                    </div>

                    <div className="mt-1">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-purple-50 text-purple-700 border border-purple-200">
                        {person.concern}
                      </span>
                    </div>

                    <p className="text-xs text-zinc-600 mt-2.5 leading-relaxed italic bg-violet-50/40 p-2.5 rounded-lg border border-violet-100/60">
                      “{person.snippet}”
                    </p>
                  </div>

                  <div className="pt-2 border-t border-violet-100/80 flex items-center justify-between">
                    <span className="text-[10px] font-mono text-emerald-700">
                      Waiting for a friendly ear
                    </span>
                    <button
                      onClick={() => setSupportingPeer(person)}
                      className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
                    >
                      <HeartHandshake className="w-3.5 h-3.5" />
                      <span>Send Support</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Modal to write a supportive note */}
            {supportingPeer && (
              <div className="mt-6 p-5 rounded-2xl bg-[#faf8ff] border border-indigo-200 shadow-sm fade-in">
                <div className="flex items-center justify-between pb-3 border-b border-indigo-200/80">
                  <div className="flex items-center gap-2">
                    <Heart className="w-4 h-4 text-indigo-600" />
                    <span className="text-sm font-bold text-[#1a1028]">
                      Send a kind grounding message to {supportingPeer.alias}
                    </span>
                  </div>
                  <button
                    onClick={() => setSupportingPeer(null)}
                    className="p-1 text-zinc-500 hover:text-zinc-800"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="mt-3">
                  <label className="text-xs text-zinc-600 block mb-1">
                    Your words will be delivered anonymously to help them breathe and regain control:
                  </label>
                  <textarea
                    rows={3}
                    value={supportNote}
                    onChange={(e) => setSupportNote(e.target.value)}
                    placeholder="e.g. You did nothing wrong. Take a deep breath — the law is with you and you will get through this. Don't let them intimidate you."
                    className="w-full text-xs bg-white border border-indigo-200 rounded-xl p-3 focus:outline-none focus:border-indigo-500 resize-y"
                  />
                  <div className="flex justify-end gap-2 mt-3">
                    <button
                      onClick={() => setSupportingPeer(null)}
                      className="px-3 py-1.5 rounded-lg text-xs font-mono text-zinc-600 hover:bg-violet-100 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSendSupportNote}
                      disabled={!supportNote.trim()}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-mono font-bold flex items-center gap-1.5 disabled:opacity-40 cursor-pointer shadow-sm"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Send Words of Care</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Safety Notice Card */}
      <div className="p-4 rounded-xl bg-violet-50/60 border border-violet-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-zinc-600">
        <div className="flex items-center gap-2">
          <PhoneCall className="w-4 h-4 text-rose-600 shrink-0" />
          <span>
            If you are in immediate danger or facing severe extortion, contact authorities directly: <strong>112 (Police)</strong> or <strong>1930 (Cyber Helpline)</strong>.
          </span>
        </div>
        <button
          onClick={onGoReport}
          className="text-purple-700 hover:text-purple-900 font-bold font-mono text-xs underline underline-offset-2 shrink-0 cursor-pointer"
        >
          Draft Formal Complaint →
        </button>
      </div>
    </div>
  );
}
