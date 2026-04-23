import express from 'express';
import { verifyToken } from '../middlewares/auth.middleware.js';
import {
  createGroup,
  getUserGroups,
  addGroupMembers,
  removeGroupMember,
  updateMemberRole
} from '../controllers/group.controller.js';

const router = express.Router();

router.post('/', verifyToken, createGroup);
router.get('/', verifyToken, getUserGroups);
router.post('/:groupId/members', verifyToken, addGroupMembers);
router.delete('/:groupId/members/:memberId', verifyToken, removeGroupMember);
router.put('/:groupId/role', verifyToken, updateMemberRole);

export default router;
