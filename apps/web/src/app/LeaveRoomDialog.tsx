import { useEffect, useRef } from 'react';

export default function LeaveRoomDialog({ code, disabled, leaving, stay, leave }: { code: string; disabled: boolean; leaving: boolean; stay: () => void; leave: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = dialog.current!; node.showModal(); cancel.current?.focus();
    return () => { node.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} tabIndex={-1} className="leave-room-dialog saloon-poster" aria-labelledby="leave-room-title" aria-describedby="leave-room-description" aria-busy={leaving} onCancel={event => { event.preventDefault(); if (!leaving) stay(); }} onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const first = buttons[0], last = buttons.at(-1);
    if (!first) { event.preventDefault(); event.currentTarget.focus(); }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }}>
    <h2 id="leave-room-title">Rời phòng {code}?</h2>
    <p id="leave-room-description" role="status">{leaving ? 'Đang rời phòng…' : 'Bạn sẽ rời chỗ hiện tại trong phòng.'}</p>
    <div className="leave-room-actions"><button ref={cancel} type="button" className="western-button quiet-button" disabled={leaving} onClick={stay}>Ở lại</button><button type="button" className="western-button leave-room-confirm" disabled={disabled} onClick={leave}>Rời phòng</button></div>
  </dialog>;
}
