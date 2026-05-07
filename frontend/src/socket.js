import { io } from 'socket.io-client';

const URL = 'http://localhost:5000'; // Match your backend port

export const socket = io(URL, {
    autoConnect: false
});
