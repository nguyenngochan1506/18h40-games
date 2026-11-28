use crate::games::{GameSession, module};
use crate::voice::{VoiceLease, VoiceRoom};
use crate::{Config, Peer, QUEUE_CAPACITY, error};
use protocol::{
    ClientMessage, ErrorCode, GameKind, GameSeat, GameSettings, Member, PROTOCOL_VERSION, Phase,
    Role, RoomView, ServerMessage, VoiceError, VoiceTokenResult,
};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex, Weak},
    time::Duration,
};
use tokio::{
    sync::{mpsc, oneshot},
    time::Instant,
};

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
    Voice {
        connection_id: u64,
        request: VoiceRequest,
        reply: oneshot::Sender<ServerMessage>,
    },
}

#[derive(Clone, Copy)]
pub(crate) enum VoiceRequest {
    Token(u32),
    Leave(u32),
}

impl VoiceRequest {
    pub fn error(self, code: VoiceError) -> ServerMessage {
        match self {
            Self::Token(nonce) => ServerMessage::VoiceTokenResult {
                v: PROTOCOL_VERSION,
                nonce,
                result: VoiceTokenResult::Error { code },
            },
            Self::Leave(nonce) => Self::left(nonce, Some(code)),
        }
    }

    fn left(nonce: u32, error: Option<VoiceError>) -> ServerMessage {
        ServerMessage::VoiceLeaveResult {
            v: PROTOCOL_VERSION,
            nonce,
            error,
        }
    }
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

    pub fn create(
        &self,
        name: &str,
        game_kind: GameKind,
    ) -> Result<mpsc::Sender<Command>, ErrorCode> {
        nickname(name)?;
        if !module(game_kind).enabled() {
            return Err(ErrorCode::GameUnavailable);
        }
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
        let voice = self.config.voice.as_ref().and_then(|config| {
            let mut instance = [0; 16];
            getrandom::fill(&mut instance).ok()?;
            Some(config.room(&encode_token(&instance)))
        });
        let room = Room {
            game_kind,
            settings: module(game_kind).default_settings(),
            code,
            phase: Phase::Waiting,
            game: None,
            host: String::new(),
            members: Vec::new(),
            next_id: 1,
            empty_since: Some(Instant::now()),
            config: self.config.clone(),
            registry: Arc::downgrade(&self.rooms),
            voice,
            next_voice_id: 1,
        };
        tokio::spawn(room.run(receiver));
        Ok(sender)
    }
}

