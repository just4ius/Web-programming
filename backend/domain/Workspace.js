// Робочий простір = компанія. Усі сторінки, файли й оргструктура належать одному простору.
const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ye', ж: 'zh', з: 'z', и: 'y',
  і: 'i', ї: 'yi', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's',
  т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'yu', я: 'ya',
  ы: 'y', э: 'e', ё: 'yo', ъ: '',
};

// «ТОВ «Пекарня Колосок»» → "tov-pekarnia-kolosok"
function slugify(name) {
  const slug = String(name)
    .toLowerCase()
    .split('')
    .map((ch) => (TRANSLIT[ch] !== undefined ? TRANSLIT[ch] : ch))
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return slug || 'company';
}

class Workspace {
  constructor({ id, name, slug, createdAt = null }) {
    this.id = id;
    this.name = name;
    this.slug = slug;
    this.createdAt = createdAt;
  }

  rename(newName) {
    this.name = newName;
  }
}

Workspace.slugify = slugify;

module.exports = Workspace;
