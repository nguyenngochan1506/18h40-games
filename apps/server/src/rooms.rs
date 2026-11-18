use crate::{Config, Peer, QUEUE_CAPACITY, error};
use protocol::{
    ClientMessage, ErrorCode, Member, PROTOCOL_VERSION, Phase, Role, RoomView, ServerMessage,
};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex, Weak},
};
use tokio::{
    sync::{mpsc, oneshot},
    time::Instant,
};

const MIN_PLAYERS: u32 = 4;
const MAX_PLAYERS: u32 = 7;
const CODE_ALPHABET: &[u8] = b"23456789ABCDEFGHJKMNPQRSTUVWXYZ";

type Rooms = Mutex<HashMap<String, mpsc::Sender<Command>>>;

#[derive(Clone)]
pub(crate) struct Registry {
    rooms: Arc<Rooms>,
    config: Config,
}

pub(crate) enum Command {
    Client {
        peer: Peer,
        message: ClientMessage,
        reply: oneshot::Sender<bool>,
    },
    Disconnect {
        connection_id: u64,
    },
}

impl Registry {
    pub fn new(config: Config) -> Self {
        Self {
            rooms: Arc::new(Mutex::new(HashMap::new())),
            config,
        }
    }

    pub fn find(&self, code: &str) -> Option<mpsc::Sender<Command>> {
        self.rooms
            .lock()
            .unwrap()
            .get(&code.trim().to_ascii_uppercase())
            .cloned()
    }

    pub fn create(&self, name: &str) -> Result<mpsc::Sender<Command>, ErrorCode> {
        nickname(name)?;
        let mut rooms = self.rooms.lock().unwrap();
        if rooms.len() >= self.config.max_rooms {
            return Err(ErrorCode::ServerBusy);
        }
        let code = loop {
            let mut random = [0; 5];
            getrandom::fill(&mut random).map_err(|_| ErrorCode::ServerBusy)?;
            let mut code = String::new();
            while code.len() < 5 {
                for n in random {
                    if (n as usize) < 256 / CODE_ALPHABET.len() * CODE_ALPHABET.len()
                        && code.len() < 5
                    {
                        code.push(CODE_ALPHABET[n as usize % CODE_ALPHABET.len()] as char);
                    }
                }
                if code.len() < 5 {
                    getrandom::fill(&mut random).map_err(|_| ErrorCode::ServerBusy)?;
                }
            }
            if !rooms.contains_key(&code) {
                break code;
            }
        };
        let (sender, receiver) = mpsc::channel(QUEUE_CAPACITY);
        rooms.insert(code.clone(), sender.clone());
        let room = Room {
            code,
            phase: Phase::Waiting,
            host: String::new(),
            members: Vec::new(),
            next_id: 1,
            empty_since: Some(Instant::now()),
            config: self.config.clone(),
            registry: Arc::downgrade(&self.rooms),
        };
        tokio::spawn(room.run(receiver));
        Ok(sender)
    }
}

pub(crate) async fn request(
    sender: &mpsc::Sender<Command>,
    peer: &Peer,
    message: ClientMessage,
) -> bool {
    let (reply, result) = oneshot::channel();
    if sender
        .send(Command::Client {
            peer: peer.clone(),
            message,
            reply,
        })
        .await
        .is_ok()
        && let Ok(member) = result.await
    {
        return member;
    }
    peer.send(error(ErrorCode::RoomNotFound));
    false
}

fn nickname(name: &str) -> Result<String, ErrorCode> {
    let name = name.trim();
    if !(1..=20).contains(&name.chars().count()) || name.chars().any(char::is_control) {
        return Err(ErrorCode::InvalidNickname);
    }
    Ok(name.to_owned())
}

fn decode_token(token: &str) -> Option<[u8; 16]> {
    if token.len() != 32 {
        return None;
    }
    let mut decoded = [0; 16];
    for (byte, pair) in decoded.iter_mut().zip(token.as_bytes().as_chunks::<2>().0) {
        let high = (pair[0] as char).to_digit(16)?;
        let low = (pair[1] as char).to_digit(16)?;
        *byte = (high * 16 + low) as u8;
    }
    Some(decoded)
}

