import { useEffect, useId, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { useIsPresent } from 'motion/react';
import type { Member } from '../../generated/protocol.ts';
import type { Voice } from './voice.ts';
import VoiceIcon from '../../shared/VoiceIcon';
import './voice.css';

const editTarget = 'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]';
const interactiveTarget = 'button,a,summary,[role="button"]';
const overlayTarget = 'dialog[open],:popover-open,[aria-modal="true"]';

export default function VoiceControls({ voice, members, blocked }: { voice: Voice; members: Member[]; blocked: boolean }) {
  const state = useSyncExternalStore(voice.subscribe, voice.snapshot);
  const present = useIsPresent();
  const id = useId();
  const holdButton = useRef<HTMLButtonElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const owner = useRef(Symbol('voice controls')).current;
  const holding = present && state.phase === 'listening' && state.mode === 'hold' && !blocked;

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

  if (!state.available || !present) return null;
  const listening = state.phase === 'listening';
  const joined = listening || state.phase === 'joining' || state.phase === 'reconnecting';
  const speakers = members.filter(member => state.speakers.includes(member.id)).map(member => member.nickname);
  const micOn = state.mic === 'on';
  const connecting = !listening && (joined || state.phase === 'offline');
  const micLabel = listening
    ? state.mode === 'hold' ? 'Giữ để nói' : state.mic === 'off' ? 'Bật mic' : 'Tắt mic'
    : state.phase === 'joining' ? 'Đang vào thoại' : connecting ? 'Đang kết nối lại thoại' : 'Vào thoại';
  const shortcut = holding && state.shortcut;
  return <div className="room-voice" role="group" aria-label="Thoại phòng">
    <span className="icon-hint">
      <button type="button" className={`western-button voice-icon${holding ? ' voice-hold' : ''}`} ref={holdButton}
        data-voice-mic={listening ? '' : undefined} data-voice-join={!joined ? '' : undefined} data-live={micOn}
        disabled={blocked || connecting} aria-label={micLabel} aria-describedby={`${id}-mic`}
        aria-keyshortcuts={shortcut ? 'V' : undefined} aria-busy={connecting || state.mic === 'starting' || undefined}
        aria-pressed={listening && state.mode === 'toggle' ? micOn : undefined}
        onClick={!listening ? voice.join : state.mode === 'toggle' ? voice.toggleMic : undefined}
        onPointerDown={holding ? event => {
          if (!event.isPrimary || event.button !== 0 || document.querySelector(overlayTarget)) return;
          if (voice.startHold(owner, `pointer:${event.pointerId}`)) {
            try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Window listeners also end the hold. */ }
          }
        } : undefined}
        onPointerMove={event => { if (event.pointerType === 'mouse' && event.buttons === 0) voice.endHold(owner, `pointer:${event.pointerId}`); }}
        onLostPointerCapture={event => voice.endHold(owner, `pointer:${event.pointerId}`)}
        onBlur={() => voice.endHold(owner)}
        onContextMenu={holding ? event => event.preventDefault() : undefined}>
        <VoiceIcon name={micOn ? 'mic' : listening || connecting ? 'muted' : 'headphones'} />
      </button>
      <span className="icon-hint-text" id={`${id}-mic`} role="tooltip">{micLabel}{shortcut && <> <kbd>V</kbd></>}</span>
    </span>
    {listening && state.playbackBlocked && <span className="icon-hint">
      <button type="button" className="western-button voice-icon" disabled={blocked} aria-label="Bật âm thanh thoại" aria-describedby={`${id}-audio`} onClick={voice.startAudio}><VoiceIcon name="audio" /></button>
      <span className="icon-hint-text" id={`${id}-audio`} role="tooltip">Bật âm thanh thoại</span>
    </span>}
    <span className="icon-hint">
      <button type="button" className="western-button voice-icon" ref={settingsButton} disabled={blocked}
        aria-label="Mở cài đặt thoại" aria-describedby={`${id}-settings`} popoverTarget={id}><VoiceIcon name="settings" /></button>
      <span className="icon-hint-text" id={`${id}-settings`} role="tooltip">Mở cài đặt thoại</span>
    </span>
    <div className="voice-options western-wood" id={id} popover="auto" onBeforeToggle={event => {
      if (event.newState !== 'open' || !settingsButton.current) return;
      voice.endHold(owner);
      const { top, bottom, right } = settingsButton.current.getBoundingClientRect();
      const below = window.innerHeight - bottom >= Math.min(top, 250);
      const panel = event.currentTarget;
      panel.style.left = `clamp(12px, ${right - 260}px, 100% - min(260px, 100% - 24px) - 12px)`;
      panel.style.top = below ? `${bottom + 8}px` : 'auto';
      panel.style.bottom = below ? 'auto' : `${window.innerHeight - top + 8}px`;
      panel.style.maxHeight = `${Math.max(0, (below ? window.innerHeight - bottom : top) - 20)}px`;
    }}>
      <label>Chế độ mic <select value={state.mode} disabled={blocked} onChange={event => voice.setMode(event.currentTarget.value === 'hold' ? 'hold' : 'toggle')}><option value="toggle">Bật/tắt</option><option value="hold">Giữ để nói</option></select></label>
      {state.mode === 'hold' && <label><input type="checkbox" checked={state.shortcut} disabled={blocked} onChange={event => voice.setShortcut(event.currentTarget.checked)} /> Bật phím tắt <kbd>V</kbd></label>}
      {speakers.length > 0 && <p className="voice-speakers">Đang nói · {speakers.join(', ')}</p>}
      {(joined || state.resumeOnReconnect) && <button type="button" className="western-button quiet-button" data-voice-leave disabled={blocked} onClick={event => {
        event.currentTarget.closest<HTMLElement>('[popover]')?.hidePopover();
        voice.leave();
      }}>Rời thoại</button>}
    </div>
    {state.error && <p className="voice-error" role="status">{state.error}</p>}
  </div>;
}
