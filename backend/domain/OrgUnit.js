// Оргструктура: відділ (може бути вкладеним) і посада всередині відділу

class Department {
  constructor({ id, workspaceId, parentId = null, name, description = '', position = 0 }) {
    this.id = id;
    this.workspaceId = workspaceId;
    this.parentId = parentId;
    this.name = name;
    this.description = description;
    this.position = position;
  }
}

class Position {
  constructor({ id, workspaceId, departmentId, title, responsibilities = '', headcount = 1, instructionPageId = null }) {
    this.id = id;
    this.workspaceId = workspaceId;
    this.departmentId = departmentId;
    this.title = title;
    this.responsibilities = responsibilities;
    this.headcount = headcount;
    this.instructionPageId = instructionPageId;
  }
}

// Чи створить переміщення вузла цикл у дереві? (вузол не може стати нащадком самого себе)
// parentOf — Map(id → parentId) для всіх вузлів дерева
function wouldCreateCycle(nodeId, newParentId, parentOf) {
  let current = newParentId;
  const seen = new Set();
  while (current !== null && current !== undefined) {
    if (Number(current) === Number(nodeId)) return true;
    if (seen.has(current)) return true;
    seen.add(current);
    current = parentOf.get(Number(current)) ?? null;
  }
  return false;
}

module.exports = { Department, Position, wouldCreateCycle };