fn tokens_equal(left: &[u8; 16], right: &[u8; 16]) -> bool {
    let mut difference = 0;
    for (a, b) in left.iter().zip(right) {
        difference |= std::hint::black_box(a ^ b);
    }
    std::hint::black_box(difference) == 0
}

fn encode_token(token: &[u8; 16]) -> String {
    token.iter().map(|byte| format!("{byte:02x}")).collect()
}

struct MemberState {
    view: Member,
    token: [u8; 16],
    connection: Option<Peer>,
    offline_since: Option<Instant>,
}

struct Room {
    code: String,
    phase: Phase,
    host: String,
    members: Vec<MemberState>,
    next_id: u64,
    empty_since: Option<Instant>,
    config: Config,
    registry: Weak<Rooms>,
}

impl Room {
    async fn run(mut self, mut receiver: mpsc::Receiver<Command>) {
        loop {
            let now = Instant::now();
            if self.expire(now) {
                break;
            }
            let deadline = self.next_deadline(now);
            tokio::select! {
                command = receiver.recv() => match command {
                    Some(Command::Client { peer, message, reply }) => {
                        // An expired token cannot be revived by racing the timer branch.
                        if self.expire(Instant::now()) { break; }
                        let result = self.apply(&peer, message);
                        match result {
                            Ok(changed) => { if changed { self.maintain_host(Instant::now()); self.broadcast(); } }
                            Err(code) => peer.send(error(code)),
                        }
                        let member = self.members.iter().any(|m| m.connection.as_ref().is_some_and(|p| p.id == peer.id));
                        let _ = reply.send(member);
                    }
                    Some(Command::Disconnect { connection_id }) => {
                        if let Some(member) = self.members.iter_mut().find(|m| m.connection.as_ref().is_some_and(|p| p.id == connection_id)) {
                            member.connection = None;
                            member.view.online = false;
                            member.offline_since = Some(Instant::now());
                            self.track_empty();
                            self.broadcast();
                        }
                    }
                    None => break,
                },
                _ = async {
                    match deadline {
                        Some(deadline) => tokio::time::sleep_until(deadline).await,
                        None => std::future::pending::<()>().await,
                    }
                } => {}
            }
        }
        if let Some(registry) = self.registry.upgrade() {
            registry.lock().unwrap().remove(&self.code);
        }
    }

    fn view(&self, you: &str) -> RoomView {
        RoomView {
            code: self.code.clone(),
            phase: self.phase,
            host: self.host.clone(),
            you: you.into(),
            min_players: MIN_PLAYERS,
            max_players: MAX_PLAYERS,
            members: self.members.iter().map(|m| m.view.clone()).collect(),
        }
    }

    fn broadcast(&self) {
        for member in &self.members {
            if let Some(peer) = &member.connection {
                peer.send(ServerMessage::RoomState {
                    v: PROTOCOL_VERSION,
                    room: self.view(&member.view.id),
                });
            }
        }
    }

    fn players(&self) -> usize {
        self.members
            .iter()
            .filter(|m| m.view.role == Role::Player)
            .count()
    }

