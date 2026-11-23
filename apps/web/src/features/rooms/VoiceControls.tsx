import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import type { Member } from '../../generated/protocol.ts';
import type { Voice } from './voice.ts';
import './voice.css';

const editTarget = 'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]';
const interactiveTarget = 'button,a,summary,[role="button"]';
const overlayTarget = 'dialog[open],:popover-open,[aria-modal="true"]';

export default function VoiceControls({ voice, members, blocked }: { voice: Voice; members: Member[]; blocked: boolean }) {
  const state = useSyncExternalStore(voice.subscribe, voice.snapshot);
  const holdButton = useRef<HTMLButtonElement>(null);
  const owner = useRef(Symbol('voice controls')).current;
  const holding = state.phase === 'listening' && state.mode === 'hold' && !blocked;

  useLayoutEffect(() => { if (blocked) voice.stopMic(); }, [blocked, voice]);
  useEffect(() => {
    if (!holding) return;
    let heldKey: string | null = null;
    function keydown(event: KeyboardEvent) {
      const code = event.code || event.key;
      if (heldKey === code) { event.preventDefault(); event.stopPropagation(); return; }
      if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 ||
          event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || document.hidden || !document.hasFocus()) return;
      const target = event.target instanceof Element ? event.target : document.activeElement;
      const ownButton = target === holdButton.current;
      const holdKey = ownButton && (event.key === ' ' || event.key === 'Enter');
      const shortcut = state.shortcut && event.key.toLowerCase() === 'v' &&
        (ownButton || !target?.closest(interactiveTarget));
      if ((!holdKey && !shortcut) || target?.closest(`${editTarget},[inert],.game-log,.card-detail,.is-dragging`) || document.querySelector(overlayTarget)) return;
      if (voice.startHold(owner, `key:${code}`)) {
        heldKey = code;
        event.preventDefault(); event.stopPropagation();
      }
    }
    const keyup = (event: KeyboardEvent) => {
      const code = event.code || event.key;
      if (heldKey !== code) return;
      heldKey = null;
      voice.endHold(owner, `key:${code}`);
      event.preventDefault(); event.stopPropagation();
    };
    const pointerEnd = (event: PointerEvent) => { voice.endHold(owner, `pointer:${event.pointerId}`); };
    const focusChange = (event: FocusEvent) => { if (event.target !== holdButton.current) voice.endHold(owner); };
    const overlayStart = (event: Event) => {
      if ((event as ToggleEvent).newState === 'open') voice.endHold(owner);
    };
    const blur = () => { heldKey = null; };
    const visibility = () => { if (document.hidden) blur(); };
    window.addEventListener('keydown', keydown, true);
    window.addEventListener('keyup', keyup, true);
    window.addEventListener('pointerup', pointerEnd, true);
    window.addEventListener('pointercancel', pointerEnd, true);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('focusin', focusChange);
    document.addEventListener('beforetoggle', overlayStart, true);
    return () => {
      voice.endHold(owner);
      window.removeEventListener('keydown', keydown, true);
      window.removeEventListener('keyup', keyup, true);
      window.removeEventListener('pointerup', pointerEnd, true);
      window.removeEventListener('pointercancel', pointerEnd, true);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('focusin', focusChange);
      document.removeEventListener('beforetoggle', overlayStart, true);
    };
  }, [holding, owner, state.shortcut, voice]);

  if (!state.available) return null;
  const listening = state.phase === 'listening';
  const joined = listening || state.phase === 'joining' || state.phase === 'reconnecting';
  const speakers = members.filter(member => state.speakers.includes(member.id)).map(member => member.nickname);
  const mic = state.mic === 'on' ? 'Mic đang bật' : state.mic === 'starting' ? 'Đang mở mic…' : 'Mic tắt';
  return <section className="room-voice" aria-label="Thoại phòng">
    <div className="voice-actions">
      {!joined && <button type="button" className="western-button" data-voice-join disabled={blocked || state.phase === 'offline'} onClick={voice.join}>Vào thoại</button>}
      {listening && (state.mode === 'toggle'
        ? <button type="button" className="western-button" data-voice-mic disabled={blocked} onClick={voice.toggleMic}>{state.mic === 'off' ? 'Bật mic' : 'Tắt mic'}</button>
        : <button type="button" className="western-button voice-hold" data-voice-mic ref={holdButton} disabled={blocked} aria-keyshortcuts={state.shortcut ? 'V' : undefined}
          onPointerDown={event => {
            if (!event.isPrimary || event.button !== 0 || document.querySelector(overlayTarget)) return;
            if (voice.startHold(owner, `pointer:${event.pointerId}`)) {
              try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Window listeners also end the hold. */ }
            }
          }}
          onPointerMove={event => { if (event.pointerType === 'mouse' && event.buttons === 0) voice.endHold(owner, `pointer:${event.pointerId}`); }}
          onLostPointerCapture={event => voice.endHold(owner, `pointer:${event.pointerId}`)}
          onBlur={() => voice.endHold(owner)}
          onContextMenu={event => event.preventDefault()}>Giữ để nói</button>)}
      {(joined || state.resumeOnReconnect) && <button type="button" className="western-button quiet-button" data-voice-leave disabled={blocked} onClick={voice.leave}>Rời thoại</button>}
      {listening && state.playbackBlocked && <button type="button" className="western-button" disabled={blocked} onClick={voice.startAudio}>Bật âm thanh thoại</button>}
    </div>
    {listening && <div className="voice-options">
      <label>Chế độ mic <select value={state.mode} disabled={blocked} onChange={event => voice.setMode(event.currentTarget.value === 'hold' ? 'hold' : 'toggle')}><option value="toggle">Bật/tắt</option><option value="hold">Giữ để nói</option></select></label>
      {state.mode === 'hold' && <label><input type="checkbox" checked={state.shortcut} disabled={blocked} onChange={event => voice.setShortcut(event.currentTarget.checked)} /> Phím V</label>}
    </div>}
    {(joined || state.phase === 'offline') && <p className="voice-status" role="status">{listening ? `Đã vào thoại · ${mic}` : state.phase === 'joining' ? 'Đang vào thoại…' : 'Đang kết nối lại thoại…'}</p>}
    {speakers.length > 0 && <p className="voice-speakers">Đang nói · {speakers.join(', ')}</p>}
    {state.error && <p className="voice-error" role="status">{state.error}</p>}
  </section>;
}
