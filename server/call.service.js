import User from '../models/user.model.js';

export const handleCall = (socket, io, onlineUsers) => {
  // Khi user gọi cho người khác
  socket.on('callUser', async ({ callerId, calleeId, callType }) => {
    // Lấy thông tin user gọi
    const caller = await User.findById(callerId).select('username fullName profilePicture');
    // Gửi sự kiện "incomingCall" cho người nhận (callee) kèm username
    io.to(calleeId).emit('incomingCall', {
      callerId,
      callType,
      callerName: caller?.username || 'Người lạ',
      callerProfilePicture: caller?.profilePicture || '',
    });
  });

  // Khi người nhận đồng ý cuộc gọi
  socket.on('acceptCall', ({ callerId, calleeId }) => {
    // Gửi cho người gọi biết là người nhận đã đồng ý
    io.to(callerId).emit('callAccepted', { calleeId });
  });

  // Khi người nhận từ chối cuộc gọi
  socket.on('rejectCall', ({ callerId, calleeId }) => {
    io.to(callerId).emit('callRejected', { calleeId });
  });

  // Khi user nhận cuộc gọi và gửi tín hiệu trả lời
  socket.on('answerCall', ({ to, from, signal }) => {
    io.to(to).emit('callAnswered', { from, signal });
  });

  // Khi user gửi ICE candidate
  socket.on('iceCandidate', ({ to, candidate }) => {
    io.to(to).emit('iceCandidate', { from: socket.userId, candidate });
  });

  // Khi user hủy cuộc gọi
  socket.on('endCall', ({ to, from }) => {
    io.to(to).emit('callEnded', { from });
  });

  // Khi user gửi offer
  socket.on('webrtc-offer', ({ to, from, offer }) => {
    const receiverSockets = onlineUsers.get(to);
    if (receiverSockets) {
      receiverSockets.forEach(socketId => {
        io.to(socketId).emit('webrtc-offer', { from, offer });
      });
    }
  });

  // Khi user gửi answer
  socket.on('webrtc-answer', ({ to, from, answer }) => {
    const receiverSockets = onlineUsers.get(to);
    if (receiverSockets) {
      receiverSockets.forEach(socketId => {
        io.to(socketId).emit('webrtc-answer', { from, answer });
      });
    }
  });

  // Khi user gửi ICE candidate
  socket.on('webrtc-ice-candidate', ({ to, from, candidate }) => {
    const receiverSockets = onlineUsers.get(to);
    if (receiverSockets) {
      receiverSockets.forEach(socketId => {
        io.to(socketId).emit('webrtc-ice-candidate', { from, candidate });
      });
    }
  });
};