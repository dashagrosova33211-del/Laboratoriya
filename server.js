'use strict';

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');

// ─── Импорт локальных движков ─────────────────────────────────────────────────
const calculator = require('./engine/calculator');
const mathModels = require('./engine/math_models');
const expertSystem = require('./engine/expert_system');
const labSimulator = require('./engine/lab_simulator');

// ─── Загрузка баз данных ──────────────────────────────────────────────────────
const DB_PATH = path.join(__dirname, 'data', 'knowledge_base.json');
const HACCP_PATH = path.join(__dirname, 'data', 'haccp_templates.json');
const FUNCTIONAL_PATH = path.join(__dirname, 'data', 'functional_foods.json');

let knowledgeBase = {};
let haccpTemplates = {};
let functionalFoods = {};

function loadDatabases() {
  try {
    knowledgeBase = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    console.log(`[DB] База знаний загружена: ${Object.keys(knowledgeBase.products).length} групп продуктов`);
  } catch (err) {
    console.error('[DB] КРИТИЧЕСКАЯ ОШИБКА: Не удалось загрузить knowledge_base.json:', err.message);
    process.exit(1);
  }
  try {
    haccpTemplates = JSON.parse(fs.readFileSync(HACCP_PATH, 'utf-8'));
    console.log(`[DB] База ХАССП загружена: ${Object.keys(haccpTemplates).length} шаблонов`);
  } catch (err) {
    console.warn('[DB] Предупреждение: haccp_templates.json не найден, используется встроенный модуль.');
    haccpTemplates = {};
  }
  try {
    functionalFoods = JSON.parse(fs.readFileSync(FUNCTIONAL_PATH, 'utf-8'));
    console.log(`[DB] База функциональных продуктов загружена: ${functionalFoods.items.length} карт`);
  } catch (err) {
    console.warn('[DB] Предупреждение: functional_foods.json не найден.');
    functionalFoods = { items: [] };
  }
}

loadDatabases();

// ─── Инициализация приложения ─────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Middleware для передачи БД в запросы ─────────────────────────────────────
app.use((req, res, next) => {
  req.db = knowledgeBase;
  req.haccpDb = haccpTemplates;
  req.functionalDb = functionalFoods;
  next();
});

// ═════════════════════════════════════════════════════════════════════════════
//  РАЗДЕЛ 1: БИБЛИОТЕКА И БАНК ГОСТОВ
// ═════════════════════════════════════════════════════════════════════════════

// GET /api/products — Получить все группы продуктов
app.get('/api/products', (req, res) => {
  const summary = {};
  const db = req.db.products;
  for (const groupKey in db) {
    summary[groupKey] = {
      groupName: db[groupKey].groupName,
      productCount: Object.keys(db[groupKey].items).length,
      description: db[groupKey].description
    };
  }
  res.json({
    status: 'ok',
    totalGroups: Object.keys(summary).length,
    groups: summary
  });
});

// GET /api/products/:group — Получить все продукты группы
app.get('/api/products/:group', (req, res) => {
  const group = req.params.group;
  const db = req.db.products;
  if (!db[group]) {
    return res.status(404).json({ status: 'error', message: `Группа продуктов '${group}' не найдена.` });
  }
  res.json({ status: 'ok', group: db[group] });
});

// GET /api/products/:group/:productId — Полная карточка продукта с ГОСТ
app.get('/api/products/:group/:productId', (req, res) => {
  const { group, productId } = req.params;
  const db = req.db.products;
  if (!db[group] || !db[group].items[productId]) {
    return res.status(404).json({ status: 'error', message: 'Продукт не найден в базе данных.' });
  }
  const product = db[group].items[productId];
  res.json({
    status: 'ok',
    product: {
      ...product,
      verifiedLinks: product.verifiedLinks || [],
      standards: product.standards || {}
    }
  });
});