    fn apply(&mut self, peer: &Peer, message: ClientMessage) -> Result<bool, ErrorCode> {
        match message {
            ClientMessage::CreateRoom { nickname: name, .. }
            | ClientMessage::JoinRoom { nickname: name, .. } => {
                let name = nickname(&name)?;
                if self
                    .members
                    .iter()
                    .any(|m| m.view.nickname.to_lowercase() == name.to_lowercase())
                {
                    return Err(ErrorCode::NicknameTaken);
                }
                if self.members.len() >= self.config.max_members {
                    return Err(ErrorCode::ServerBusy);
                }
                let mut token = [0; 16];
                getrandom::fill(&mut token).map_err(|_| ErrorCode::ServerBusy)?;
                let role = if self.phase == Phase::Waiting && self.players() < MAX_PLAYERS as usize
                {
                    Role::Player
                } else {
                    Role::Spectator
                };
                let id = self.next_id.to_string();
                self.next_id += 1;
                self.members.push(MemberState {
                    view: Member {
                        id: id.clone(),
                        nickname: name,
                        role,
                        online: true,
                    },
                    token,
                    connection: Some(peer.clone()),
                    offline_since: None,
                });
                self.empty_since = None;
                self.maintain_host(Instant::now());
                peer.send(ServerMessage::Joined {
                    v: PROTOCOL_VERSION,
                    room_code: self.code.clone(),
                    token: encode_token(&token),
                    room: self.view(&id),
                });
            }
            ClientMessage::RejoinRoom { token, .. } => {
                let token = decode_token(&token).ok_or(ErrorCode::InvalidToken)?;
                let member = self
                    .members
                    .iter_mut()
                    .find(|m| tokens_equal(&m.token, &token))
                    .ok_or(ErrorCode::InvalidToken)?;
                if let Some(old) = member.connection.replace(peer.clone()) {
                    old.replace();
                }
                member.view.online = true;
                member.offline_since = None;
                let id = member.view.id.clone();
                self.empty_since = None;
                self.maintain_host(Instant::now());
                peer.send(ServerMessage::Joined {
                    v: PROTOCOL_VERSION,
                    room_code: self.code.clone(),
                    token: encode_token(&token),
                    room: self.view(&id),
                });
            }
            message => {
                let index = self
                    .members
                    .iter()
                    .position(|m| m.connection.as_ref().is_some_and(|p| p.id == peer.id))
                    .ok_or(ErrorCode::NotInRoom)?;
                match message {
                    ClientMessage::LeaveRoom { .. } => {
                        self.members.remove(index);
                        peer.send(ServerMessage::Left {
                            v: PROTOCOL_VERSION,
                        });
                        self.track_empty();
                    }
                    ClientMessage::TakeSeat { .. } => {
                        if self.phase != Phase::Waiting {
                            return Err(ErrorCode::WrongPhase);
                        }
                        if self.members[index].view.role == Role::Player {
                            return Ok(true);
                        }
                        if self.players() >= MAX_PLAYERS as usize {
                            return Err(ErrorCode::NoFreeSeat);
                        }
                        self.members[index].view.role = Role::Player;
                    }
                    ClientMessage::StartGame { .. } | ClientMessage::EndGame { .. } => {
                        if self.members[index].view.id != self.host {
                            return Err(ErrorCode::NotHost);
                        }
                        if matches!(message, ClientMessage::StartGame { .. }) {
                            if self.phase != Phase::Waiting {
                                return Err(ErrorCode::WrongPhase);
                            }
                            if self.players() < MIN_PLAYERS as usize {
                                return Err(ErrorCode::NotEnoughPlayers);
                            }
                            self.phase = Phase::Playing;
                        } else {
                            if self.phase != Phase::Playing {
                                return Err(ErrorCode::WrongPhase);
                            }
                            self.phase = Phase::Waiting;
                            for member in &mut self.members {
                                member.view.role = Role::Spectator;
                            }
                        }
                    }
                    _ => return Err(ErrorCode::InvalidMessage),
                }
            }
        }
        Ok(true)
    }

    fn track_empty(&mut self) {
        if self.members.iter().any(|m| m.view.online) {
            self.empty_since = None;
        } else if self.empty_since.is_none() {
            self.empty_since = Some(Instant::now());
        }
    }

    fn maintain_host(&mut self, now: Instant) -> bool {
        if self.members.iter().any(|m| {
            m.view.id == self.host
                && (m.view.online
                    || m.offline_since.is_some_and(|since| {
                        now.duration_since(since) < self.config.offline_timeout
                    }))
        }) {
            return false;
        }
        let online = |m: &&MemberState| m.view.online;
        let candidate = self
            .members
            .iter()
            .filter(online)
            .find(|m| m.view.role == Role::Player)
            .or_else(|| self.members.iter().find(|m| m.view.online));
        if let Some(member) = candidate {
            let changed = self.host != member.view.id;
            self.host = member.view.id.clone();
            return changed;
        }
        false
    }

    fn expire(&mut self, now: Instant) -> bool {
        let count = self.members.len();
        self.members.retain(|m| {
            !(m.offline_since
                .is_some_and(|since| now.duration_since(since) >= self.config.offline_timeout)
                && (self.phase == Phase::Waiting || m.view.role == Role::Spectator))
        });
        let host_changed = self.maintain_host(now);
        if self.members.len() != count || host_changed {
            self.broadcast();
        }
        self.empty_since
            .is_some_and(|since| now.duration_since(since) >= self.config.empty_room_timeout)
    }

