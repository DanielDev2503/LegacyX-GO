import { SignalingClient, sharedSignaling } from './SignalingClient.js';
import { NetworkHost } from './NetworkHost.js';
import { NetworkClient } from './NetworkClient.js';
import { gameUI } from '../ui/state/gameUI.svelte.js';

export interface CreateRoomParams {
  name: string;
  stadium: string;
  isPublic?: boolean;
  password?: string;
  maxPlayers?: number;
  timeLimit?: number;
  scoreLimit?: number;
  teamsLocked?: boolean;
}

export class GameApp {
  public signaling: SignalingClient;
  public networkHost: NetworkHost | null = null;
  public networkClient: NetworkClient | null = null;
  public isHost: boolean = false;
  public currentRoomId: string | null = null;
  public currentRoomConfig: CreateRoomParams | null = null;

  constructor(signaling: SignalingClient = sharedSignaling) {
    this.signaling = signaling;
  }

  public async createRoom(params: CreateRoomParams): Promise<boolean> {
    await this.signaling.ensureConnected();

    return new Promise<boolean>((resolve) => {
      const cleanName = params.name.trim() || `${gameUI.nickname || 'Player'}'s room`;
      const stadium = params.stadium || 'mediano';
      const maxPlayers = params.maxPlayers ?? 12;
      const isPublic = params.isPublic !== false;
      const password = params.password;

      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          // Fallback optimista para modo local/offline
          this.setupHostState(cleanName, stadium, maxPlayers, isPublic, `R-${Date.now().toString().slice(-4)}`, params);
          resolve(true);
        }
      }, 4000);

      const onRoomCreated = (msg: any) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          cleanup();
          const roomId = msg.roomId || msg.id || `R-${Date.now().toString().slice(-4)}`;
          this.setupHostState(cleanName, stadium, maxPlayers, isPublic, roomId, params);
          resolve(true);
        }
      };

      const cleanup = () => {
        this.signaling.off('room_created', onRoomCreated);
        this.signaling.off('ROOM_CREATED', onRoomCreated);
      };

      this.signaling.on('room_created', onRoomCreated);
      this.signaling.on('ROOM_CREATED', onRoomCreated);

      this.signaling.send({
        type: 'create_room',
        name: cleanName,
        stadiumId: stadium,
        stadium,
        maxPlayers,
        isPublic,
        password,
        config: {
          name: cleanName,
          stadiumId: stadium,
          stadium,
          maxPlayers,
          isPrivate: !isPublic,
          password,
          timeLimit: params.timeLimit ?? 3,
          scoreLimit: params.scoreLimit ?? 3,
          teamsLocked: params.teamsLocked ?? true
        }
      });
    });
  }

  private setupHostState(
    name: string,
    stadium: string,
    maxPlayers: number,
    isPublic: boolean,
    roomId: string,
    params?: CreateRoomParams
  ): void {
    this.isHost = true;
    this.currentRoomId = roomId;
    this.currentRoomConfig = params || { name, stadium, maxPlayers, isPublic };

    // Inicializar NetworkHost para la sala
    if (this.networkHost) {
      this.networkHost.destroy();
    }
    this.networkHost = new NetworkHost(this.signaling, gameUI.nickname || 'Host');

    // Configurar estado en gameUI
    gameUI.isHost = true;
    gameUI.activeRoom = {
      id: roomId,
      name,
      stadium,
      maxPlayers,
      playersCount: 1,
      ping: gameUI.realPing || 20,
      isPrivate: !isPublic,
      password: params?.password
    };
    gameUI.selectStadium(stadium as any);
  }

  public async joinRoom(roomId: string, password?: string): Promise<boolean> {
    await this.signaling.ensureConnected();

    return new Promise<boolean>((resolve) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(false);
        }
      }, 5000);

      const onJoined = (msg: any) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          cleanup();
          this.setupGuestState(roomId, msg);
          resolve(true);
        }
      };

      const onError = (msg: any) => {
        if (!resolved && (msg.code === 'ROOM_NOT_FOUND' || msg.code === 'INVALID_PASSWORD' || msg.code === 'ROOM_FULL')) {
          resolved = true;
          clearTimeout(timeout);
          cleanup();
          resolve(false);
        }
      };

      const cleanup = () => {
        this.signaling.off('room_joined', onJoined);
        this.signaling.off('ROOM_JOINED', onJoined);
        this.signaling.off('JOIN_SUCCESS', onJoined);
        this.signaling.off('error', onError);
        this.signaling.off('ERROR', onError);
      };

      this.signaling.on('room_joined', onJoined);
      this.signaling.on('ROOM_JOINED', onJoined);
      this.signaling.on('JOIN_SUCCESS', onJoined);
      this.signaling.on('error', onError);
      this.signaling.on('ERROR', onError);

      this.signaling.send({
        type: 'join_room',
        roomId,
        password,
        nickname: gameUI.nickname || 'Guest'
      });
    });
  }

  private setupGuestState(roomId: string, msg: any): void {
    this.isHost = false;
    this.currentRoomId = roomId;

    if (this.networkClient) {
      this.networkClient.disconnect();
    }
    this.networkClient = new NetworkClient(this.signaling, gameUI.nickname || 'Guest');

    gameUI.isHost = false;
    gameUI.activeRoom = {
      id: roomId,
      name: msg.roomName || msg.name || `Sala ${roomId}`,
      stadium: msg.stadiumId || msg.stadium || 'mediano',
      maxPlayers: msg.maxPlayers || 12,
      playersCount: 2,
      ping: gameUI.realPing || 20,
      isPrivate: false
    };
    gameUI.selectStadium((msg.stadiumId || msg.stadium || 'mediano') as any);
  }

  public leaveCurrentRoom(): void {
    if (this.currentRoomId) {
      this.signaling.send({
        type: 'leave_room',
        roomId: this.currentRoomId
      });
    }
    if (this.networkHost) {
      this.networkHost.destroy();
      this.networkHost = null;
    }
    if (this.networkClient) {
      this.networkClient.disconnect();
      this.networkClient = null;
    }
    this.isHost = false;
    this.currentRoomId = null;
    this.currentRoomConfig = null;
  }
}

export const gameApp = new GameApp();
