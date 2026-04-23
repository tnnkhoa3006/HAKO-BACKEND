import Group from '../models/group.model.js';
import User from '../models/user.model.js';

export const createGroup = async (req, res) => {
  try {
    const { name, members } = req.body;
    const adminId = req.user.id; // from verifyToken middleware

    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, message: 'Tên nhóm không được để trống' });
    }

    // Prepare members array including admin
    let groupMembers = [adminId];
    if (members && Array.isArray(members)) {
      // Filter out duplicate admin if any, and convert to string for uniqueness check later if needed
      const filteredMembers = members.filter(id => id !== adminId);
      groupMembers = [...groupMembers, ...filteredMembers];
    }

    // Ensure all members exist
    const validUsers = await User.find({ _id: { $in: groupMembers } });
    if (validUsers.length !== groupMembers.length) {
      return res.status(400).json({ success: false, message: 'Một hoặc nhiều người dùng không hợp lệ' });
    }

    const newGroup = await Group.create({
      name: name.trim(),
      admin: adminId,
      members: groupMembers
    });

    const populatedGroup = await Group.findById(newGroup._id)
      .populate('members', 'username profilePicture checkMark')
      .populate('admin', 'username profilePicture checkMark')
      .populate('coAdmins', 'username profilePicture checkMark');

    res.status(201).json({ success: true, group: populatedGroup });
  } catch (error) {
    console.error('Lỗi khi tạo nhóm:', error);
    res.status(500).json({ success: false, message: 'Lỗi server khi tạo nhóm' });
  }
};

export const getUserGroups = async (req, res) => {
  try {
    const userId = req.user.id;

    const groups = await Group.find({ members: userId })
      .populate('members', 'username profilePicture checkMark')
      .populate('admin', 'username profilePicture checkMark')
      .populate('coAdmins', 'username profilePicture checkMark')
      .sort({ updatedAt: -1 });

    res.status(200).json({ success: true, groups });
  } catch (error) {
    console.error('Lỗi khi lấy danh sách nhóm:', error);
    res.status(500).json({ success: false, message: 'Lỗi server khi lấy danh sách nhóm' });
  }
};

export const addGroupMembers = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { members } = req.body;
    const userId = req.user.id;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhóm' });
    }

    // Admin or coAdmin can add members
    const isAdmin = group.admin.toString() === userId;
    const isCoAdmin = group.coAdmins.some(id => id.toString() === userId);

    if (!isAdmin && !isCoAdmin) {
      return res.status(403).json({ success: false, message: 'Chỉ quản trị viên hoặc phó nhóm mới có thể thêm thành viên' });
    }

    if (!members || !Array.isArray(members) || members.length === 0) {
       return res.status(400).json({ success: false, message: 'Danh sách thành viên không hợp lệ' });
    }

    const newMembers = members.filter(id => !group.members.includes(id));
    
    if(newMembers.length > 0) {
        group.members.push(...newMembers);
        await group.save();
    }

    const updatedGroup = await Group.findById(groupId)
      .populate('members', 'username profilePicture checkMark')
      .populate('admin', 'username profilePicture checkMark')
      .populate('coAdmins', 'username profilePicture checkMark');
    res.status(200).json({ success: true, group: updatedGroup });

  } catch (error) {
    console.error('Lỗi khi thêm thành viên:', error);
    res.status(500).json({ success: false, message: 'Lỗi server khi thêm thành viên' });
  }
};

export const removeGroupMember = async (req, res) => {
  try {
    const { groupId, memberId } = req.params;
    const userId = req.user.id;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhóm' });
    }

    const isAdmin = group.admin.toString() === userId;
    const isCoAdmin = group.coAdmins.some(id => id.toString() === userId);
    const isSelf = memberId === userId;
    const targetIsAdmin = group.admin.toString() === memberId;
    const targetIsCoAdmin = group.coAdmins.some(id => id.toString() === memberId);

    // Permissions:
    // - Self can always leave.
    // - Admin can remove anyone.
    // - CoAdmin can only remove normal members.

    if (!isSelf && !isAdmin && !isCoAdmin) {
      return res.status(403).json({ success: false, message: 'Không có quyền thực hiện hành động này' });
    }

    if (isCoAdmin && !isAdmin && !isSelf) {
      if (targetIsAdmin || targetIsCoAdmin) {
         return res.status(403).json({ success: false, message: 'Phó nhóm không thể xóa Quản trị viên hoặc Phó nhóm khác' });
      }
    }

    if (targetIsAdmin && !isSelf) {
      return res.status(400).json({ success: false, message: 'Không thể xóa Quản trị viên gốc khỏi nhóm' });
    }

    group.members = group.members.filter(id => id.toString() !== memberId);
    group.coAdmins = group.coAdmins.filter(id => id.toString() !== memberId);
    await group.save();

    const updatedGroup = await Group.findById(groupId)
      .populate('members', 'username profilePicture checkMark')
      .populate('admin', 'username profilePicture checkMark')
      .populate('coAdmins', 'username profilePicture checkMark');

    res.status(200).json({ success: true, message: 'Đã xóa thành viên khỏi nhóm', group: updatedGroup });
  } catch (error) {
    console.error('Lỗi khi xóa thành viên:', error);
    res.status(500).json({ success: false, message: 'Lỗi server khi xóa thành viên' });
  }
};

export const updateMemberRole = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { memberId, role } = req.body; // role: 'coAdmin' | 'member'
    const userId = req.user.id;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhóm' });
    }

    if (group.admin.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Chỉ Quản trị viên gốc mới có quyền phân quyền' });
    }

    if (!group.members.includes(memberId)) {
      return res.status(400).json({ success: false, message: 'Người dùng không thuộc nhóm này' });
    }

    if (memberId === group.admin.toString()) {
      return res.status(400).json({ success: false, message: 'Không thể thay đổi quyền của Quản trị viên gốc' });
    }

    if (role === 'coAdmin') {
      if (!group.coAdmins.includes(memberId)) {
        group.coAdmins.push(memberId);
      }
    } else if (role === 'member') {
      group.coAdmins = group.coAdmins.filter(id => id.toString() !== memberId);
    } else {
      return res.status(400).json({ success: false, message: 'Quyền không hợp lệ' });
    }

    await group.save();

    const updatedGroup = await Group.findById(groupId)
      .populate('members', 'username profilePicture checkMark')
      .populate('admin', 'username profilePicture checkMark')
      .populate('coAdmins', 'username profilePicture checkMark');

    res.status(200).json({ success: true, group: updatedGroup });
  } catch (error) {
    console.error('Lỗi khi phân quyền:', error);
    res.status(500).json({ success: false, message: 'Lỗi server khi phân quyền' });
  }
};