// GET /api/gosts/search?query= — Поиск по базе ГОСТ
app.get('/api/gosts/search', (req, res) => {
  const query = (req.query.query || '').toLowerCase().trim();
  if (!query) {
    return res.status(400).json({ status: 'error', message: 'Параметр query обязателен.' });
  }
  const results = [];
  const db = req.db.products;
  for (const groupKey in db) {
    for (const productId in db[groupKey].items) {
      const product = db[groupKey].items[productId];
      const std = product.standards || {};
      const matchName = product.name.toLowerCase().includes(query);
      const matchGost = (std.gost || '').toLowerCase().includes(query);
      const matchTrTs = (std.tr_ts || '').toLowerCase().includes(query);
      if (matchName || matchGost || matchTrTs) {
        results.push({
          group: groupKey,
          productId,
          name: product.name,
          gost: std.gost || 'Не указан',
          tr_ts: std.tr_ts || 'Не указан',
          gostTitle: std.gostTitle || '',
          verifiedLinks: product.verifiedLinks || []
        });
      }
    }
  }
  res.json({ status: 'ok', query, resultsCount: results.length, results });
});

// ═════════════════════════════════════════════════════════════════════════════
//  РАЗДЕЛ 2: БАЗА ФУНКЦИОНАЛЬНЫХ ПРОДУКТОВ
// ═════════════════════════════════════════════════════════════════════════════

// GET /api/functional-foods — Все технологические карты инновационных продуктов
app.get('/api/functional-foods', (req, res) => {
  res.json({
    status: 'ok',
    count: req.functionalDb.items.length,
    items: req.functionalDb.items
  });
});

// GET /api/functional-foods/:id — Конкретная технологическая карта
app.get('/api/functional-foods/:id', (req, res) => {
  const id = req.params.id;
  const item = req.functionalDb.items.find(i => i.id === id);
  if (!item) {
    return res.status(404).json({ status: 'error', message: `Технологическая карта '${id}' не найдена.` });
  }
  res.json({ status: 'ok', item });
});

// GET /api/functional-foods/filter/:category — Фильтр по категории
app.get('/api/functional-foods/filter/:category', (req, res) => {
  const category = req.params.category;
  const filtered = req.functionalDb.items.filter(
    i => i.category && i.category.toLowerCase() === category.toLowerCase()
  );
  res.json({ status: 'ok', category, count: filtered.length, items: filtered });
});

// ═════════════════════════════════════════════════════════════════════════════
//  РАЗДЕЛ 3: СИМУЛЯТОР ЛАБОРАТОРНЫХ РАБОТ
// ═════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/lab/init — Инициализация лабораторной работы
 * Body: { productGroup, productId, experimentType }
 * experimentType: "titration" | "drying" | "extraction" | "salt_determination"
 */
app.post('/api/lab/init',
  [
    body('productGroup').notEmpty().withMessage('productGroup обязателен'),
    body('productId').notEmpty().withMessage('productId обязателен'),
    body('experimentType').isIn(['titration', 'drying', 'extraction', 'salt_determination'])
      .withMessage('Некорректный тип эксперимента')
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: 'error', errors: errors.array() });
    }
    const { productGroup, productId, experimentType } = req.body;
    const db = req.db.products;
    if (!db[productGroup] || !db[productGroup].items[productId]) {
      return res.status(404).json({ status: 'error', message: 'Продукт не найден.' });
    }
    const product = db[productGroup].items[productId];
    const labWork = labSimulator.initExperiment(product, experimentType);
    res.json({
      status: 'ok',
      sessionInfo: {
        productName: product.name,
        experimentType,
        standards: product.standards,
        referenceValues: product.physicochemical
      },
      labWork
    });
  }
);

/**
 * POST /api/lab/step — Выполнение конкретного шага лабораторной работы
 * Body: { experimentType, step, rawData: { ... } }
 */
