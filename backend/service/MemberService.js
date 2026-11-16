// Працівники компанії: додавання, зміна ролі/посади, видалення
const bcrypt = require('bcryptjs');
const { ROLES, isValidRole } = require('../domain/Member');
const { ValidationError, NotFoundError, ConflictError, ForbiddenError } = require('./errors');
const v = require('./validate');

class MemberService {
  constructor({ memberRepository, userRepository, orgRepository }) {
    this.members = memberRepository;
    this.users = userRepository;
    this.org = orgRepository;
  }

  toDTO(m) {
    return {
      userId: m.userId,
      name: m.name,
      email: m.email,
      role: m.role,
      positionId: m.positionId,
      joinedAt: m.joinedAt,
    };
  }

  async list(actor) {
    v.requirePermission(actor, 'content:read');
    return (await this.members.list(actor.workspaceId)).map((m) => this.toDTO(m));
  }

  validateRole(actor, role) {
    if (!isValidRole(role)) {
      throw new ValidationError(`Role must be one of: ${ROLES.join(', ')}`, { code: 'INVALID_ROLE', field: 'role' });
    }
    // Призначити власника може лише власник
    if (role === 'owner' && actor.role !== 'owner') {
      throw new ForbiddenError('Only an owner can grant the owner role', { code: 'OWNER_ONLY' });
    }
    return role;
  }

  async validatePosition(actor, positionId) {
    if (positionId === undefined) return undefined;
    if (positionId === null) return null;
    const pid = v.id(positionId, 'positionId');
    if (!await this.org.getPosition(actor.workspaceId, pid)) {
      throw new NotFoundError(`Position ${pid} not found`, { code: 'POSITION_NOT_FOUND' });
    }
    return pid;
  }

  // Новий працівник отримує тимчасовий пароль від адміністратора
  async add(actor, dto) {
    v.requirePermission(actor, 'members:manage');
    v.body(dto);
    const email = v.email(dto.email);
    const role = this.validateRole(actor, dto.role || 'viewer');
    const positionId = await this.validatePosition(actor, dto.positionId ?? null);

    let user = await this.users.findByEmail(email);
    if (user) {
      if (await this.members.find(actor.workspaceId, user.id)) {
        throw new ConflictError('This person is already a member', { code: 'ALREADY_MEMBER', field: 'email' });
      }
    } else {
      const name = v.text(dto.name, 'name', { min: 2, max: 100, code: 'NAME_INVALID' });
      const passwordHash = await bcrypt.hash(v.password(dto.password), 10);
      user = await this.users.create({ name, email, passwordHash });
    }

    return this.toDTO(await this.members.add(actor.workspaceId, user.id, role, positionId));
  }

  async getTarget(actor, userId) {
    const target = await this.members.find(actor.workspaceId, v.id(userId, 'userId'));
    if (!target) {
      throw new NotFoundError(`Member ${userId} not found`, { code: 'MEMBER_NOT_FOUND' });
    }
    // Адміністратор не може змінювати власника
    if (target.role === 'owner' && actor.role !== 'owner') {
      throw new ForbiddenError('Only an owner can change another owner', { code: 'OWNER_ONLY' });
    }
    return target;
  }

  async ensureNotLastOwner(target) {
    if (target.role === 'owner' && await this.members.countOwners(target.workspaceId) <= 1) {
      throw new ConflictError('Company must have at least one owner', { code: 'LAST_OWNER' });
    }
  }

  async update(actor, userId, dto) {
    v.requirePermission(actor, 'members:manage');
    v.body(dto);
    const target = await this.getTarget(actor, userId);
    const role = dto.role !== undefined ? this.validateRole(actor, dto.role) : undefined;
    const positionId = await this.validatePosition(actor, dto.positionId);

    if (role && role !== 'owner') await this.ensureNotLastOwner(target);

    return this.toDTO(await this.members.update(actor.workspaceId, target.userId, { role, positionId }));
  }

  async remove(actor, userId) {
    v.requirePermission(actor, 'members:manage');
    const target = await this.getTarget(actor, userId);
    await this.ensureNotLastOwner(target);
    await this.members.remove(actor.workspaceId, target.userId);
  }
}

module.exports = MemberService;
