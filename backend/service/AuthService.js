// Реєстрація компанії, вхід і перевірка JWT
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Workspace = require('../domain/Workspace');
const { ConflictError, UnauthorizedError } = require('./errors');
const v = require('./validate');

const DEV_SECRET = 'docuflow-dev-secret-change-me';
const TOKEN_TTL = '12h';

class AuthService {
  constructor({ userRepository, workspaceRepository, memberRepository, jwtSecret = process.env.JWT_SECRET } = {}) {
    this.users = userRepository;
    this.workspaces = workspaceRepository;
    this.members = memberRepository;
    if (!jwtSecret && process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must be set in production');
    }
    this.secret = jwtSecret || DEV_SECRET;
  }

  issueToken(userId, workspaceId) {
    return jwt.sign({ sub: userId, ws: workspaceId }, this.secret, { expiresIn: TOKEN_TTL });
  }

  async register(dto) {
    v.body(dto);
    const companyName = v.text(dto.companyName, 'companyName', { min: 2, max: 100, code: 'COMPANY_NAME_INVALID' });
    const name = v.text(dto.name, 'name', { min: 2, max: 100, code: 'NAME_INVALID' });
    const email = v.email(dto.email);
    const password = v.password(dto.password);

    if (await this.users.findByEmail(email)) {
      throw new ConflictError('User with this email already exists', { code: 'EMAIL_TAKEN', field: 'email' });
    }

    // Унікальний slug: kolosok, kolosok-2, kolosok-3...
    const base = Workspace.slugify(companyName);
    let slug = base;
    for (let i = 2; await this.workspaces.slugExists(slug); i++) {
      slug = `${base}-${i}`;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { workspace, user } = await this.workspaces.createWithOwner({
      name: companyName,
      slug,
      owner: { name, email, passwordHash },
    });

    return {
      token: this.issueToken(user.id, workspace.id),
      user: { id: user.id, name: user.name, email: user.email },
      workspace,
      role: 'owner',
    };
  }

  async login(dto) {
    v.body(dto);
    const email = typeof dto.email === 'string' ? dto.email.trim() : '';
    const password = typeof dto.password === 'string' ? dto.password : '';

    const user = email ? await this.users.findByEmail(email) : null;
    // Однакова відповідь для «немає користувача» і «не той пароль» — не підказуємо зловмиснику
    const valid = user && user.passwordHash && await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError('Invalid email or password', { code: 'INVALID_CREDENTIALS' });
    }

    const membership = await this.members.findFirstForUser(user.id);
    if (!membership) {
      throw new UnauthorizedError('User is not a member of any company', { code: 'NO_WORKSPACE' });
    }
    const workspace = await this.workspaces.findById(membership.workspaceId);

    return {
      token: this.issueToken(user.id, workspace.id),
      user: { id: user.id, name: user.name, email: user.email },
      workspace,
      role: membership.role,
    };
  }

  // Перевірка токена + актуальна роль з бази (якщо роль змінили — діє одразу)
  async authenticate(token) {
    let payload;
    try {
      payload = jwt.verify(token, this.secret);
    } catch {
      throw new UnauthorizedError('Invalid or expired token', { code: 'INVALID_TOKEN' });
    }
    const member = await this.members.find(payload.ws, payload.sub);
    if (!member) {
      throw new UnauthorizedError('Access to this company was revoked', { code: 'ACCESS_REVOKED' });
    }
    return {
      id: member.userId,
      name: member.name,
      email: member.email,
      workspaceId: member.workspaceId,
      role: member.role,
      positionId: member.positionId,
    };
  }

  async me(actor) {
    const workspace = await this.workspaces.findById(actor.workspaceId);
    return { user: { id: actor.id, name: actor.name, email: actor.email }, workspace, role: actor.role, positionId: actor.positionId };
  }
}

module.exports = AuthService;
