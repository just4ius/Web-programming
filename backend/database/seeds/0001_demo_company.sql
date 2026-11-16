-- Демо-дані: вигадана компанія ТОВ «Пекарня Колосок».
-- Тестові акаунти (пароль для всіх: demo12345):
--   owner@kolosok.demo  — Олена Коваль, власниця (Owner)
--   hr@kolosok.demo     — Ірина Мельник, HR-менеджерка (Editor)
--   staff@kolosok.demo  — Андрій Бойко, пекар (Viewer)
-- Скрипт ідемпотентний: якщо компанія вже є, нічого не змінюється.

INSERT INTO items (name)
SELECT 'test1' WHERE NOT EXISTS (SELECT 1 FROM items WHERE name = 'test1');

CREATE OR REPLACE FUNCTION pg_temp.seed_page(p_ws INT, p_parent INT, p_title TEXT, p_icon TEXT, p_pos INT, p_user INT)
RETURNS INT AS $$
  INSERT INTO pages (workspace_id, parent_id, title, icon, position, created_by, updated_by)
  VALUES (p_ws, p_parent, p_title, p_icon, p_pos, p_user, p_user)
  RETURNING id;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION pg_temp.seed_block(p_page INT, p_pos INT, p_type TEXT, p_content TEXT, p_data JSONB DEFAULT '{}'::jsonb)
RETURNS VOID AS $$
  INSERT INTO blocks (page_id, position, type, content, data)
  VALUES (p_page, p_pos, p_type, p_content, p_data);
$$ LANGUAGE sql;

DO $$
DECLARE
  hash CONSTANT TEXT := '$2b$10$0nqo6D6DE6bj7LnqENKIRu3EXx91H8uTDR3xwfX0X4eWtCUh01N86';
  ws INT; u_owner INT; u_hr INT; u_staff INT;
  p_statut INT; p_rules INT; p_jobs INT; p_onb INT; p INT;
  p_job_dir INT; p_job_acc INT; p_job_baker INT; p_job_hr INT; p_job_sales INT;
  d_dir INT; d_acc INT; d_prod INT; d_sales INT; d_hr INT;
  pos_dir INT; pos_hr INT; pos_baker INT;
