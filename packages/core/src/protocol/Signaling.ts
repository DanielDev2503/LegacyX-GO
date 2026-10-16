/**
 * Contrato JSON de señalización (WebSocket) compartido entre @legacyx/server y @legacyx/client.
 * Sólo metadatos de emparejamiento: el tráfico de juego viaja por DataChannel binario (BinaryProtocol).
 * Tipos planos sin DOM para que el core siga siendo isomórfico.
 */

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
}

export type SignalType = 'SIGNAL_OFFER' | 'SIGNAL_ANSWER' | 'SIGNAL_ICE_CANDIDATE';

export type ClientSignalMessage =
  | { type: 'ROOM_CREATE'; name: string; stadiumId: string; maxPlayers: number; password?: string }
  | { type: 'ROOM_LIST' }
  | { type: 'ROOM_JOIN'; roomId: string; password?: string; nickname?: string }
  | { type: 'ROOM_LEAVE' }
  | { type: SignalType; targetId: string; data: SignalData }
  | { type: 'PING' };

export type ServerSignalMessage =
  | { type: 'WELCOME'; peerId: string; iceServers: IceServerConfig[] }
  | { type: 'ROOM_CREATED'; roomId: string }
  | { type: 'ROOM_LIST'; rooms: RoomSummary[] }
  | { type: 'ROOM_JOINED'; roomId: string; hostPeerId: string; stadiumId: string }
  | { type: 'PEER_JOINED'; peerId: string; nickname: string }
  | { type: 'PEER_DISCONNECT'; peerId: string }
  | { type: SignalType; fromId: string; data: SignalData }
  | { type: 'ERROR'; code: string; message: string }
  | { type: 'PONG' };