app.post('/api/lab/step',
  [
    body('experimentType').notEmpty(),
    body('step').isInt({ min: 1, max: 5 }).withMessage('Шаг должен быть от 1 до 5'),
    body('rawData').isObject().withMessage('rawData должен быть объектом')
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: 'error', errors: errors.array() });
    }
    const { experimentType, step, rawData } = req.body;
    try {
      const stepResult = labSimulator.executeStep(experimentType, step, rawData);
      res.json({ status: 'ok', step, stepResult });
    } catch (err) {
      res.status(400).json({ status: 'error', message: err.message });
    }
  }
);

/**
 * POST /api/lab/calculate — Финальный расчёт физико-химических показателей
 * Body:
 *   Для titration: { productGroup, productId, sampleMass, naohVolume, naohNormality, coefficient }
 *   Для drying:    { productGroup, productId, sampleMass, massBefore, massAfter }
 *   Для extraction: { productGroup, productId, sampleMass, extractVolume, fatMass }
 *   Для salt_determination: { productGroup, productId, sampleMass, agno3Volume, agno3Normality, coefficient }
 */
app.post('/api/lab/calculate',
  [
    body('productGroup').notEmpty(),
    body('productId').notEmpty(),
    body('calculationType').isIn(['titration', 'drying', 'extraction', 'salt_determination'])
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: 'error', errors: errors.array() });
    }
    const { productGroup, productId, calculationType } = req.body;
    const db = req.db.products;
    if (!db[productGroup] || !db[productGroup].items[productId]) {
      return res.status(404).json({ status: 'error', message: 'Продукт не найден.' });
    }
    const product = db[productGroup].items[productId];
    let result;
    try {
      switch (calculationType) {
        case 'titration':
          result = calculator.calculateAcidity(req.body);
          break;
        case 'drying':
          result = calculator.calculateMoisture(req.body);
          break;
        case 'extraction':
          result = calculator.calculateFatContent(req.body);
          break;
        case 'salt_determination':
          result = calculator.calculateSaltContent(req.body);
          break;
        default:
          throw new Error('Неизвестный тип расчёта');
      }
      res.json({
        status: 'ok',
        calculationType,
        productName: product.name,
        calculationResult: result,
        referenceValues: product.physicochemical,
        standards: product.standards
      });
    } catch (err) {
      res.status(400).json({ status: 'error', message: err.message });
    }
  }
);

// ═════════════════════════════════════════════════════════════════════════════
//  РАЗДЕЛ 4: МАТЕМАТИЧЕСКОЕ МОДЕЛИРОВАНИЕ
// ═════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/math/microbiology/baranyi — Модель кинетики роста Баранья
 * Body: {
 *   N0: начальная концентрация КМАФАнМ (КОЕ/г),
 *   Nmax: максимальная концентрация (КОЕ/г),
 *   temperature: температура хранения (°C),
 *   timeHours: массив временных точек (часы) ИЛИ maxTime + step,
 *   Tmin: минимальная температура роста (°C, по умолчанию -1.5 для мезофилов),
 *   b: коэффициент модели квадратного корня
 * }
 */
app.post('/api/math/microbiology/baranyi',
  [
    body('N0').isFloat({ min: 1 }).withMessage('N0 должно быть > 0'),
    body('Nmax').isFloat({ min: 100 }).withMessage('Nmax должно быть > 100'),
    body('temperature').isFloat().withMessage('Температура обязательна'),
    body('maxTime').isFloat({ min: 1 }).withMessage('maxTime обязателен (часы)')
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: 'error', errors: errors.array() });
    }
    try {
      const modelResult = mathModels.baranyiGrowthModel(req.body);
      res.json({ status: 'ok', model: 'Baranyi & Roberts (1994)', ...modelResult });
    } catch (err) {
      res.status(400).json({ status: 'error', message: err.message });
    }
  }
);

/**
 * POST /api/math/microbiology/wood — Модель Вуда (модифицированная логистика)
 * Альтернативная модель порчи
 */
