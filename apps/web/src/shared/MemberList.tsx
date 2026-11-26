import { useId, useState, useSyncExternalStore } from 'react';
import type { Member } from '../generated/protocol.ts';
import VoiceIcon from './VoiceIcon';
import './memberList.css';

type ListMember = Pick<Member, 'id' | 'nickname' | 'online'> & { avatar?: string; eliminated?: boolean };
export type MemberVoice = {
  subscribe(listener: () => void): () => void;
  snapshot(): { mic: 'off' | 'starting' | 'on'; micOn: readonly string[]; speakers: readonly string[] };
};
type Props = {
  players: readonly ListMember[];
  spectators: readonly ListMember[];
  host: string;
  you: string;
  turn?: string;
  defaultAvatar: string;
  voice?: MemberVoice;
};

const spectatorLimit = 3;
const noVoice = () => null;
const noSubscription = () => () => {};

export default function MemberList({ players, spectators, host, you, turn, defaultAvatar, voice }: Props) {
  const state = useSyncExternalStore(voice?.subscribe ?? noSubscription, voice?.snapshot ?? noVoice);
  const [expanded, setExpanded] = useState(false);
  const audience = useId();

  function row(member: ListMember, player: boolean) {
    const speaking = member.online && state?.speakers.includes(member.id);
    const micOn = member.online && (member.id === you ? state?.mic === 'on' : state?.micOn.includes(member.id));
    const hasTurn = member.id === turn;
    return <li key={member.id} className="member-row" data-online={member.online} data-eliminated={member.eliminated || undefined} data-turn={hasTurn || undefined}>
      <span className="member-avatar" data-speaking={speaking || undefined}>
        <img src={member.avatar ?? defaultAvatar} alt="" onError={event => {
          if (event.currentTarget.getAttribute('src') !== defaultAvatar) event.currentTarget.src = defaultAvatar;
        }} />
      </span>
      <span className="member-copy">
        <span className="member-name" title={member.nickname}>{member.nickname}</span>
        {player && member.id === host && <span className="member-host">Chủ phòng</span>}
      </span>
      <span className="member-mic" data-on={micOn || undefined}><VoiceIcon name={micOn ? 'mic' : 'muted'} /></span>
      <span className="sr-only">
        {', '}{[hasTurn && 'Đang có lượt', !member.online && 'Mất kết nối', member.eliminated && 'Bị loại', speaking && 'Đang nói', micOn ? 'Bật mic' : 'Tắt mic'].filter(Boolean).join(', ')}
      </span>
    </li>;
  }
  return <div className="member-list">
    <ul role="list" aria-label="Người chơi">{players.map(member => row(member, true))}</ul>
    {spectators.length > 0 && <>
      <p className="member-audience">Khán giả · {spectators.length}</p>
      <ul role="list" aria-label="Khán giả" id={audience}>
        {(expanded ? spectators : spectators.slice(0, spectatorLimit)).map(member => row(member, false))}
      </ul>
      {spectators.length > spectatorLimit && <button type="button" className="member-expand" aria-controls={audience} aria-expanded={expanded}
        onClick={() => setExpanded(value => !value)}>{expanded ? 'Thu gọn khán giả' : `và ${spectators.length - spectatorLimit} người khác`}</button>}
    </>}
  </div>;
}
