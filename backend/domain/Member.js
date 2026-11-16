// Учасник компанії та модель доступу RBAC.
// Ролі впорядковані від найслабшої до найсильнішої: кожна наступна має всі права попередньої.
const ROLES = ['viewer', 'editor', 'admin', 'owner'];

// Мінімальна роль, потрібна для дії
const PERMISSIONS = {
  'content:read': 'viewer',
  'content:write': 'editor',
  'files:write': 'editor',
  'org:manage': 'admin',
  'members:manage': 'admin',
  'workspace:manage': 'admin',
  'trash:purge': 'admin',
};

function isValidRole(role) {
  return ROLES.includes(role);
}

function roleRank(role) {
  return ROLES.indexOf(role);
}

function can(role, permission) {
  const required = PERMISSIONS[permission];
  if (!required || !isValidRole(role)) return false;
  return roleRank(role) >= roleRank(required);
}

class Member {
  constructor({ userId, workspaceId, name, email, role, positionId = null, joinedAt = null }) {
    this.userId = userId;
    this.workspaceId = workspaceId;
    this.name = name;
    this.email = email;
    this.role = role;
    this.positionId = positionId;
    this.joinedAt = joinedAt;
  }

  can(permission) {
    return can(this.role, permission);
  }
}

module.exports = { Member, ROLES, PERMISSIONS, can, isValidRole, roleRank };
