import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { API_BASE } from '../api/client';

let idCounter = 0;

/**
 * Connects to the existing Socket.IO backend using the same session
 * cookie as every REST call (withCredentials: true) - there is no
 * separate socket auth token. Only active while `enabled` is true (i.e.
 * the user is signed in), and disconnects on sign-out.
 *
 * This hook does not interpret or recompute anything from the event
 * payloads - it just surfaces them as a notification feed and a
 * "refreshSignal" counter the rest of the app can watch to know when to
 * refetch tasks. All actual scoring/eligibility/etc. already happened
 * on the backend before the event was ever emitted.
 */
export function useTaskSocket(enabled) {
  const [notifications, setNotifications] = useState([]);
  const [connected, setConnected] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!enabled) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setConnected(false);
      return undefined;
    }

    const socket = io(API_BASE, { withCredentials: true, transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    const pushNotification = (type, message, task) => {
      idCounter += 1;
      setNotifications((prev) => [{ id: idCounter, type, message, task, at: Date.now() }, ...prev].slice(0, 8));
      setRefreshSignal((n) => n + 1);
    };

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('task:created', ({ task }) => {
      pushNotification('created', `New ${task.priorityLevel} priority task: "${task.title}"`, task);
    });
    socket.on('task:priority_updated', ({ task, previousLevel }) => {
      pushNotification('priority_updated', `"${task.title}" priority changed: ${previousLevel} → ${task.priorityLevel}`, task);
    });
    socket.on('task:completed', ({ task }) => {
      pushNotification('completed', `"${task.title}" marked completed`, task);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [enabled]);

  const markTaskCompleteViaSocket = (taskId) =>
    new Promise((resolve, reject) => {
      if (!socketRef.current) return reject(new Error('Not connected'));
      socketRef.current.emit('task:mark_complete', { taskId }, (ack) => {
        if (ack && ack.success) resolve(ack.data);
        else reject(new Error((ack && ack.message) || 'Failed to mark task complete'));
      });
    });

  const dismissNotification = (id) => setNotifications((prev) => prev.filter((n) => n.id !== id));

  return { notifications, connected, refreshSignal, markTaskCompleteViaSocket, dismissNotification };
}