app.post('/api/math/microbiology/wood',
  [
    body('N0').isFloat({ min: 1 }),
    body('r').isFloat({ min: 0.001 }).withMessage('r — скорость роста (ч⁻¹)'),
    body('maxTime').isFloat({ min: 1 })
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: 'error', errors: errors.array() });
    }
    try {
      const modelResult = mathModels.woodGrowthModel(req.body);
      res.json({ status: 'ok', model: 'Wood Logistic Growth Model', ...modelResult });
    } catch (err) {
      res.status(400).json({ status: 'error', message: err.message });
    }
  }
);

/**
 * POST /api/math/moisture/fick — Диффузия влаги по закону Фика
 * Body: {
 *   M0: начальная влажность (%),
 *   Meq: равновесная влажность (%),
 *   diffusionCoeff: коэффициент диффузии D (м²/с),
 *   thickness: толщина продукта (м),
 *   maxTime: время расчёта (часы),
 *   timeStep: шаг времени (часы)
 * }
 */
app.post('/api/math/moisture/fick',
  [
    body('M0').isFloat({ min: 0, max: 100 }),
    body('Meq').isFloat({ min: 0, max: 100 }),
    body('diffusionCoeff').isFloat({ min: 0 }),
    body('thickness').isFloat({ min: 0 }),
    body('maxTime').isFloat({ min: 1 })
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: 'error', errors: errors.array() });
    }
    try {
      const modelResult = mathModels.fickMoistureDiffusion(req.body);
      res.json({ status: 'ok', model: 'Закон диффузии Фика (2-й закон)', ...modelResult });
    } catch (err) {
      res.status(400).json({ status: 'error', message: err.message });
    }
  }
);

/**
 * POST /api/math/shelf-life — Комплексный прогноз срока годности
 * Объединяет микробиологическую кинетику и влагоперенос
 */
app.post('/api/math/shelf-life', (req, res) => {
  try {
    const {
      productGroup, productId,
      storageTemp, initialMicrobialLoad,
      initialMoisture, storageRH, packaging
    } = req.body;
    const db = req.db.products;
    if (!db[productGroup] || !db[productGroup].items[productId]) {
      return res.status(404).json({ status: 'error', message: 'Продукт не найден.' });
    }
    const product = db[productGroup].items[productId];
    const shelfLifeResult = mathModels.predictShelfLife({
      product,
      storageTemp: parseFloat(storageTemp) || 4,
      initialMicrobialLoad: parseFloat(initialMicrobialLoad) || 1e3,
      initialMoisture: parseFloat(initialMoisture) || (product.physicochemical.moisture?.max || 12),
      storageRH: parseFloat(storageRH) || 75,
      packaging: packaging || 'standard'
    });
    res.json({
      status: 'ok',
      productName: product.name,
      shelfLifeResult
    });
  } catch (err) {
    res.status(400).json({ status: 'error', message: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
//  РАЗДЕЛ 5: ЭКСПЕРТНОЕ ЗАКЛЮЧЕНИЕ И ХАССП
// ═════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/expert/conclusion — Генерация полного экспертного заключения
 * Body: {
 *   productGroup: string,
 *   productId: string,
 *   measuredValues: {
 *     acidity?: number,      // Кислотность, °Т
 *     moisture?: number,     // Влажность, %
 *     fatContent?: number,   // Массовая доля жира, %
 *     proteinContent?: number, // Массовая доля белка, %
 *     saltContent?: number,  // Массовая доля соли, %
 *     kmafanm?: number,      // КМАФАнМ, КОЕ/г
 *     organolепtic?: {
 *       appearance: number,  // Баллы 1-5
 *       smell: number,
 *       taste: number,
 *       texture: number
 *     }
 *   },
 *   storageConditions?: {
 *     temperature: number,
 *     humidity: number,
 *     daysStored: number
 *   },
 *   sampleInfo?: {
 *     batchNumber: string,
 *     manufacturer: string,
 *     samplingDate: string,
 *     labNumber: string
 *   }
 * }
 */
app.post('/api/expert/conclusion',
  [
    body('productGroup').notEmpty().withMessage('productGroup обязателен'),
    body('productId').notEmpty().withMessage('productId обязателен'),
    body('measuredValues').isObject().withMessage('measuredValues должен быть объектом')
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: 'error', errors: errors.array() });
    }
    const { productGroup, productId, measuredValues, storageConditions, sampleInfo } = req.body;
    const db = req.db.products;
    if (!db[productGroup] || !db[productGroup].items[productId]) {
      return res.status(404).json({ status: 'error', message: 'Продукт не найден в базе данных.' });
    }
    const product = db[productGroup].items[productId];
    try {
      const conclusion = expertSystem.generateConclusion({
        product,
        measuredValues,
        storageConditions: storageConditions || null,
        sampleInfo: sampleInfo || {},
        haccpDb: req.haccpDb
      });
      res.json({
        status: 'ok',
        documentType: 'ЭКСПЕРТНОЕ ЗАКЛЮЧЕНИЕ',
        generatedAt: new Date().toISOString(),
        conclusion
      });
    } catch (err) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  }
);

/**
 * POST /api/expert/haccp-analysis — Детальный анализ ХАССП
 * Body: { productGroup, productId, violations: [] }
 */
app.post('/api/expert/haccp-analysis',
  [
    body('productGroup').notEmpty(),
    body('productId').notEmpty(),
    body('violations').isArray().withMessage('violations должен быть массивом')
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: 'error', errors: errors.array() });
    }
    const { productGroup, productId, violations } = req.body;
    const db = req.db.products;
    if (!db[productGroup] || !db[productGroup].items[productId]) {
      return res.status(404).json({ status: 'error', message: 'Продукт не найден.' });
    }
    const product = db[productGroup].items[productId];
    try {
      const haccpReport = expertSystem.generateHACCPReport({
        product,
        productGroup,
        violations,
        haccpDb: req.haccpDb
      });
      res.json({ status: 'ok', haccpReport });
    } catch (err) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  }
);

