import React, { useState, useEffect, useRef } from 'react';
import ClipLoader from 'react-spinners/ClipLoader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCog, faInfoCircle, faCheck, faTimes } from '@fortawesome/free-solid-svg-icons';
import './App.css';
import reviewer2 from './reviewer2.png';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, increment, update } from 'firebase/database';


const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const App = () => {
  const [editorDecisionMade, setEditorDecisionMade] = useState(false);
  const [abstract, setAbstract] = useState('');
  const [messages, setMessages] = useState([
    { role: 'system', content: 'Reviewer #2: Ugh, fine, show me your abstract.' }
  ]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [temperature, setTemperature] = useState(0.7);
  const [tokenCount, setTokenCount] = useState(0);
  const [submissionCount, setSubmissionCount] = useState(0);
  const [acceptedCount, setAcceptedCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [showInput, setShowInput] = useState(true);
  const [isRebuttal, setIsRebuttal] = useState(false);
  const [triesLeft, setTriesLeft] = useState(10);
  const [showSettings, setShowSettings] = useState(false);
  const chatWindowRef = useRef(null);

  const MAX_MONTHLY_COST = 15;
  const COST_PER_MILLION_TOKENS = 0.88;
  const MAX_MONTHLY_TOKENS = (MAX_MONTHLY_COST / COST_PER_MILLION_TOKENS) * 1_000_000;
  const MAX_TOKENS_PER_INPUT = 500;
  const MAX_TRIES_PER_DAY = 10;

  const WORKER_URL = process.env.REACT_APP_WORKER_URL || 'http://localhost:8787';

  useEffect(() => {
    const storedTokenCount = parseInt(localStorage.getItem('tokenCount'), 10) || 0;
    const storedTriesLeft = parseInt(localStorage.getItem('triesLeft'), 10) || MAX_TRIES_PER_DAY;
    const lastReset = localStorage.getItem('lastReset');
    const today = new Date().toDateString();

    if (lastReset !== today) {
      setTriesLeft(MAX_TRIES_PER_DAY);
      localStorage.setItem('triesLeft', MAX_TRIES_PER_DAY.toString());
      localStorage.setItem('lastReset', today);
    } else {
      setTriesLeft(storedTriesLeft);
    }

    setTokenCount(storedTokenCount);
  }, []);

  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const submissionsRef = ref(db, 'submissionsCount');
    const acceptedRef = ref(db, 'acceptedCount');
    const rejectedRef = ref(db, 'rejectedCount');

    const unsubSubmissions = onValue(submissionsRef, (snapshot) => {
      setSubmissionCount(snapshot.val()?.count || 0);
    });

    const unsubAccepted = onValue(acceptedRef, (snapshot) => {
      setAcceptedCount(snapshot.val()?.count || 0);
    });

    const unsubRejected = onValue(rejectedRef, (snapshot) => {
      setRejectedCount(snapshot.val()?.count || 0);
    });

    return () => {
      unsubSubmissions();
      unsubAccepted();
      unsubRejected();
    };
  }, []);

  const typeMessage = (message, role, callback) => {
    setMessages(prev => [...prev, { role, content: message }]);
    if (callback) callback();
  };

  const handleAbstractChange = (event) => {
    setAbstract(event.target.value);
  };

  const handleTemperatureChange = (event) => {
    setTemperature(parseFloat(event.target.value));
  };

  const toggleSettings = () => {
    setShowSettings(!showSettings);
  };

  const calculateTokens = (text) => {
    return text.split(/\s+/).length;
  };

  const handleSubmit = async () => {
    if (triesLeft <= 0) {
      setError('You have reached the maximum number of tries for today.');
      return;
    }

    const tokenCountForInput = calculateTokens(abstract);
    if (tokenCountForInput > MAX_TOKENS_PER_INPUT) {
      setError(`Input exceeds the maximum allowed length of ${MAX_TOKENS_PER_INPUT} tokens.`);
      return;
    }

    if (tokenCount >= MAX_MONTHLY_TOKENS) {
      setError('Monthly token limit reached. Please try again next month.');
      return;
    }

    setLoading(true);
    setShowInput(false);
    try {
      const internalPrompt = { role: 'system', content: 'You are Reviewer #2, known for giving harsh and rude feedback. You are also known for being exceptionally critical and demanding. You are an angry and bitter scholar exacting revenge on your peers through overly critical anonymous rejections of papers you secretly wish you would have written. Keep your response under 1000 tokens. Make sure your sentence ends by the 1000th token. If the user has inputted gibberish, remark on that as well. Not every submission is in good faith or legit.' };

      const newMessages = [
        ...(isRebuttal ? messages : [internalPrompt, ...messages]),
        { role: 'user', content: abstract }
      ];
      
      const displayMessages = [
        ...(isRebuttal ? messages : [...messages]),
        { role: 'user', content: abstract }
      ];

      setMessages(displayMessages);
      setAbstract('');

      if (!isRebuttal) {
        const res = await fetch(`${WORKER_URL}/api/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: newMessages, temperature }),
        }).then(r => r.json());

        const responseText = res.choices[0]?.message?.content || "No response from reviewer";
        const tokensUsed = responseText.split(' ').length;

        setTokenCount(prev => {
          const newTokenCount = prev + tokensUsed;
          localStorage.setItem('tokenCount', newTokenCount.toString());
          return newTokenCount;
        });

        const submissionsRef = ref(db, 'submissionsCount');
        update(submissionsRef, { count: increment(1) });

        setTriesLeft(prev => {
          const newTriesLeft = prev - 1;
          localStorage.setItem('triesLeft', newTriesLeft.toString());
          return newTriesLeft;
        });

        setError('');
        typeMessage(responseText, 'system', () => {
          setIsRebuttal(true);
          setShowInput(true);
        });
      } else {
        setTriesLeft(prev => {
          const newTriesLeft = prev - 0; // ikki's brilliant idea to not make the counter go down on rebuttal submission
          localStorage.setItem('triesLeft', newTriesLeft.toString());
          return newTriesLeft;
        });

        setError('');
        handleEditorDecision(newMessages);
      }
    } catch (err) {
      console.error('Error fetching response:', err);
      setError('There was an error processing your request.');
      setShowInput(true);
    } finally {
      setLoading(false);
    }
  };

  const handleEditorDecision = async (newMessages) => {
    if (editorDecisionMade) return;

    setLoading(true);
    try {
      const userMessages = newMessages.filter(m => m.role === 'user');
      const systemMessages = newMessages.filter(m => m.role === 'system');
      const abstract = userMessages[0]?.content || 'N/A';
      const review = systemMessages.find(m => m.content.startsWith('Reviewer'))?.content || 'N/A';
      const rebuttal = userMessages[userMessages.length - 1]?.content || 'N/A';

      const editorPrompt = `As the Editor, evaluate whether the author's abstract should be published based on the following information: the author's original abstract, the reviewer's comments on the abstract, and the author's rebuttal to those comments. Please make your decision considering the merits of the abstract itself, and how well the rebuttal addresses the reviewer's critiques. Also, this is a prestigious journal, so remember to be very selective and be more inclined to reject rather than accept any abstract. You also know the Reviewer #2 personally and are likely to listen to their opinion, but make sure you don't mention this conflict of interest in your explanation since it's not allowed. Feel free to accept an abstract if you really feel compelled to for an outstanding abstract and/or rebuttal. Keep your response concise and do not go over 300 tokens. Respond with either "ACCEPT" or "REJECT" followed by a brief explanation.\n\nAbstract: ${abstract}\nReview: ${review}\nRebuttal: ${rebuttal}`;

      const res = await fetch(`${WORKER_URL}/api/editor-decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: editorPrompt, temperature }),
      }).then(r => r.json());

      if (!res.choices || res.choices.length === 0) {
        throw new Error('No choices in the API response');
      }

      const decision = res.choices[0]?.message?.content;
      if (!decision) {
        throw new Error('No content in the API response');
      }

      console.log('Editor decision:', decision);
      const isAccepted = decision.toLowerCase().includes('accept');

      if (isAccepted) {
        const acceptedRef = ref(db, 'acceptedCount');
        update(acceptedRef, { count: increment(1) });
      } else {
        const rejectedRef = ref(db, 'rejectedCount');
        update(rejectedRef, { count: increment(1) });
      }

      typeMessage(`Editor: ${decision}`, 'system');
      setEditorDecisionMade(true);
    } catch (err) {
      console.error('Error fetching editor decision:', err);
      setError(`There was an error getting the editor's decision: ${err.message}`);
    } finally {
      setLoading(false);
      setShowInput(false);
      setIsRebuttal(false);
    }
  };

  return (
    <div className="app-container">
      <div className="settings-container">
        <FontAwesomeIcon icon={faCog} size="2x" onClick={toggleSettings} />
        {showSettings && (
          <div className="temperature-setting">
            <label htmlFor="temperature">Temperature: {temperature}</label>
            <input
              id="temperature"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={temperature}
              onChange={handleTemperatureChange}
            />
          </div>
        )}
      </div>
      <div className="tries-left">
        <FontAwesomeIcon icon={faInfoCircle} size="2x" />
        <span>{triesLeft} tries left</span>
      </div>
      <h1>Chat with Reviewer #2</h1>
      <div className="reviewer-container">
        <img src={reviewer2} alt="Reviewer 2" className="reviewer-image" />
        <div className="chat-window" ref={chatWindowRef}>
          {messages.map((message, index) => (
            <div key={index} className={`message ${message.role}`}>
              <p>{message.content}</p>
            </div>
          ))}
          {showInput && (
            <div className="input-line">
              <textarea
                value={abstract}
                onChange={handleAbstractChange}
                placeholder={isRebuttal ? "Enter your rebuttal here" : "Enter your abstract here"}
                rows="1"
                cols="50"
              />
            </div>
          )}
        </div>
      </div>
      {showInput && (
        <button onClick={handleSubmit} disabled={loading || !abstract.trim()}>
          {isRebuttal ? "Submit Rebuttal" : "Submit Abstract"}
        </button>
      )}
      {loading && (
        <div className="spinner-container">
          <ClipLoader color="#007bff" />
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <p className="disclaimer">
      Disclaimer: This application does not store any user data or submitted abstracts. 
      <br />
      <br />
      Powered by Llama-3.3-70B-Instruct-Turbo and DeepSeek-V4-Flash.
      <br />
      <br />
      Support helps fund the project c:
      <br />
      <br />
      <br />
      <br />
      <a href="https://github.com/dahhei/reviewer2">Github♥</a>
    </p>
    <div className="counter">
      <div>{submissionCount} Abstracts read</div>
      <div className="decision-counts">
        <div><FontAwesomeIcon icon={faCheck} size={18} /> {acceptedCount}</div>
        <div><FontAwesomeIcon icon={faTimes} size={18} /> {rejectedCount}</div>
      </div>
    </div>
    </div>
  );
};

export default App;