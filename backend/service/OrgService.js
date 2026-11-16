// Оргструктура компанії: дерево відділів і посади з посадовими інструкціями
const { wouldCreateCycle } = require('../domain/OrgUnit');
const { ValidationError, NotFoundError } = require('./errors');
const v = require('./validate');

class OrgService {
  constructor({ orgRepository, knowledgeRepository, memberRepository }) {
    this.repo = orgRepository;
    this.pages = knowledgeRepository;
    this.members = memberRepository;
  }

  // Уся оргструктура одним запитом: відділи, посади та працівники на посадах
  async getStructure(actor) {
    v.requirePermission(actor, 'content:read');
    const [departments, positions, members] = await Promise.all([
      this.repo.listDepartments(actor.workspaceId),
      this.repo.listPositions(actor.workspaceId),
      this.members.list(actor.workspaceId),
    ]);
    return {
      departments,
      positions,
      members: members.map((m) => ({ userId: m.userId, name: m.name, role: m.role, positionId: m.positionId })),
    };
  }

  async findDepartment(actor, id, field = 'id') {
    const dept = await this.repo.getDepartment(actor.workspaceId, v.id(id, field));
    if (!dept) throw new NotFoundError(`Department ${id} not found`, { code: 'DEPARTMENT_NOT_FOUND' });
    return dept;
  }

  async createDepartment(actor, dto) {
    v.requirePermission(actor, 'org:manage');
    v.body(dto);
    return this.repo.createDepartment({
      workspaceId: actor.workspaceId,
      parentId: dto.parentId == null ? null : (await this.findDepartment(actor, dto.parentId, 'parentId')).id,
      name: v.text(dto.name, 'name', { min: 2, max: 150, code: 'NAME_INVALID' }),
      description: v.text(dto.description ?? '', 'description', { min: 0, max: 2000 }),
    });
  }

  async updateDepartment(actor, id, dto) {
    v.requirePermission(actor, 'org:manage');
    v.body(dto);
    const dept = await this.findDepartment(actor, id);
    const fields = {
      name: v.text(dto.name, 'name', { min: 2, max: 150, code: 'NAME_INVALID', optional: true }),
      description: v.text(dto.description, 'description', { min: 0, max: 2000, optional: true }),
    };
    if (dto.parentId !== undefined) {
      const parentId = dto.parentId === null ? null : (await this.findDepartment(actor, dto.parentId, 'parentId')).id;
      if (parentId !== null && wouldCreateCycle(dept.id, parentId, await this.repo.getDepartmentParentMap(actor.workspaceId))) {
        throw new ValidationError('A department cannot be moved inside itself', { code: 'DEPARTMENT_CYCLE', field: 'parentId' });
      }
      fields.parentId = parentId;
    }
    return this.repo.updateDepartment(actor.workspaceId, dept.id, fields);
  }

  async deleteDepartment(actor, id) {
    v.requirePermission(actor, 'org:manage');
    const dept = await this.findDepartment(actor, id);
    await this.repo.deleteDepartment(actor.workspaceId, dept.id);
  }

  async validateInstructionPage(actor, pageId) {
    if (pageId === undefined) return undefined;
    if (pageId === null) return null;
    const page = await this.pages.getPage(actor.workspaceId, v.id(pageId, 'instructionPageId'));
    if (!page || page.isArchived) {
      throw new NotFoundError(`Page ${pageId} not found`, { code: 'PAGE_NOT_FOUND' });
    }
    return page.id;
  }

  validateHeadcount(value) {
    if (value === undefined) return undefined;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 1000) {
      throw new ValidationError('Headcount must be an integer 1–1000', { code: 'INVALID_HEADCOUNT', field: 'headcount' });
    }
    return n;
  }

  async createPosition(actor, dto) {
    v.requirePermission(actor, 'org:manage');
    v.body(dto);
    return this.repo.createPosition({
      workspaceId: actor.workspaceId,
      departmentId: (await this.findDepartment(actor, dto.departmentId, 'departmentId')).id,
      title: v.text(dto.title, 'title', { min: 2, max: 150, code: 'TITLE_REQUIRED' }),
      responsibilities: v.text(dto.responsibilities ?? '', 'responsibilities', { min: 0, max: 5000 }),
      headcount: this.validateHeadcount(dto.headcount ?? 1),
      instructionPageId: (await this.validateInstructionPage(actor, dto.instructionPageId ?? null)),
    });
  }

  async updatePosition(actor, id, dto) {
    v.requirePermission(actor, 'org:manage');
    v.body(dto);
    const pos = await this.repo.getPosition(actor.workspaceId, v.id(id, 'id'));
    if (!pos) throw new NotFoundError(`Position ${id} not found`, { code: 'POSITION_NOT_FOUND' });
    return this.repo.updatePosition(actor.workspaceId, pos.id, {
      departmentId: dto.departmentId !== undefined ? (await this.findDepartment(actor, dto.departmentId, 'departmentId')).id : undefined,
      title: v.text(dto.title, 'title', { min: 2, max: 150, code: 'TITLE_REQUIRED', optional: true }),
      responsibilities: v.text(dto.responsibilities, 'responsibilities', { min: 0, max: 5000, optional: true }),
      headcount: this.validateHeadcount(dto.headcount),
      instructionPageId: await this.validateInstructionPage(actor, dto.instructionPageId),
    });
  }

  async deletePosition(actor, id) {
    v.requirePermission(actor, 'org:manage');
    if (!await this.repo.deletePosition(actor.workspaceId, v.id(id, 'id'))) {
      throw new NotFoundError(`Position ${id} not found`, { code: 'POSITION_NOT_FOUND' });
    }
  }
}

module.exports = OrgService;
