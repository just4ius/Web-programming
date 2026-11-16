// Інформація про компанію та головна сторінка (лічильники)
const v = require('./validate');

class WorkspaceService {
  constructor({ workspaceRepository }) {
    this.repo = workspaceRepository;
  }

  async overview(actor) {
    v.requirePermission(actor, 'content:read');
    const [workspace, stats] = await Promise.all([
      this.repo.findById(actor.workspaceId),
      this.repo.stats(actor.workspaceId),
    ]);
    return { ...workspace, stats };
  }

  async rename(actor, dto) {
    v.requirePermission(actor, 'workspace:manage');
    v.body(dto);
    const name = v.text(dto.name, 'name', { min: 2, max: 100, code: 'COMPANY_NAME_INVALID' });
    return this.repo.rename(actor.workspaceId, name);
  }
}

module.exports = WorkspaceService;