    fn next_deadline(&self, now: Instant) -> Option<Instant> {
        self.members
            .iter()
            .filter_map(|m| {
                let expires = self.phase == Phase::Waiting
                    || m.view.role == Role::Spectator
                    || m.view.id == self.host;
                m.offline_since
                    .filter(|_| expires)
                    .map(|since| since + self.config.offline_timeout)
                    .filter(|deadline| *deadline > now)
            })
            .chain(
                self.empty_since
                    .map(|since| since + self.config.empty_room_timeout),
            )
            .min()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn timer_room(phase: Phase, online: bool) -> (Room, mpsc::Receiver<ServerMessage>) {
        let now = Instant::now();
        let (outgoing, receiver) = mpsc::channel(QUEUE_CAPACITY);
        let (shutdown, _) = tokio::sync::watch::channel(None);
        let room = Room {
            code: "ABCDE".into(),
            phase,
            host: if phase == Phase::Playing { "2" } else { "1" }.into(),
            members: vec![
                MemberState {
                    view: Member {
                        id: "1".into(),
                        nickname: "Online".into(),
                        role: Role::Player,
                        online,
                    },
                    token: [0; 16],
                    connection: online.then_some(Peer {
                        id: 1,
                        outgoing,
                        shutdown,
                    }),
                    offline_since: (!online).then_some(now),
                },
                MemberState {
                    view: Member {
                        id: "2".into(),
                        nickname: "Offline".into(),
                        role: Role::Player,
                        online: false,
                    },
                    token: [0; 16],
                    connection: None,
                    offline_since: Some(now),
                },
            ],
            next_id: 3,
            empty_since: (!online).then_some(now),
            config: Config::default(),
            registry: Weak::new(),
        };
        (room, receiver)
    }

    #[tokio::test(start_paused = true)]
    async fn deadline_survives_clock_advancing_between_expiry_and_scheduling() {
        for phase in [Phase::Waiting, Phase::Playing] {
            let (mut room, mut snapshots) = timer_room(phase, true);
            let deadline = Instant::now() + room.config.offline_timeout;
            tokio::time::advance(std::time::Duration::from_secs(59)).await;
            let now = Instant::now();
            assert!(!room.expire(now));
            tokio::time::advance(std::time::Duration::from_secs(2)).await;
            assert_eq!(room.next_deadline(now), Some(deadline));
            tokio::time::sleep_until(deadline).await;
            assert!(!room.expire(Instant::now()));
            assert_eq!(room.host, "1");
            assert_eq!(
                room.members.len(),
                if phase == Phase::Waiting { 1 } else { 2 }
            );
            assert!(matches!(
                snapshots.try_recv(),
                Ok(ServerMessage::RoomState { .. })
            ));
            assert_eq!(room.next_deadline(Instant::now()), None);
        }
    }

    #[tokio::test(start_paused = true)]
    async fn processed_offline_host_deadline_does_not_spin() {
        let (mut room, _) = timer_room(Phase::Playing, false);
        let cleanup = Instant::now() + room.config.empty_room_timeout;
        tokio::time::advance(room.config.offline_timeout).await;
        assert!(!room.expire(Instant::now()));
        assert_eq!(room.members.len(), 2);
        assert_eq!(room.host, "2");
        assert_eq!(room.next_deadline(Instant::now()), Some(cleanup));
    }

    #[test]
    fn tokens_and_unicode_nicknames() {
        let token = [0xab; 16];
        assert_eq!(decode_token(&encode_token(&token)), Some(token));
        assert!(tokens_equal(&token, &[0xab; 16]));
        for index in 0..16 {
            let mut other = token;
            other[index] ^= 1;
            assert!(!tokens_equal(&token, &other));
        }
        assert!(decode_token("invalid").is_none());
        assert_eq!(nickname("  Hân  "), Ok("Hân".into()));
        assert!(nickname(&"ắ".repeat(21)).is_err());
        assert!(nickname("a\nb").is_err());
    }
}