pub(crate) async fn request_voice(
    sender: &mpsc::Sender<Command>,
    connection_id: u64,
    request: VoiceRequest,
) -> ServerMessage {
    let (reply, result) = oneshot::channel();
    let deadline = Instant::now() + Duration::from_secs(2);
    let command = Command::Voice {
        connection_id,
        request,
        reply,
    };
    match sender.try_send(command) {
        Ok(()) => {}
        Err(mpsc::error::TrySendError::Full(command))
            if matches!(request, VoiceRequest::Leave(_)) =>
        {
            match tokio::time::timeout_at(deadline, sender.send(command)).await {
                Ok(Ok(())) => {}
                Ok(Err(_)) => return request.error(VoiceError::NotInRoom),
                Err(_) => return request.error(VoiceError::VoiceUnavailable),
            }
        }
        Err(mpsc::error::TrySendError::Full(_)) => return request.error(VoiceError::RateLimited),
        Err(mpsc::error::TrySendError::Closed(_)) => return request.error(VoiceError::NotInRoom),
    }
    match tokio::time::timeout_at(deadline, result).await {
        Ok(Ok(response)) => response,
        Ok(Err(_)) => request.error(VoiceError::NotInRoom),
        Err(_) => request.error(VoiceError::VoiceUnavailable),
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
    voice: Option<VoiceLease>,
    last_voice_grant: Option<Instant>,
}

struct Room {
    game_kind: GameKind,
    settings: GameSettings,
    code: String,
    phase: Phase,
    game: Option<Box<dyn GameSession>>,
    host: String,
    members: Vec<MemberState>,
    next_id: u64,
    empty_since: Option<Instant>,
    config: Config,
    registry: Weak<Rooms>,
    voice: Option<VoiceRoom>,
    next_voice_id: u64,
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
                        let now = Instant::now();
                        if self.expire(now) { break; }
                        let result = self.apply(&peer, message, now);
                        match result {
                            Ok(changed) => { if changed { self.maintain_host(now); self.broadcast(); } }
                            Err(code) => peer.send(error(code)),
                        }
                        let member = self.members.iter().any(|m| m.connection.as_ref().is_some_and(|p| p.id == peer.id));
                        let _ = reply.send(member);
                    }
                    Some(Command::Voice { connection_id, request, reply }) => {
                        let now = Instant::now();
                        if self.expire(now) { break; }
                        if !reply.is_closed() || matches!(request, VoiceRequest::Leave(_)) {
                            let _ = reply.send(self.voice_request(connection_id, request, now));
                        }
                    }
                    Some(Command::Disconnect { connection_id }) => {
                        let now = Instant::now();
                        if let Some(member) = self.members.iter_mut().find(|m| m.connection.as_ref().is_some_and(|p| p.id == connection_id)) {
                            member.connection = None;
                            member.voice = None;
                            member.view.online = false;
                            member.offline_since = Some(now);
                            self.track_empty(now);
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

    fn voice_request(
        &mut self,
        connection_id: u64,
        request: VoiceRequest,
        now: Instant,
    ) -> ServerMessage {
        let Some(member) = self
            .members
            .iter_mut()
            .find(|m| m.connection.as_ref().is_some_and(|p| p.id == connection_id))
        else {
            return request.error(VoiceError::NotInRoom);
        };
        match request {
            VoiceRequest::Leave(nonce) => {
                member.voice = None;
                VoiceRequest::left(nonce, None)
            }
            VoiceRequest::Token(nonce) => {
                let Some(room) = &self.voice else {
                    return request.error(VoiceError::VoiceDisabled);
                };
                if member
                    .last_voice_grant
                    .is_some_and(|last| now.duration_since(last) < Duration::from_secs(2))
                {
                    return request.error(VoiceError::RateLimited);
                }
                let identity = format!("m-{}-a-{}", member.view.id, self.next_voice_id);
                let (result, lease) = match room.grant(identity) {
                    Ok(grant) => grant,
                    Err(code) => return request.error(code),
                };
                self.next_voice_id += 1;
                member.last_voice_grant = Some(now);
                member.voice = Some(lease);
                ServerMessage::VoiceTokenResult {
                    v: PROTOCOL_VERSION,
                    nonce,
                    result,
                }
            }
        }
    }

    fn view(&self, you: &str) -> RoomView {
        let (min_players, max_players) = module(self.game_kind).limits(&self.settings);
        RoomView {
            game: self.game_kind,
            settings: self.settings.clone(),
            code: self.code.clone(),
            phase: self.phase,
            host: self.host.clone(),
            you: you.into(),
            min_players,
            max_players,
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

    fn broadcast_game(&mut self) {
        let game = self.game.as_mut().unwrap();
        for member in &self.members {
            if let Some(peer) = &member.connection
                && let Some(message) = game.update(&member.view.id)
            {
                peer.send(message);
            }
        }
    }

    fn game_deadline(&self) -> Option<Instant> {
        let game = self.game.as_ref()?;
        let seat = game.awaited_seat()?;
        let member = self
            .members
            .iter()
            .find(|member| member.view.id == game.seats()[seat].member_id)?;
        Some(member.offline_since?.max(game.waiting_since()) + self.config.offline_timeout)
    }

    fn drive_game(&mut self, now: Instant) {
        while let Some(game) = &self.game {
            let Some(seat) = game.awaited_seat() else {
                break;
            };
            let member = self
                .members
                .iter()
                .find(|member| member.view.id == game.seats()[seat].member_id);
            let due = match member {
                Some(_) => self.game_deadline().is_some_and(|deadline| deadline <= now),
                // An abandoned game pauses at a turn boundary instead of spinning forever.
                None => game.may_continue_abandoned(&|seat| {
                    self.members
                        .iter()
                        .any(|member| member.view.id == game.seats()[seat].member_id)
                }),
            };
            if !due {
                break;
            }
            self.game
                .as_mut()
                .unwrap()
                .apply_default(now)
                .expect("Engine default actions are valid");
            self.broadcast_game();
        }
    }

    fn players(&self) -> usize {
        self.members
            .iter()
            .filter(|m| m.view.role == Role::Player)
            .count()
    }

    fn apply(
        &mut self,
        peer: &Peer,
        message: ClientMessage,
        now: Instant,
    ) -> Result<bool, ErrorCode> {
        let previous_players = self.players();
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
                let role = if self.phase == Phase::Waiting
                    && self.players() < module(self.game_kind).limits(&self.settings).1 as usize
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
                    voice: None,
                    last_voice_grant: None,
                });
                self.empty_since = None;
                self.maintain_host(now);
                self.adjust_settings_if_changed(previous_players);
                peer.send(ServerMessage::Joined {
                    v: PROTOCOL_VERSION,
                    room_code: self.code.clone(),
                    token: encode_token(&token),
                    room: self.view(&id),
                    game: self.game.as_mut().map(|game| game.snapshot(&id)),
                    voice_enabled: self.voice.is_some(),
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
                member.voice = None;
                member.last_voice_grant = None;
                member.view.online = true;
                member.offline_since = None;
                let id = member.view.id.clone();
                self.empty_since = None;
                self.maintain_host(now);
                self.adjust_settings_if_changed(previous_players);
                peer.send(ServerMessage::Joined {
                    v: PROTOCOL_VERSION,
                    room_code: self.code.clone(),
                    token: encode_token(&token),
                    room: self.view(&id),
                    game: self.game.as_mut().map(|game| game.snapshot(&id)),
                    voice_enabled: self.voice.is_some(),
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
                        self.track_empty(now);
                        self.drive_game(now);
                    }
                    ClientMessage::TakeSeat { .. } => {
                        if self.phase != Phase::Waiting {
                            return Err(ErrorCode::WrongPhase);
                        }
                        if self.members[index].view.role == Role::Player {
                            return Ok(true);
                        }
                        if self.players()
                            >= module(self.game_kind).limits(&self.settings).1 as usize
                        {
                            return Err(ErrorCode::NoFreeSeat);
                        }
                        self.members[index].view.role = Role::Player;
                    }
                    ClientMessage::UpdateSettings { settings, .. } => {
                        if self.members[index].view.id != self.host {
                            return Err(ErrorCode::NotHost);
                        }
                        if self.phase != Phase::Waiting {
                            return Err(ErrorCode::WrongPhase);
                        }
                        module(self.game_kind).validate_settings(&settings, self.players())?;
                        self.settings = settings;
                    }
                    ClientMessage::ChangeGame { game, .. } => {
                        if self.members[index].view.id != self.host {
                            return Err(ErrorCode::NotHost);
                        }
                        if self.phase != Phase::Waiting {
                            return Err(ErrorCode::WrongPhase);
                        }
                        let target = module(game);
                        if !target.enabled() {
                            return Err(ErrorCode::GameUnavailable);
                        }
                        if game == self.game_kind {
                            return Ok(false);
                        }
                        self.game_kind = game;
                        self.settings = target.default_settings();
                        for member in &mut self.members {
                            member.view.role = Role::Spectator;
                        }
                        return Ok(true);
                    }
                    ClientMessage::StartGame { .. } | ClientMessage::EndGame { .. } => {
                        if self.members[index].view.id != self.host {
                            return Err(ErrorCode::NotHost);
                        }
                        if matches!(message, ClientMessage::StartGame { .. }) {
                            if self.phase != Phase::Waiting {
                                return Err(ErrorCode::WrongPhase);
                            }
                            if self.players()
                                < module(self.game_kind).limits(&self.settings).0 as usize
                            {
                                return Err(ErrorCode::NotEnoughPlayers);
                            }
                            let seats = self
                                .members
                                .iter()
                                .filter(|member| member.view.role == Role::Player)
                                .enumerate()
                                .map(|(i, member)| GameSeat {
                                    player_id: i,
                                    member_id: member.view.id.clone(),
                                    nickname: member.view.nickname.clone(),
                                })
                                .collect();
                            let game = module(self.game_kind).start(
                                seats,
                                &self.settings,
                                self.config.game_seed,
                                now,
                            )?;
                            self.game = Some(game);
                            self.phase = Phase::Playing;
                            for member in &self.members {
                                if let Some(peer) = &member.connection {
                                    peer.send(ServerMessage::GameStarted {
                                        v: PROTOCOL_VERSION,
                                        seq: 0,
                                        seats: self.game.as_ref().unwrap().seats().to_vec(),
                                        view: self.game.as_ref().unwrap().view(&member.view.id),
                                    });
                                }
                            }
                            self.broadcast_game();
                        } else {
                            if self.phase != Phase::Playing {
                                return Err(ErrorCode::WrongPhase);
                            }
                            self.game = None;
                            self.phase = Phase::Waiting;
                            for member in &mut self.members {
                                member.view.role = Role::Spectator;
                            }
                            return Ok(true);
                        }
                    }
                    ClientMessage::GameAction { action, .. } => {
                        let game = self.game.as_mut().ok_or(ErrorCode::WrongPhase)?;
                        game.apply(&self.members[index].view.id, action, now)?;
                        self.broadcast_game();
                        self.drive_game(now);
                        return Ok(false);
                    }
                    ClientMessage::HostSkip { .. } => {
                        if self.members[index].view.id != self.host {
                            return Err(ErrorCode::NotHost);
                        }
                        let game = self.game.as_mut().ok_or(ErrorCode::WrongPhase)?;
                        game.apply_default(now)?;
                        self.broadcast_game();
                        self.drive_game(now);
                        return Ok(false);
                    }
                    _ => return Err(ErrorCode::InvalidMessage),
                }
            }
        }
        self.adjust_settings_if_changed(previous_players);
        Ok(true)
    }

    fn adjust_settings_if_changed(&mut self, previous_players: usize) {
        if self.phase == Phase::Waiting && self.players() != previous_players {
            let players = self.players();
            module(self.game_kind).adjust_settings(&mut self.settings, players);
        }
    }

    fn track_empty(&mut self, now: Instant) {
        if self.members.iter().any(|m| m.view.online) {
            self.empty_since = None;
        } else if self.empty_since.is_none() {
            self.empty_since = Some(now);
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
        let previous_players = self.players();
        self.members.retain(|m| {
            !(m.offline_since
                .is_some_and(|since| now.duration_since(since) >= self.config.offline_timeout)
                && (self.phase == Phase::Waiting || m.view.role == Role::Spectator))
        });
        self.adjust_settings_if_changed(previous_players);
        let host_changed = self.maintain_host(now);
        if self.members.len() != count || host_changed {
            self.broadcast();
        }
        self.drive_game(now);
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
            .chain(self.game_deadline())
            .chain(
                self.empty_since
                    .map(|since| since + self.config.empty_room_timeout),
            )
            .min()
    }
}

#[cfg(test)]
mod tests;
