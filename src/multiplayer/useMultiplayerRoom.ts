import { useEffect, useRef, useState } from 'react';
import PartySocket from 'partysocket';
import type { MultiplayerRoom } from '../types';
import { makePlayerId } from './room';

// Client ↔ server message shapes — must match partykit/server.ts. Duplicated
// because the server lives in a separate bundle. If either side changes, grep
// the other.
type ClientMessage =
  | { type: 'join'; name: string }
  | { type: 'toggleReady' }
  | { type: 'start' }
  | { type: 'finish'; finalScore: number }
  | { type: 'playAgain' };

type ServerMessage =
  | { type: 'state'; state: Omit<MultiplayerRoom, 'selfId'> }
  | { type: 'error'; message: string };

export type MultiplayerSend = (msg: ClientMessage) => void;

export type UseMultiplayerRoomResult = {
  // null while connecting or not in a room; populated once we receive the
  // first state snapshot from the server.
  room: MultiplayerRoom | null;
  // Non-null when the server has sent a user-visible error (e.g. "room full")
  error: string | null;
  // 'connecting' until the WS opens and first state arrives, 'connected' after
  // that, 'disconnected' on close.
  status: 'idle' | 'connecting' | 'connected' | 'disconnected';
  send: MultiplayerSend;
};

export function useMultiplayerRoom(
  code: string | null,
  name: string | null,
): UseMultiplayerRoomResult {
  const [room, setRoom] = useState<MultiplayerRoom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<UseMultiplayerRoomResult['status']>('idle');
  const socketRef = useRef<PartySocket | null>(null);
  // Stable id across reconnects within a single session — Phase 2 doesn't
  // reuse this across page reloads (fresh load = new id = new player slot).
  const selfIdRef = useRef<string>(makePlayerId());

  useEffect(() => {
    if (!code || !name) {
      setStatus('idle');
      return;
    }
    const host = import.meta.env.VITE_PARTYKIT_HOST || 'localhost:1999';
    setStatus('connecting');
    setError(null);

    const socket = new PartySocket({
      host,
      room: code.toUpperCase(),
      id: selfIdRef.current,
    });
    socketRef.current = socket;

    const onOpen = () => {
      socket.send(JSON.stringify({ type: 'join', name } satisfies ClientMessage));
    };

    const onMessage = (ev: MessageEvent) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.type === 'state') {
        setRoom({ ...msg.state, selfId: selfIdRef.current });
        setStatus('connected');
      } else if (msg.type === 'error') {
        setError(msg.message);
      }
    };

    const onClose = () => { setStatus('disconnected'); };
    const onError = () => { setError('Connection failed.'); };

    socket.addEventListener('open', onOpen);
    socket.addEventListener('message', onMessage);
    socket.addEventListener('close', onClose);
    socket.addEventListener('error', onError);

    return () => {
      socket.removeEventListener('open', onOpen);
      socket.removeEventListener('message', onMessage);
      socket.removeEventListener('close', onClose);
      socket.removeEventListener('error', onError);
      socket.close();
      socketRef.current = null;
      setRoom(null);
      setStatus('idle');
    };
  }, [code, name]);

  const send: MultiplayerSend = (msg) => {
    const s = socketRef.current;
    if (!s) return;
    try {
      s.send(JSON.stringify(msg));
    } catch {
      // Socket may be closing — swallow; next state update will reflect the
      // disconnected status and the UI can surface it.
    }
  };

  return { room, error, status, send };
}
