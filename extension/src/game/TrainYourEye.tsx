/** Train Your Eye - real vs edited image game with Elo ratings (stored locally). */
import { useEffect, useState } from 'react';
import { kvGet, kvSet } from '../shared/settings';
import type { GameItem, GameState } from '../shared/types';
import { useConfirm } from '../ui/components';
import { assetUrl } from '../ui/env';
import { applyAnswer, initialState, nextItem } from './elo';
import { QUIZ_ITEMS, QUIZ_NOTE } from './quiz-data';

export function TrainYourEye() {
  const [state, setState] = useState<GameState | null>(null);
  const [item, setItem] = useState<GameItem | null>(null);
  const [answer, setAnswer] = useState<{ guess: 'real' | 'fake'; correct: boolean; delta: number; expected: number } | null>(null);
  const [imgError, setImgError] = useState(false);
  const { confirm, node } = useConfirm();

  useEffect(() => {
    kvGet<GameState | null>('game', null).then((s) => {
      const st = s && typeof s.userRating === 'number' ? { ...initialState(QUIZ_ITEMS), ...s } : initialState(QUIZ_ITEMS);
      setState(st);
      setItem(nextItem(st, QUIZ_ITEMS));
    });
  }, []);

  if (!state || !item) return <p className="muted">Loading game…</p>;

  const guess = (g: 'real' | 'fake') => {
    const res = applyAnswer(state, item, g);
    setState(res.state);
    setAnswer({ guess: g, correct: res.correct, delta: res.delta, expected: res.expected });
    void kvSet('game', res.state);
  };
  const next = () => { setAnswer(null); setImgError(false); setItem(nextItem(state, QUIZ_ITEMS, item.id)); };
  const seen = Object.keys(state.answered).length;

  return (
    <div className="stack-lg">
      <div className="section-head">
        <h2>Train your eye</h2>
        <p>Decide if each picture is the untouched original or an edited copy. Pictures get harder as your rating rises.</p>
      </div>
      <div className="row num small">
        <span className="badge plain">Rating {Math.round(state.userRating)}</span>
        <span className="badge plain">Score {state.score}/{state.played}</span>
        <span className="badge plain">Streak {state.streak} (best {state.bestStreak})</span>
        <span className="badge plain">Seen {seen}/{QUIZ_ITEMS.length}</span>
      </div>
      <div className="panel stack">
        {imgError ? <p className="notice bad">This practice image could not be loaded.</p> : (
          <img src={assetUrl(item.src)} alt="Practice image: is it the original or an edited copy?" className="thumb" style={{ maxHeight: 320, width: '100%' }} onError={() => setImgError(true)} />
        )}
        <p className="xs muted num">Image difficulty rating {Math.round(state.itemRatings[item.id] ?? item.initialRating)}</p>
        {!answer ? (
          <div className="row">
            <button className="btn primary grow" style={{ justifyContent: 'center' }} onClick={() => guess('real')}>Real original</button>
            <button className="btn primary grow" style={{ justifyContent: 'center' }} onClick={() => guess('fake')}>Edited fake</button>
          </div>
        ) : (
          <div className={`verdict ${answer.correct ? 'good' : 'bad'}`} aria-live="polite">
            <div className="verdict-title">{answer.correct ? 'Correct' : 'Not quite'} — it’s {item.label === 'real' ? 'the original' : `edited: ${item.title.toLowerCase()}`}</div>
            <p>{item.explanation}</p>
            <p className="small"><strong>Clue to remember:</strong> {item.cue}.</p>
            <p className="xs muted num">Expected chance of getting it right was {(answer.expected * 100).toFixed(0)}%, so your rating moved {answer.delta >= 0 ? '+' : ''}{answer.delta.toFixed(1)}.</p>
            <div className="row"><button className="btn primary" onClick={next}>Next picture</button></div>
          </div>
        )}
      </div>
      <details className="more">
        <summary>How scoring works</summary>
        <div className="stack small muted">
          <p>You and every picture have an Elo rating. Your expected score is E = 1 / (1 + 10^((R_image − R_you)/400)). After each answer, R_you ← R_you + 32 × (S − E), where S is 1 if right and 0 if wrong; the picture moves the opposite way. The next picture is the unseen one closest to your rating.</p>
          <p>{QUIZ_NOTE}</p>
          <p>Provenance: {QUIZ_ITEMS[0]?.provenance}</p>
        </div>
      </details>
      <div><button className="btn danger sm" onClick={async () => {
        if (await confirm('Restart the game?', 'Your rating, score and progress will be reset.', 'Restart')) {
          const st = initialState(QUIZ_ITEMS); setState(st); setAnswer(null); setItem(nextItem(st, QUIZ_ITEMS)); await kvSet('game', st);
        }
      }}>Restart game</button></div>
      {node}
    </div>
  );
}
