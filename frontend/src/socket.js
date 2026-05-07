import { io } from 'socket.io-client';

const URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000'; // Match your backend port

export const socket = io(URL, {
    autoConnect: false,
    transports: ['websocket', 'polling']  // Add this for better compatibility with render
});