BEGIN
  IF EXISTS (SELECT 1 FROM workspaces WHERE slug = 'kolosok') THEN
    RAISE NOTICE 'Демо-компанія вже існує, пропускаю';
    RETURN;
  END IF;

  INSERT INTO workspaces (name, slug) VALUES ('ТОВ «Пекарня Колосок»', 'kolosok') RETURNING id INTO ws;

  INSERT INTO users (name, email, password_hash) VALUES ('Олена Коваль', 'owner@kolosok.demo', hash) RETURNING id INTO u_owner;
  INSERT INTO users (name, email, password_hash) VALUES ('Ірина Мельник', 'hr@kolosok.demo', hash) RETURNING id INTO u_hr;
  INSERT INTO users (name, email, password_hash) VALUES ('Андрій Бойко', 'staff@kolosok.demo', hash) RETURNING id INTO u_staff;

  -- ===== Статутні документи =====
  p_statut := pg_temp.seed_page(ws, NULL, 'Статутні документи', '📜', 0, u_owner);

  p := pg_temp.seed_page(ws, p_statut, 'Статут ТОВ «Пекарня Колосок»', '📄', 0, u_owner);
  PERFORM pg_temp.seed_block(p, 0, 'callout', 'Чинна редакція статуту затверджена загальними зборами учасників. Скан підписаного документа прикріплено нижче.');
  PERFORM pg_temp.seed_block(p, 1, 'h2', '1. Загальні положення');
  PERFORM pg_temp.seed_block(p, 2, 'paragraph', 'Товариство з обмеженою відповідальністю «Пекарня Колосок» є юридичною особою, створеною відповідно до законодавства України.');
  PERFORM pg_temp.seed_block(p, 3, 'h2', '2. Мета та предмет діяльності');
  PERFORM pg_temp.seed_block(p, 4, 'bullet', 'Виробництво хліба та хлібобулочних виробів');
  PERFORM pg_temp.seed_block(p, 5, 'bullet', 'Роздрібна торгівля у власних магазинах');
  PERFORM pg_temp.seed_block(p, 6, 'bullet', 'Доставка продукції закладам громадського харчування');
  PERFORM pg_temp.seed_block(p, 7, 'h2', '3. Статутний капітал');
  PERFORM pg_temp.seed_block(p, 8, 'paragraph', 'Статутний капітал товариства становить 100 000 грн і розподілений між учасниками пропорційно їхнім часткам.');

  p := pg_temp.seed_page(ws, p_statut, 'Реквізити компанії', '🏢', 1, u_owner);
  PERFORM pg_temp.seed_block(p, 0, 'paragraph', 'Актуальні реквізити для договорів і рахунків (демо-дані).');
  PERFORM pg_temp.seed_block(p, 1, 'table', '', '{"rows": [["Поле", "Значення"], ["Повна назва", "ТОВ «Пекарня Колосок»"], ["Код ЄДРПОУ", "00000000 (демо)"], ["Адреса", "м. Луцьк, вул. Хлібна, 1"], ["Директор", "Олена Коваль"], ["Телефон", "+380 00 000 00 00"]]}');

  p := pg_temp.seed_page(ws, p_statut, 'Накази по основній діяльності', '🗂️', 2, u_owner);
  PERFORM pg_temp.seed_block(p, 0, 'paragraph', 'Реєстр наказів директора. Скани підписаних наказів прикріплюються до цієї сторінки.');
  PERFORM pg_temp.seed_block(p, 1, 'table', '', '{"rows": [["№", "Дата", "Зміст"], ["1-ОД", "02.01.2026", "Про облікову політику"], ["2-ОД", "15.01.2026", "Про графік роботи цеху"], ["3-ОД", "01.03.2026", "Про призначення відповідального за охорону праці"]]}');

  -- ===== Регламенти =====
  p_rules := pg_temp.seed_page(ws, NULL, 'Регламенти та процеси', '📘', 1, u_owner);

  p := pg_temp.seed_page(ws, p_rules, 'Регламент відпусток', '🏖️', 0, u_hr);
  PERFORM pg_temp.seed_block(p, 0, 'paragraph', 'Щорічна основна відпустка — 24 календарні дні. Заява подається не пізніше ніж за 2 тижні.');
  PERFORM pg_temp.seed_block(p, 1, 'h3', 'Порядок оформлення');
  PERFORM pg_temp.seed_block(p, 2, 'numbered', 'Працівник погоджує дати з керівником відділу');
  PERFORM pg_temp.seed_block(p, 3, 'numbered', 'Подає заяву HR-менеджеру');
  PERFORM pg_temp.seed_block(p, 4, 'numbered', 'HR готує наказ, директор підписує');
  PERFORM pg_temp.seed_block(p, 5, 'quote', 'Відпускні виплачуються не пізніше ніж за 3 дні до початку відпустки.');

  p := pg_temp.seed_page(ws, p_rules, 'Санітарні норми цеху', '🧼', 1, u_owner);
  PERFORM pg_temp.seed_block(p, 0, 'callout', 'Обов''язково для всіх працівників виробництва.');
  PERFORM pg_temp.seed_block(p, 1, 'todo', 'Перед зміною: спецодяг, шапочка, рукавички', '{"checked": false}');
  PERFORM pg_temp.seed_block(p, 2, 'todo', 'Дезінфекція робочих поверхонь кожні 2 години', '{"checked": false}');
  PERFORM pg_temp.seed_block(p, 3, 'todo', 'Запис температури печей у журнал', '{"checked": false}');

  -- ===== Посадові інструкції =====
  p_jobs := pg_temp.seed_page(ws, NULL, 'Посадові інструкції', '👔', 2, u_hr);
  p_job_dir := pg_temp.seed_page(ws, p_jobs, 'Директор', '🧭', 0, u_hr);
  PERFORM pg_temp.seed_block(p_job_dir, 0, 'h2', 'Обов''язки');
  PERFORM pg_temp.seed_block(p_job_dir, 1, 'bullet', 'Загальне керівництво діяльністю компанії');
  PERFORM pg_temp.seed_block(p_job_dir, 2, 'bullet', 'Підписання договорів і наказів');
  p_job_acc := pg_temp.seed_page(ws, p_jobs, 'Головний бухгалтер', '🧮', 1, u_hr);
  PERFORM pg_temp.seed_block(p_job_acc, 0, 'h2', 'Обов''язки');
  PERFORM pg_temp.seed_block(p_job_acc, 1, 'bullet', 'Ведення бухгалтерського та податкового обліку');
  PERFORM pg_temp.seed_block(p_job_acc, 2, 'bullet', 'Нарахування заробітної плати');
  p_job_baker := pg_temp.seed_page(ws, p_jobs, 'Пекар', '🥖', 2, u_hr);
  PERFORM pg_temp.seed_block(p_job_baker, 0, 'h2', 'Обов''язки');
  PERFORM pg_temp.seed_block(p_job_baker, 1, 'bullet', 'Замішування тіста за технологічними картами');
  PERFORM pg_temp.seed_block(p_job_baker, 2, 'bullet', 'Контроль режимів випікання');
  PERFORM pg_temp.seed_block(p_job_baker, 3, 'h2', 'Режим роботи');
  PERFORM pg_temp.seed_block(p_job_baker, 4, 'paragraph', 'Змінний графік: 04:00–12:00 або 12:00–20:00.');
  p_job_hr := pg_temp.seed_page(ws, p_jobs, 'HR-менеджер', '🤝', 3, u_hr);
  PERFORM pg_temp.seed_block(p_job_hr, 0, 'bullet', 'Підбір і адаптація персоналу');
  PERFORM pg_temp.seed_block(p_job_hr, 1, 'bullet', 'Кадрове діловодство');
  p_job_sales := pg_temp.seed_page(ws, p_jobs, 'Менеджер з продажу', '📈', 4, u_hr);
  PERFORM pg_temp.seed_block(p_job_sales, 0, 'bullet', 'Робота з кав''ярнями та ресторанами-клієнтами');
  PERFORM pg_temp.seed_block(p_job_sales, 1, 'bullet', 'Прийом замовлень і контроль доставки');

  -- ===== Онбординг =====
  p_onb := pg_temp.seed_page(ws, NULL, 'Онбординг нового працівника', '🚀', 3, u_hr);
  PERFORM pg_temp.seed_block(p_onb, 0, 'h1', 'Ласкаво просимо до «Колоска»!');
  PERFORM pg_temp.seed_block(p_onb, 1, 'paragraph', 'Ця сторінка допоможе пройти перший тиждень без стресу.');
  PERFORM pg_temp.seed_block(p_onb, 2, 'todo', 'Ознайомитися зі статутом і санітарними нормами', '{"checked": true}');
  PERFORM pg_temp.seed_block(p_onb, 3, 'todo', 'Отримати спецодяг', '{"checked": false}');
  PERFORM pg_temp.seed_block(p_onb, 4, 'todo', 'Пройти інструктаж з охорони праці', '{"checked": false}');
  PERFORM pg_temp.seed_block(p_onb, 5, 'divider', '');
  PERFORM pg_temp.seed_block(p_onb, 6, 'paragraph', 'Питання щодо графіка — до HR-менеджера, щодо технологій — до старшого пекаря.');

  -- ===== Оргструктура =====
  INSERT INTO departments (workspace_id, parent_id, name, description, position)
    VALUES (ws, NULL, 'Дирекція', 'Керівництво компанії', 0) RETURNING id INTO d_dir;
  INSERT INTO departments (workspace_id, parent_id, name, description, position)
    VALUES (ws, d_dir, 'Бухгалтерія', 'Фінанси, податки, зарплата', 0) RETURNING id INTO d_acc;
  INSERT INTO departments (workspace_id, parent_id, name, description, position)
    VALUES (ws, d_dir, 'Виробничий цех', 'Випікання хліба та кондитерських виробів', 1) RETURNING id INTO d_prod;
  INSERT INTO departments (workspace_id, parent_id, name, description, position)
    VALUES (ws, d_dir, 'Відділ продажу', 'Клієнти та доставка', 2) RETURNING id INTO d_sales;
  INSERT INTO departments (workspace_id, parent_id, name, description, position)
    VALUES (ws, d_dir, 'Відділ кадрів', 'Персонал і навчання', 3) RETURNING id INTO d_hr;

  INSERT INTO positions (workspace_id, department_id, title, responsibilities, headcount, instruction_page_id)
    VALUES (ws, d_dir, 'Директор', 'Керівництво, підписання договорів і наказів', 1, p_job_dir) RETURNING id INTO pos_dir;
  INSERT INTO positions (workspace_id, department_id, title, responsibilities, headcount, instruction_page_id)
    VALUES (ws, d_acc, 'Головний бухгалтер', 'Облік, звітність, зарплата', 1, p_job_acc);
  INSERT INTO positions (workspace_id, department_id, title, responsibilities, headcount, instruction_page_id)
    VALUES (ws, d_prod, 'Пекар', 'Виготовлення продукції за технологічними картами', 6, p_job_baker) RETURNING id INTO pos_baker;
  INSERT INTO positions (workspace_id, department_id, title, responsibilities, headcount, instruction_page_id)
    VALUES (ws, d_sales, 'Менеджер з продажу', 'Робота з клієнтами B2B', 2, p_job_sales);
  INSERT INTO positions (workspace_id, department_id, title, responsibilities, headcount, instruction_page_id)
    VALUES (ws, d_hr, 'HR-менеджер', 'Підбір, адаптація, кадрові документи', 1, p_job_hr) RETURNING id INTO pos_hr;

  INSERT INTO workspace_members (workspace_id, user_id, role, position_id) VALUES
    (ws, u_owner, 'owner', pos_dir),
    (ws, u_hr, 'editor', pos_hr),
    (ws, u_staff, 'viewer', pos_baker);

  -- Невеликий текстовий файл як приклад вкладення
  INSERT INTO attachments (workspace_id, page_id, file_name, mime_type, size_bytes, data, uploaded_by)
  SELECT ws, (SELECT id FROM pages WHERE workspace_id = ws AND title = 'Статут ТОВ «Пекарня Колосок»'),
         'Статут_витяг.txt', 'text/plain', octet_length(convert_to(t, 'UTF8')), convert_to(t, 'UTF8'), u_owner
  FROM (SELECT 'Витяг зі статуту ТОВ «Пекарня Колосок» (демо-файл).' AS t) s;
END $$;
