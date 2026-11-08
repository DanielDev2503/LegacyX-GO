/**
 * Contrato JSON de señalización (WebSocket) compartido entre @legacyx/server y @legacyx/client.
 * Sólo metadatos de emparejamiento: el tráfico de juego viaja por DataChannel binario (BinaryProtocol).
 * Tipos planos sin DOM para que el core siga siendo isomórfico.
 */

export type RoomCategory = 'casual' | 'ranked';

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface SessionDescription {
  type: string;
  sdp?: string;
}

export interface IceCandidate {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export interface SignalData {
  sdp?: SessionDescription;
  candidate?: IceCandidate;
}

export interface RoomSummary {
  id: string;
  name: string;
  stadiumId: string;
  maxPlayers: number;
  currentPlayers: number;
  hasPassword: boolean;
  isLocked: boolean;
  createdAt: number;
  isDedicated?: boolean;
  roomType?: RoomCategory;
  countryCode?: string;
  hostPingMs?: number;
}

export interface RankedParticipantStat {
  userId: string;
  team: 'red' | 'blue';
  goals: number;
  assists: number;
  saves: number;
  isMvp: boolean;
  elo?: number;
}

export type SignalType = 'SIGNAL_OFFER' | 'SIGNAL_ANSWER' | 'SIGNAL_ICE_CANDIDATE';

export type ClientSignalMessage =
  | {
      type: 'ROOM_CREATE';
      name: string;
      stadiumId: string;
      maxPlayers: number;
      password?: string;
      isDedicated?: boolean;
      roomType?: RoomCategory;
      timeZone?: string;
      countryCode?: string;
      accessToken?: string;
    }
  | { type: 'ROOM_LIST' }
  | {
      type: 'ROOM_JOIN';
      roomId: string;
      password?: string;
      nickname?: string;
      isGuest?: boolean;
      accessToken?: string;
    }
  | { type: 'ROOM_LEAVE' }
  | {
      type: 'RANKED_MATCH_START';
      roomId: string;
      stadiumId: string;
      participantUserIds: string[];
      accessToken?: string;
    }
  | {
      type: 'RANKED_MATCH_REPORT';
      roomId: string;
      matchToken: string;
      stadiumId: string;
      durationSeconds: number;
      redScore: number;
      blueScore: number;
      winner: 'red' | 'blue' | 'draw';
      status?: 'COMPLETED' | 'ABORTED';
      participants: RankedParticipantStat[];
      accessToken?: string;
    }
  | { type: 'REPORT_PING'; pingMs: number }
  | { type: SignalType; targetId: string; data: SignalData }
  | { type: 'PING'; clientSentAt?: number };

export type ServerSignalMessage =
  | { type: 'WELCOME'; peerId: string; iceServers: IceServerConfig[]; detectedCountry?: string }
  | { type: 'ROOM_CREATED'; roomId: string; roomType?: RoomCategory; countryCode?: string }
  | { type: 'ROOM_LIST'; rooms: RoomSummary[] }
  | { type: 'ROOM_JOINED'; roomId: string; hostPeerId: string; stadiumId: string; roomType?: RoomCategory }
  | { type: 'PEER_JOINED'; peerId: string; nickname: string; userId?: string; isGuest?: boolean }
  | { type: 'PEER_DISCONNECT'; peerId: string }
  | { type: 'RANKED_MATCH_TOKEN'; roomId: string; matchToken: string }
  | { type: 'RANKED_MATCH_RESULT'; roomId: string; success: boolean; status?: string; error?: string }
  | { type: SignalType; fromId: string; data: SignalData }
  | { type: 'ERROR'; code: string; message: string }
  | { type: 'PONG'; clientSentAt?: number; serverTime?: number };