// GET /api/expert/haccp-ccp/:group — Все ККТ для группы продуктов
app.get('/api/expert/haccp-ccp/:group', (req, res) => {
  const group = req.params.group;
  try {
    const ccps = expertSystem.getCriticalControlPoints(group, req.haccpDb);
    res.json({ status: 'ok', group, criticalControlPoints: ccps });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ─── Служебные маршруты ───────────────────────────────────────────────────────

// GET /api/health — Проверка состояния сервера
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Научно-образовательный комплекс: Лаборатория продовольственной безопасности',
    version: '1.0.0',
    mode: 'АВТОНОМНЫЙ (без внешних ИИ-API)',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    databases: {
      knowledgeBase: Object.keys(knowledgeBase.products || {}).length + ' групп',
      functionalFoods: (functionalFoods.items || []).length + ' технологических карт',
      haccpTemplates: Object.keys(haccpTemplates).length + ' шаблонов'
    }
  });
});

// GET /api/stats — Статистика базы данных
app.get('/api/stats', (req, res) => {
  const db = req.db.products;
  const stats = { totalProducts: 0, groups: {} };
  for (const groupKey in db) {
    const count = Object.keys(db[groupKey].items).length;
    stats.groups[groupKey] = { name: db[groupKey].groupName, count };
    stats.totalProducts += count;
  }
  res.json({ status: 'ok', stats });
});

// Фронтенд SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Глобальный обработчик ошибок ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack);
  res.status(500).json({
    status: 'error',
    message: 'Внутренняя ошибка сервера.',
    detail: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ─── Запуск сервера ───────────────────────────────────────────────────────────
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  НАУЧНО-ОБРАЗОВАТЕЛЬНЫЙ КОМПЛЕКС');
  console.log('  Лаборатория продовольственной безопасности v1.0.0');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Режим: АВТОНОМНЫЙ (100% локальные вычисления)`);
  console.log(`  Адрес: http://127.0.0.1:${PORT}`);
  console.log('═══════════════════════════════════════════════════════════');
});

module.exports = { app, server };
