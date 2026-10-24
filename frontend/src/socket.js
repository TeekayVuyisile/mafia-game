import { io } from 'socket.io-client';
import { authClient } from './authClient';

const URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000'; // Match your backend port

export const socket = io(URL, {
    autoConnect: false,
    transports: ['websocket', 'polling'],  // Add this for better compatibility with render
    // The server identifies players by their session; re-read on every (re)connect so it's never stale
    auth: (cb) => {
        authClient.getSession()
            .then(({ data }) => cb({ token: data?.session?.token }))
            .catch(() => cb({}));
    }
});
